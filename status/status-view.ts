// What the Work Status section shows, derived from one allowance reading.
//
// Token Harbor's key lives in OpenChamber's Integrations, which only a page can
// reach (`host.request`), so this section is a small page rather than rows the
// host draws. The shape below is what that page renders, and the panel's own
// numbers stay the source of truth.

import type { Allowance, Meter } from '../panel/allowance.ts';

export type StatusMeter = {
  id: string;
  label: string;
  /** Share of the window used, 0-100. */
  usedPct: number;
  exhausted: boolean;
  detail: string;
};

const resetPhrase = (resetAt: number | null): string => (
  resetAt === null ? '' : ` · resets ${new Date(resetAt).toLocaleString()}`
);

const meterDetail = (meter: Meter, resetAt: number | null): string => (
  meter.exhausted ? `Spent${resetPhrase(resetAt)}` : resetPhrase(resetAt).replace(/^ · /, '')
);

/**
 * One line per meter, plus the window state. The Pass meter is left out when
 * there is no Pass, which is what the panel shows too.
 */
export const statusMeters = (allowance: Allowance): StatusMeter[] => {
  const meters: StatusMeter[] = [];
  if (allowance.plan !== null) {
    meters.push({
      id: 'plan',
      label: allowance.planName ?? 'Pass allowance',
      usedPct: allowance.plan.usedPct,
      exhausted: allowance.plan.exhausted,
      detail: meterDetail(allowance.plan, allowance.resetAt),
    });
  }
  meters.push({
    id: 'free',
    label: 'Free allowance',
    usedPct: allowance.free.usedPct,
    exhausted: allowance.free.exhausted,
    detail: meterDetail(allowance.free, allowance.resetAt),
  });
  return meters;
};

/** The line under the meters: the window's state, or that free models are off. */
export const statusNote = (allowance: Allowance): string | null => {
  if (!allowance.modelsEnabled) return 'Free models are turned off on this account';
  if (!allowance.activated) return 'The 7-day window opens with the first request';
  if (allowance.models.length > 0) {
    return `${allowance.models.length} free model${allowance.models.length === 1 ? '' : 's'} available`;
  }
  return null;
};
