// The Work Status lines: which meters appear and what they say.
import { describe, expect, test } from 'bun:test';
import { readAllowance } from '../panel/allowance.ts';
import { statusMeters, statusNote } from '../status/status-view.ts';

const withPass = readAllowance({
  plan_name: 'Office Pass',
  on_plan: true,
  plan_used_pct: 37,
  plan_exhausted: false,
  used_pct: 12,
  exhausted: false,
  activated: true,
  reset_at: '2026-12-01T00:00:00.000Z',
  models: ['deepseek-v4.1-flash:free'],
  models_enabled: true,
});

const freeOnly = readAllowance({
  on_plan: false,
  used_pct: 100,
  exhausted: true,
  activated: false,
  reset_at: null,
  models: [],
  models_enabled: false,
});

describe('work status lines', () => {
  test('shows the Pass meter first when a Pass is active', () => {
    const meters = statusMeters(withPass);
    expect(meters.map((meter) => meter.id)).toEqual(['plan', 'free']);
    expect(meters[0]?.label).toBe('Office Pass');
    expect(meters[0]?.usedPct).toBe(37);
    expect(meters[0]?.detail).toContain('resets');
  });

  test('drops the Pass line when there is no Pass', () => {
    expect(statusMeters(freeOnly).map((meter) => meter.id)).toEqual(['free']);
    expect(statusMeters(freeOnly)[0]?.exhausted).toBe(true);
  });

  test('explains the window and the free models in one line', () => {
    expect(statusNote(withPass)).toBe('1 free model available');
    expect(statusNote(freeOnly)).toBe('Free models are turned off on this account');
  });
});
