import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';
import { requestedGuestCapabilities } from '@openchamber/sdk';
import { parseManifestJson } from '@openchamber/sdk/schemas';
import {
  ALLOWANCE_PATH,
  API_ORIGIN,
  AllowanceError,
  AUTH_REJECTED,
  UNEXPECTED_RESPONSE,
  failureFromResponse,
  readAllowance,
} from '../panel/allowance.ts';

/** The allowance doc's own example: an account on the Office Pass, partway through its window. */
const OFFICE_PASS = {
  plan_name: 'Office Pass',
  on_plan: true,
  plan_used_pct: 37,
  plan_exhausted: false,
  used_pct: 12,
  exhausted: false,
  activated: true,
  period_started_at: '2026-11-05T09:12:44.512+00:00',
  period_ends_at: '2026-11-12T09:12:44.512+00:00',
  reset_at: '2026-11-12T09:12:44.512+00:00',
  models: ['deepseek-v4.1-flash:free', 'mimo-v2.6-flash:free'],
  models_enabled: true,
};

const RESET_MS = Date.parse('2026-11-12T09:12:44.512+00:00');

describe('readAllowance', () => {
  test('maps the documented response', () => {
    expect(readAllowance(OFFICE_PASS)).toEqual({
      planName: 'Office Pass',
      onPlan: true,
      plan: { usedPct: 37, exhausted: false },
      free: { usedPct: 12, exhausted: false },
      models: ['deepseek-v4.1-flash:free', 'mimo-v2.6-flash:free'],
      modelsEnabled: true,
      activated: true,
      startedAt: Date.parse('2026-11-05T09:12:44.512+00:00'),
      resetAt: RESET_MS,
    });
  });

  test('ignores the legacy fields the doc says to ignore', () => {
    const allowance = readAllowance({ ...OFFICE_PASS, some_old_field: { nested: true } });
    expect(allowance.plan?.usedPct).toBe(37);
  });

  test('reports no Pass without a Pass bar', () => {
    const allowance = readAllowance({
      ...OFFICE_PASS,
      plan_name: null,
      on_plan: false,
      plan_used_pct: 0,
      plan_exhausted: false,
    });
    expect(allowance.plan).toBeNull();
    expect(allowance.onPlan).toBe(false);
    expect(allowance.free.usedPct).toBe(12);
  });

  test('does not require plan_used_pct when there is no Pass', () => {
    const allowance = readAllowance({ ...OFFICE_PASS, on_plan: false, plan_used_pct: undefined });
    expect(allowance.plan).toBeNull();
  });

  test('tolerates a window that has not started', () => {
    const allowance = readAllowance({
      ...OFFICE_PASS,
      activated: false,
      plan_used_pct: 0,
      used_pct: 0,
      period_started_at: null,
      reset_at: null,
    });
    expect(allowance.activated).toBe(false);
    expect(allowance.startedAt).toBeNull();
    expect(allowance.resetAt).toBeNull();
  });

  test('the exhausted flags decide, not the percentage', () => {
    // The doc: 100 and the flag "do not always happen on the same request".
    const allowance = readAllowance({ ...OFFICE_PASS, used_pct: 100, exhausted: false });
    expect(allowance.free).toEqual({ usedPct: 100, exhausted: false });

    const spent = readAllowance({ ...OFFICE_PASS, plan_used_pct: 99, plan_exhausted: true });
    expect(spent.plan?.exhausted).toBe(true);
  });

  test('clamps a percentage outside 0-100', () => {
    expect(readAllowance({ ...OFFICE_PASS, used_pct: 140 }).free.usedPct).toBe(100);
    expect(readAllowance({ ...OFFICE_PASS, used_pct: -3 }).free.usedPct).toBe(0);
  });

  test('drops model ids that are not strings', () => {
    const allowance = readAllowance({ ...OFFICE_PASS, models: ['a:free', 7, null, 'b:free'] });
    expect(allowance.models).toEqual(['a:free', 'b:free']);
  });

  test('treats a missing models list as empty', () => {
    expect(readAllowance({ ...OFFICE_PASS, models: undefined }).models).toEqual([]);
  });

  test('throws on a missing or mistyped percentage', () => {
    for (const body of [
      { ...OFFICE_PASS, used_pct: undefined },
      { ...OFFICE_PASS, used_pct: '12' },
      { ...OFFICE_PASS, plan_used_pct: null },
      { ...OFFICE_PASS, free_used_pct: 1, plan_used_pct: undefined },
    ]) {
      expect(() => readAllowance(body)).toThrow(UNEXPECTED_RESPONSE);
    }
  });

  test('throws on a body that is not an object', () => {
    for (const body of [null, 'text', 12, ['a']]) {
      expect(() => readAllowance(body)).toThrow(AllowanceError);
    }
  });
});

describe('failureFromResponse', () => {
  test('maps 401 to the paste-a-key message', () => {
    const error = failureFromResponse(401, '{"error":"unauthorized"}');
    expect(error.kind).toBe('auth');
    expect(error.message).toBe(AUTH_REJECTED);
  });

  test('maps an unverified email distinctly', () => {
    const error = failureFromResponse(403, '{"error":"email_verification_required","message":"x"}');
    expect(error.kind).toBe('auth');
    expect(error.message).toContain('verified email');
  });

  test('maps any other 403 to a refusal, not to the email hint', () => {
    const error = failureFromResponse(403, '{"error":"forbidden"}');
    expect(error.kind).toBe('auth');
    expect(error.message).not.toContain('verified email');
  });

  test('classifies a 429 and a 500 as retryable api failures', () => {
    expect(failureFromResponse(429, '').kind).toBe('api');
    const lookup = failureFromResponse(500, '{"error":"lookup_failed"}');
    expect(lookup.kind).toBe('api');
    expect(lookup.message).toContain('Try Refresh');
  });

  test('never echoes an API error body', () => {
    const body = '{"error":"email_verification_required","message":"account thk_live_a1b2c3 belongs to nobody"}';
    const error = failureFromResponse(403, body);
    expect(error.message).not.toContain('thk_live');
    expect(error.message).not.toContain('belongs to nobody');
  });

  test('survives a body that is not JSON', () => {
    expect(failureFromResponse(500, '<html>nope</html>').kind).toBe('api');
    expect(failureFromResponse(401, 'not json').message).toBe(AUTH_REJECTED);
  });
});

describe('allowance request target', () => {
  test('satisfies the host guest-request rules', () => {
    // The host's isGuestRequestPath rejects a path that does not start with
    // '/', so a relative path never reaches the network.
    expect(ALLOWANCE_PATH.startsWith('/')).toBe(true);
    expect(ALLOWANCE_PATH.includes('\\')).toBe(false);
    expect(ALLOWANCE_PATH.includes('://')).toBe(false);
    expect(ALLOWANCE_PATH.split('/').some((segment) => segment === '.' || segment === '..')).toBe(false);
    expect(new URL(ALLOWANCE_PATH, API_ORIGIN).origin).toBe(API_ORIGIN);
  });

  test('stays on the origin the manifest declares', async () => {
    // `host.request` refuses a path outside the declared apiOrigin, so the
    // constant here and the manifest must not drift apart.
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { openchamber: { contributes: { integration: { token: { apiOrigin: string; scheme: string } } } } };
    const token = manifest.openchamber.contributes.integration.token;
    expect(token.apiOrigin).toBe(API_ORIGIN);
    expect(token.scheme).toBe('bearer');
    expect(new URL(ALLOWANCE_PATH, token.apiOrigin).toString()).toBe(`${API_ORIGIN}${ALLOWANCE_PATH}`);
  });
});

describe('package manifest', () => {
  test('parses as an installable extension package and asks only for network', async () => {
    const result = parseManifestJson(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    if (!result.ok) throw new Error(`manifest rejected: ${result.code} — ${result.message}`);
    expect(result.manifest.contributes.panel.entry).toBe('panel/index.html');
    expect(result.manifest.contributes.service).toBeUndefined();
    // `network` follows from the integration alone; the panel needs nothing else.
    expect(requestedGuestCapabilities(result.manifest.contributes)).toEqual(['network']);
  });

  test('ships the panel entry and a bundle built from the current source', async () => {
    const html = await readFile(new URL('../panel/index.html', import.meta.url), 'utf8');
    expect(html).toContain('src="main.js"');
    // Generated by `npm run build` and committed: a stale one would ship an
    // old endpoint to every install, so the constants must appear in it.
    const bundle = await readFile(new URL('../panel/main.js', import.meta.url), 'utf8');
    expect(bundle).toContain(ALLOWANCE_PATH);
    expect(bundle).toContain(AUTH_REJECTED);
  });
});
