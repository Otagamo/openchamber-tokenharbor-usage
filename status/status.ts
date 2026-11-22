// The Work Status surface: the same allowance as the rail panel, in a few
// compact lines. OpenChamber loads this page only while the section is open.

import { connectHost, HostRequestError } from '@openchamber/sdk';
import { applyHostReady, mountProgress } from '@openchamber/sdk/ui';
import type { Tone } from '@openchamber/sdk/ui';
import { ALLOWANCE_PATH, AllowanceError, readAllowanceResponse, type Allowance } from '../panel/allowance.ts';
import { statusMeters, statusNote, type StatusMeter } from './status-view.ts';

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing root');

const hostError = (error: unknown): string => {
  if (!(error instanceof HostRequestError)) return 'Unable to reach Token Harbor.';
  switch (error.code) {
    case 'NO_INTEGRATION':
      return 'Add a Token Harbor key in Settings → Integrations.';
    case 'NOT_GRANTED':
      return 'No network grant for this extension.';
    case 'DISABLED':
      return 'This extension is paused.';
    default:
      return 'Unable to reach Token Harbor.';
  }
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Used share, not remaining: the panel's own bars count what was spent. */
const toneOf = (meter: StatusMeter): Tone => {
  if (meter.exhausted || meter.usedPct >= 100) return 'error';
  if (meter.usedPct >= 80) return 'warning';
  return 'success';
};

const load = async (): Promise<Allowance> => {
  try {
    return readAllowanceResponse(await host.request({ method: 'GET', path: ALLOWANCE_PATH }));
  } catch (error) {
    if (error instanceof AllowanceError) throw error;
    throw new AllowanceError('api', hostError(error));
  }
};

const draw = (allowance: Allowance): void => {
  root.replaceChildren();
  const shell = element('div', 'status-app');
  for (const meter of statusMeters(allowance)) {
    const row = element('div', 'status-row');
    const head = element('div', 'status-head');
    head.append(
      element('span', 'status-label', meter.label),
      element('span', 'status-value', `${meter.usedPct}%`),
    );
    const bar = element('div', 'status-bar');
    mountProgress(bar, { value: meter.usedPct, tone: toneOf(meter) });
    row.append(head, bar);
    if (meter.detail !== '') row.append(element('div', 'status-detail', meter.detail));
    shell.append(row);
  }

  const note = statusNote(allowance);
  if (note !== null) shell.append(element('div', 'status-note', note));
  root.append(shell);
};

const fail = (message: string): void => {
  root.replaceChildren(element('div', 'status-note status-fail', message));
};

const refresh = async (): Promise<void> => {
  try {
    draw(await load());
    void host.setHeight(document.body.scrollHeight);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Unable to read Token Harbor allowance.');
    void host.setHeight(document.body.scrollHeight);
  }
};

let started = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (started) return;
  started = true;
  void refresh();
  // The allowance endpoint caches its answer for 15 s; a minute is plenty here.
  window.setInterval(() => { void refresh(); }, 60_000);
});
