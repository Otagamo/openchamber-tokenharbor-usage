// Drives the real panel against happy-dom: no host, no network. Each test is one
// state the allowance API can report, and the assertions are what the user sees.
import './dom.ts';
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';
import { AllowanceError, AUTH_REJECTED, readAllowance, type Allowance } from '../panel/allowance.ts';
import { createApp } from '../panel/app.ts';

/** The allowance doc's own example, with the shape `readAllowance` produces. */
const OFFICE_PASS: Allowance = readAllowance({
  plan_name: 'Office Pass',
  on_plan: true,
  plan_used_pct: 37,
  plan_exhausted: false,
  used_pct: 12,
  exhausted: false,
  activated: true,
  period_started_at: '2026-11-05T09:12:44.512+00:00',
  reset_at: new Date(Date.now() + 3 * 24 * 3_600_000).toISOString(),
  models: ['deepseek-v4.1-flash:free', 'mimo-v2.6-flash:free'],
  models_enabled: true,
});

const mount = (): HTMLElement => {
  const container = document.createElement('div');
  document.body.append(container);
  return container;
};

const text = (container: HTMLElement): string => container.textContent ?? '';

const tones = (container: HTMLElement, selector: string): (string | null)[] => (
  [...container.querySelectorAll(selector)].map((node) => node.getAttribute('data-tone'))
);

describe('panel rendering', () => {
  test('draws both allowances, the window and the free models', async () => {
    const container = mount();
    const app = createApp(container, async () => OFFICE_PASS);
    await app.refresh();

    expect(text(container)).toContain('Token Harbor');
    expect(text(container)).toContain('Office Pass');
    expect(text(container)).toContain('Pass allowance');
    expect(text(container)).toContain('37%');
    expect(text(container)).toContain('Free allowance');
    expect(text(container)).toContain('12%');
    expect(text(container)).toContain('7-day window');
    expect(text(container)).toContain('Resets in 3d');

    expect([...container.querySelectorAll('.usage-chip')].map((chip) => chip.textContent))
      .toEqual(['deepseek-v4.1-flash:free', 'mimo-v2.6-flash:free']);
    // Nothing is spent and free models are on, so no notice is drawn.
    expect(container.querySelectorAll('.oc-sdk-banner').length).toBe(0);
    expect(text(container)).toContain('Updated ');
  });

  test('draws no Pass bar when the account has no Pass', async () => {
    const container = mount();
    const app = createApp(container, async () => ({ ...OFFICE_PASS, planName: null, onPlan: false, plan: null }));
    await app.refresh();

    const body = text(container);
    expect(body).toContain('No Pass on this account');
    expect(body).toContain('No Pass');
    // The free allowance still reads, because the two are independent.
    expect(body).toContain('12%');
  });

  test('marks a spent allowance as an error and explains it', async () => {
    const container = mount();
    const app = createApp(container, async () => ({
      ...OFFICE_PASS,
      plan: { usedPct: 100, exhausted: true },
    }));
    await app.refresh();

    expect(text(container)).toContain('Pass allowance spent');
    expect(tones(container, '.oc-sdk-progress-fill')).toContain('error');
    expect(tones(container, '.oc-sdk-banner')).toContain('warning');
  });

  test('explains a spent free allowance without touching the paid one', async () => {
    const container = mount();
    const app = createApp(container, async () => ({
      ...OFFICE_PASS,
      free: { usedPct: 100, exhausted: true },
    }));
    await app.refresh();

    expect(text(container)).toContain('Free allowance spent');
    expect(text(container)).toContain('Paid models are unaffected');
    expect(tones(container, '.oc-sdk-progress-fill')).toEqual(['info', 'error']);
  });

  test('says free models are off when the account refuses them', async () => {
    const container = mount();
    const app = createApp(container, async () => ({ ...OFFICE_PASS, modelsEnabled: false, models: [] }));
    await app.refresh();

    expect(text(container)).toContain('Free models are turned off');
    expect(text(container)).toContain('None right now');
    expect(tones(container, '.oc-sdk-banner')).toEqual(['info']);
  });

  test('reports a window that has not started', async () => {
    const container = mount();
    const app = createApp(container, async () => ({
      ...OFFICE_PASS,
      activated: false,
      startedAt: null,
      resetAt: null,
      plan: { usedPct: 0, exhausted: false },
      free: { usedPct: 0, exhausted: false },
    }));
    await app.refresh();

    expect(text(container)).toContain('Not started');
    expect(text(container)).not.toContain('Resets in');
  });
});

describe('panel failures', () => {
  test('shows the loader message when the first load fails', async () => {
    const container = mount();
    const app = createApp(container, async () => {
      throw new AllowanceError('auth', AUTH_REJECTED);
    });
    await app.refresh();

    expect(text(container)).toContain(AUTH_REJECTED);
    expect(text(container)).toContain('Allowance unavailable');
    // No stale meters behind the error.
    expect(container.querySelectorAll('.oc-sdk-progress').length).toBe(0);
  });

  test('keeps the last numbers when a later refresh fails', async () => {
    const container = mount();
    let fail = false;
    const app = createApp(container, async () => {
      if (fail) throw new AllowanceError('api', 'Token Harbor could not look up your allowance. Try Refresh.');
      return OFFICE_PASS;
    });
    await app.refresh();
    fail = true;
    await app.refresh();

    expect(text(container)).toContain('Try Refresh');
    expect(text(container)).toContain('Pass allowance');
    expect(text(container)).toContain('37%');
  });

  test('returns to the numbers once a failed refresh succeeds again', async () => {
    const container = mount();
    let fail = true;
    const app = createApp(container, async () => {
      if (fail) throw new AllowanceError('api', 'offline');
      return OFFICE_PASS;
    });
    await app.refresh();
    expect(text(container)).toContain('offline');

    fail = false;
    await app.refresh();
    expect(text(container)).not.toContain('offline');
    expect(text(container)).toContain('37%');
  });

  test('survives a thrown non-Error', async () => {
    const container = mount();
    const app = createApp(container, async () => {
      throw 'something odd';
    });
    await app.refresh();
    expect(text(container)).toContain('Unable to read Token Harbor allowance. Try Refresh.');
  });
});

describe('panel stylesheet', () => {
  /** Every shape the panel can take: notices, no Pass, spent, empty models. */
  const renderShapes = async (): Promise<HTMLElement[]> => {
    const containers: HTMLElement[] = [];
    for (const allowance of [
      OFFICE_PASS,
      { ...OFFICE_PASS, plan: { usedPct: 100, exhausted: true }, free: { usedPct: 100, exhausted: true }, modelsEnabled: false },
      { ...OFFICE_PASS, planName: null, onPlan: false, plan: null, models: [] },
    ]) {
      const container = mount();
      const app = createApp(container, async () => allowance);
      await app.refresh();
      containers.push(container);
    }
    return containers;
  };

  /** Class names the panel draws, ignoring the UI kit's own `oc-sdk-*` ones. */
  const drawnClasses = (containers: HTMLElement[]): Set<string> => {
    const found = new Set<string>();
    for (const container of containers) {
      for (const node of container.querySelectorAll('*')) {
        for (const name of (node.getAttribute('class') ?? '').split(/\s+/)) {
          if (name && !name.startsWith('oc-sdk')) found.add(name);
        }
      }
    }
    return found;
  };

  const styledClasses = (html: string): Set<string> => {
    const style = html
      .slice(html.indexOf('<style>'), html.indexOf('</style>'))
      // Comments name files (`main.js`), which would read as a class selector.
      .replace(/\/\*[\s\S]*?\*\//g, '');
    return new Set(
      [...style.matchAll(/\.([a-z][a-z0-9-]*)/g)]
        .map((match) => match[1])
        .filter((name) => !name.startsWith('oc-sdk')),
    );
  };

  const stylesheetClasses = async (): Promise<Set<string>> => (
    styledClasses(await readFile(new URL('../panel/index.html', import.meta.url), 'utf8'))
  );

  test('has no class drawn by the panel but absent from the stylesheet', async () => {
    const drawn = [...drawnClasses(await renderShapes())];
    const styled = await stylesheetClasses();
    expect(drawn.length).toBeGreaterThan(10);
    expect(drawn.filter((name) => !styled.has(name))).toEqual([]);
  });

  test('has no selector for a class the panel never draws', async () => {
    const drawn = drawnClasses(await renderShapes());
    const styled = [...await stylesheetClasses()];
    expect(styled.length).toBeGreaterThan(10);
    expect(styled.filter((name) => !drawn.has(name))).toEqual([]);
  });
});

describe('panel refresh', () => {
  test('loads once per refresh and reloads from the Refresh button', async () => {
    const container = mount();
    let calls = 0;
    const app = createApp(container, async () => {
      calls += 1;
      return OFFICE_PASS;
    });

    await app.refresh();
    expect(calls).toBe(1);

    const button = container.querySelector('.oc-sdk-btn');
    expect(button).not.toBeNull();
    (button as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
  });

  test('ignores a refresh while one is already in flight', async () => {
    const container = mount();
    let calls = 0;
    let release: (() => void) | null = null;
    const app = createApp(container, async () => {
      calls += 1;
      await new Promise<void>((resolve) => { release = resolve; });
      return OFFICE_PASS;
    });

    const first = app.refresh();
    const second = app.refresh();
    release?.();
    await first;
    await second;
    expect(calls).toBe(1);
  });
});
