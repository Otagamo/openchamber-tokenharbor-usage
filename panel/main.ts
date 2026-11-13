// The OpenChamber entrypoint: the host connection, and nothing else. All the
// drawing is in app.ts so it can run without a host.

import { connectHost, HostRequestError } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import { ALLOWANCE_PATH, AllowanceError, readAllowanceResponse, type Allowance } from './allowance.ts';
import { createApp } from './app.ts';

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing root');

const hostError = (error: unknown): string => {
  if (!(error instanceof HostRequestError)) return 'Unable to reach Token Harbor. Try Refresh.';
  switch (error.code) {
    case 'NO_INTEGRATION':
      return 'No Token Harbor API key is stored. Add one in Settings → Integrations → Token Harbor, then Refresh.';
    case 'NOT_GRANTED':
      return 'This extension is not allowed to reach the network. Grant it in Settings → Extensions.';
    case 'BAD_PATH':
      return 'The allowance request was refused by OpenChamber. Reinstall the extension.';
    case 'HOST_TIMEOUT':
      return 'OpenChamber did not answer in time. Try Refresh.';
    case 'DISABLED':
      return 'This extension is paused. Enable it in Settings → Extensions.';
    default:
      return 'Unable to reach Token Harbor. Try Refresh.';
  }
};

/**
 * The whole network path: one GET through the host's integration, which adds the
 * Authorization header from the key stored in Settings → Integrations. A host
 * refusal arrives as a fixed phrase; the response itself is read by allowance.ts.
 */
const loadAllowance = async (): Promise<Allowance> => {
  try {
    return readAllowanceResponse(await host.request({ method: 'GET', path: ALLOWANCE_PATH }));
  } catch (error) {
    if (error instanceof AllowanceError) throw error;
    throw new AllowanceError('api', hostError(error));
  }
};

let started = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (started) return;
  started = true;
  const app = createApp(root, loadAllowance);
  void app.refresh();
  // The API caches its answer for 15 seconds; five minutes keeps the panel
  // current without polling it.
  window.setInterval(() => { void app.refresh(); }, 5 * 60 * 1000);
});
