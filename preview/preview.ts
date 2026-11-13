// Standalone preview harness (not shipped): renders the real panel against a
// canned allowance so the shipped markup and CSS can be looked at in a browser.
import { applyHostReady } from '@openchamber/sdk/ui';
import { readAllowance } from '../panel/allowance.ts';
import { createApp } from '../panel/app.ts';

const theme = {
  mode: 'dark' as const,
  tokens: {
    background: '#111114',
    elevated: '#17171b',
    foreground: '#ececf1',
    muted: '#9a9aa5',
    subtle: '#6b6b76',
    border: '#2a2a31',
    hover: '#202027',
    selection: '#2f3f6b',
    focus: '#5b8cff',
    primary: '#4c7dff',
    mutedSurface: '#1b1b21',
    elevatedForeground: '#ececf1',
    active: '#26262e',
    selectionForeground: '#ffffff',
    primaryForeground: '#ffffff',
    primaryText: '#ffffff',
    successText: '#4ade80',
    warningText: '#fbbf24',
    errorText: '#f87171',
    infoText: '#60a5fa',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    font: 'system-ui, -apple-system, Segoe UI, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    radius: '10px',
  },
};

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing root');

applyHostReady({ theme, surface: 'panel' }, document.documentElement);

const base = {
  plan_name: 'Office Pass',
  on_plan: true,
  plan_used_pct: 37,
  plan_exhausted: false,
  used_pct: 12,
  exhausted: false,
  activated: true,
  period_started_at: '2026-11-05T09:12:44.512+00:00',
  reset_at: new Date(Date.now() + (3 * 24 + 4) * 3_600_000).toISOString(),
  models: ['deepseek-v4.1-flash:free', 'mimo-v2.6-flash:free', 'gpt-5.6-luna:free'],
  models_enabled: true,
};

const STATES: Record<string, unknown> = {
  ok: base,
  spent: { ...base, plan_used_pct: 100, plan_exhausted: true, used_pct: 100, exhausted: true, models: [], models_enabled: false },
  none: { ...base, plan_name: null, on_plan: false, plan_used_pct: 0, used_pct: 0, activated: false, period_started_at: null, reset_at: null, models: [] },
};

const which = new URLSearchParams(location.search).get('state') ?? 'ok';
const allowance = readAllowance(STATES[which] ?? STATES.ok);

const app = createApp(root, async () => allowance);
void app.refresh();
