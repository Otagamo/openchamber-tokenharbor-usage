// Pure allowance derivation: no DOM, no node imports. The panel bundle inlines
// this file and the tests import it directly, so every rule about the Token
// Harbor response lives here and nowhere else.

/** The one origin `host.request` may reach; must match the manifest's apiOrigin. */
export const API_ORIGIN = 'https://tokenharbor.ai';

/**
 * The allowance endpoint: one GET, no parameters (the account is the key's own).
 * The leading slash is required: the host's `isGuestRequestPath` rejects a path
 * that does not start with one, so `host.request` would fail before it ever
 * reached the network.
 */
export const ALLOWANCE_PATH = '/api/cli/free-tier';

export type FailureKind = 'auth' | 'api' | 'invalid';

export class AllowanceError extends Error {
  readonly kind: FailureKind;

  constructor(kind: FailureKind, message: string) {
    super(message);
    this.name = 'AllowanceError';
    this.kind = kind;
  }
}

/** One of the two allowances: a share of the window used, and whether it is spent. */
export type Meter = {
  /** Integer 0-100, as the API reports it. */
  usedPct: number;
  /** Use the flag, not `usedPct === 100`: the two do not always agree. */
  exhausted: boolean;
};

export type Allowance = {
  planName: string | null;
  /** Whether a Pass is active. When false there is no Pass bar to draw. */
  onPlan: boolean;
  plan: Meter | null;
  free: Meter;
  /** `:free` model ids the key can call right now. */
  models: string[];
  modelsEnabled: boolean;
  /** False until the first request starts the 7-day window. */
  activated: boolean;
  startedAt: number | null;
  /** Ends the window and restores both allowances. Shared by both meters. */
  resetAt: number | null;
};

export const UNEXPECTED_RESPONSE = 'Token Harbor returned an unexpected response.';

export const AUTH_REJECTED =
  'Token Harbor rejected the API key. Paste a valid key in Settings → Integrations → Token Harbor, then Refresh.';

const LOOKUP_FAILED = 'Token Harbor could not look up your allowance. Try Refresh.';

const asRecord = (value: unknown): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const asPercent = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AllowanceError('invalid', UNEXPECTED_RESPONSE);
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const asIsoMs = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Map the allowance response into the shape the panel renders.
 *
 * Only the fields the panel draws are validated, so a response that grows extra
 * fields the doc calls "kept for older clients" keeps working. A missing or
 * mistyped percentage is a real contract break and throws.
 */
export const readAllowance = (value: unknown): Allowance => {
  const data = asRecord(value);
  if (!data) throw new AllowanceError('invalid', UNEXPECTED_RESPONSE);

  const onPlan = data.on_plan === true;
  return {
    planName: typeof data.plan_name === 'string' ? data.plan_name : null,
    onPlan,
    // `plan_used_pct` is only meaningful while a Pass is active; the doc reports
    // 0 with a null plan_name otherwise, so swallowing a missing one is right.
    plan: onPlan
      ? { usedPct: asPercent(data.plan_used_pct), exhausted: data.plan_exhausted === true }
      : null,
    free: { usedPct: asPercent(data.used_pct), exhausted: data.exhausted === true },
    models: Array.isArray(data.models) ? data.models.filter((id): id is string => typeof id === 'string') : [],
    modelsEnabled: data.models_enabled === true,
    activated: data.activated === true,
    startedAt: asIsoMs(data.period_started_at),
    resetAt: asIsoMs(data.reset_at),
  };
};

/**
 * The API's own error token (`unauthorized`, `email_verification_required`,
 * `lookup_failed`). Read only to branch on; never surfaced, so an unexpected
 * body cannot reach the user.
 */
const reportedCode = (body: string): string | null => {
  try {
    const code = asRecord(JSON.parse(body))?.error;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
};

/** Turn a non-200 allowance response into a fixed, non-sensitive failure. */
export const failureFromResponse = (status: number, body: string): AllowanceError => {
  const code = reportedCode(body);
  if (status === 401 || code === 'unauthorized') {
    return new AllowanceError('auth', AUTH_REJECTED);
  }
  if (status === 403) {
    return new AllowanceError(
      'auth',
      code === 'email_verification_required'
        ? 'Token Harbor needs a verified email address on this account before it will report allowance.'
        : 'Token Harbor refused this API key for the allowance lookup.',
    );
  }
  if (status === 429) {
    return new AllowanceError('api', 'Token Harbor is rate limiting this extension. Try Refresh shortly.');
  }
  return new AllowanceError('api', LOOKUP_FAILED);
};

/**
 * The whole answer-to-allowance path, from a `host.request` result. Kept here
 * so the transport (the host) and the view (the panel) both stay free of it.
 */
export const readAllowanceResponse = ({ status, body }: { status: number; body: string }): Allowance => {
  if (status !== 200) throw failureFromResponse(status, body);
  try {
    return readAllowance(JSON.parse(body));
  } catch (error) {
    throw error instanceof AllowanceError ? error : new AllowanceError('invalid', UNEXPECTED_RESPONSE);
  }
};
