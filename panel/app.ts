// The panel itself: everything drawn, and nothing about where the answer came
// from. `createApp` takes a loader, so a test can drive every state with no
// host, no network and no browser. The bundle inlines this file.

import {
  mountBadge,
  mountBanner,
  mountButton,
  mountProgress,
  mountSpinner,
} from '@openchamber/sdk/ui';
import type { Allowance, Meter } from './allowance.ts';

type MountHandle = { dispose: () => void };

/** Reads the allowance; rejects with AllowanceError, whose `message` is shown as is. */
export type AllowanceLoader = () => Promise<Allowance>;

export type AppHandle = { refresh: () => Promise<void> };

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

const formatDateTime = (value: number): string => new Date(value).toLocaleString();

const formatReset = (resetAt: number): { text: string; title: string } => {
  const difference = resetAt - Date.now();
  const absolute = formatDateTime(resetAt);
  if (!Number.isFinite(difference) || difference <= 0) return { text: 'Reset due', title: absolute };

  const minutes = Math.ceil(difference / 60_000);
  if (minutes < 60) return { text: `Resets in ${minutes}m`, title: absolute };
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return {
      text: remainingMinutes ? `Resets in ${hours}h ${remainingMinutes}m` : `Resets in ${hours}h`,
      title: absolute,
    };
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return {
    text: remainingHours ? `Resets in ${days}d ${remainingHours}h` : `Resets in ${days}d`,
    title: absolute,
  };
};

const meterTone = (meter: Meter): 'info' | 'error' => (meter.exhausted ? 'error' : 'info');

const badgeTone = (allowance: Allowance): 'success' | 'warning' | 'neutral' => {
  if (!allowance.onPlan) return 'neutral';
  return allowance.plan?.exhausted ? 'warning' : 'success';
};

/** Format the moment a window resets, for a sentence, or an empty string. */
const resetPhrase = (resetAt: number | null): string => (
  resetAt === null ? '' : ` at ${formatDateTime(resetAt)}`
);

export const createApp = (mount: HTMLElement, load: AllowanceLoader): AppHandle => {
  mount.replaceChildren();
  const shell = element('div', 'usage-app');
  const header = element('header', 'usage-header');
  const titleBlock = element('div', 'usage-title-block');
  titleBlock.append(
    element('h1', undefined, 'Token Harbor'),
    element('div', 'usage-subtitle', 'Pass and free allowance'),
  );
  const badgeSlot = element('div', 'usage-badge');
  const badge = mountBadge(badgeSlot, { label: 'Loading...', tone: 'neutral' });
  header.append(titleBlock, badgeSlot);

  const noticeSlot = element('div', 'usage-notices');
  const messageSlot = element('div', 'usage-message');
  const content = element('div', 'usage-content');
  const footer = element('footer', 'usage-footer');
  const updated = element('span', undefined, 'Not loaded');
  const actions = element('div', 'usage-actions');
  const refreshButton = mountButton(actions, {
    label: 'Refresh',
    size: 'sm',
    variant: 'secondary',
    onClick: () => { void refresh(); },
  });
  footer.append(updated, actions);
  shell.append(header, noticeSlot, messageSlot, content, footer);
  mount.append(shell);

  let current: Allowance | null = null;
  let message: MountHandle | null = null;
  let notices: MountHandle[] = [];
  let contentHandles: MountHandle[] = [];
  let inFlight = false;

  const clearMessage = (): void => {
    message?.dispose();
    message = null;
    messageSlot.replaceChildren();
  };

  const showMessage = (body: string): void => {
    clearMessage();
    message = mountBanner(messageSlot, { tone: 'error', title: 'Allowance unavailable', body });
  };

  const clearNotices = (): void => {
    for (const handle of notices) handle.dispose();
    notices = [];
    noticeSlot.replaceChildren();
  };

  const clearContent = (): void => {
    for (const handle of contentHandles) handle.dispose();
    contentHandles = [];
    content.replaceChildren();
  };

  const showLoading = (): void => {
    clearContent();
    contentHandles.push(mountSpinner(content, { label: 'Loading allowance' }));
  };

  const addMeter = (target: HTMLElement, title: string, meter: Meter): void => {
    const section = element('section', 'usage-section');
    const heading = element('div', 'usage-heading');
    heading.append(
      element('h2', undefined, title),
      element('span', 'usage-percent', `${meter.usedPct}%`),
    );
    const progressSlot = element('div', 'usage-progress');
    const progress = mountProgress(progressSlot, {
      value: meter.usedPct,
      tone: meterTone(meter),
      label: `${title} used`,
    });
    section.append(heading, progressSlot);
    target.append(section);
    contentHandles.push(progress);
  };

  const addUnavailablePass = (target: HTMLElement): void => {
    const section = element('section', 'usage-section usage-unavailable');
    section.append(
      element('div', 'usage-heading', 'Pass allowance'),
      element('div', 'usage-unavailable-copy', 'No Pass on this account'),
    );
    target.append(section);
  };

  const renderWindow = (target: HTMLElement, allowance: Allowance): void => {
    const section = element('section', 'usage-section');
    section.append(element('h2', undefined, '7-day window'));
    if (!allowance.activated) {
      section.append(
        element('div', 'usage-unavailable-copy', 'Not started — the window opens with your first request.'),
      );
    } else {
      if (allowance.startedAt !== null) {
        section.append(element('div', 'usage-reset', `Started ${formatDateTime(allowance.startedAt)}`));
      }
      if (allowance.resetAt !== null) {
        const reset = formatReset(allowance.resetAt);
        const node = element('div', 'usage-reset', reset.text);
        node.title = reset.title;
        section.append(node);
      }
    }
    section.append(
      element('div', 'usage-source', 'The Pass allowance and the free allowance share this window.'),
    );
    target.append(section);
  };

  const renderModels = (target: HTMLElement, allowance: Allowance): void => {
    const section = element('section', 'usage-section');
    const heading = element('div', 'usage-heading');
    heading.append(
      element('h2', undefined, 'Free models available now'),
      element('span', 'usage-percent', String(allowance.models.length)),
    );
    section.append(heading);
    if (allowance.models.length === 0) {
      section.append(element('div', 'usage-unavailable-copy', 'None right now'));
    } else {
      const chips = element('div', 'usage-models');
      for (const id of allowance.models) chips.append(element('span', 'usage-chip', id));
      section.append(chips);
    }
    target.append(section);
  };

  const renderNotices = (allowance: Allowance): void => {
    clearNotices();
    if (allowance.plan?.exhausted) {
      notices.push(mountBanner(noticeSlot, {
        tone: 'warning',
        title: 'Pass allowance spent',
        body: `Covered calls stop until the window resets${resetPhrase(allowance.resetAt)}. A top-up can continue them from your wallet.`,
      }));
    }
    if (allowance.free.exhausted) {
      notices.push(mountBanner(noticeSlot, {
        tone: 'warning',
        title: 'Free allowance spent',
        body: `:free models stop until the window resets${resetPhrase(allowance.resetAt)}. Paid models are unaffected.`,
      }));
    }
    if (!allowance.modelsEnabled) {
      notices.push(mountBanner(noticeSlot, {
        tone: 'info',
        title: 'Free models are turned off',
        body: 'Calls to :free models are refused on this account, whatever the percentage says.',
      }));
    }
  };

  const render = (allowance: Allowance): void => {
    clearContent();
    renderNotices(allowance);
    // The plan name is on the badge, so the Pass meter carries no second copy
    // of it, and free models being off is already a notice.
    if (allowance.plan) addMeter(content, 'Pass allowance', allowance.plan);
    else addUnavailablePass(content);
    addMeter(content, 'Free allowance', allowance.free);
    renderWindow(content, allowance);
    renderModels(content, allowance);
  };

  const refresh = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    refreshButton.update({ loading: true });
    clearMessage();
    if (!current) showLoading();
    try {
      const allowance = await load();
      current = allowance;
      badge.update({
        label: allowance.onPlan ? allowance.planName ?? 'Pass' : 'No Pass',
        tone: badgeTone(allowance),
      });
      render(allowance);
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      // Progress is shown only while there is nothing to keep on screen, so a
      // failed refresh leaves the last known numbers in place.
      if (!current) {
        clearNotices();
        clearContent();
      }
      showMessage(error instanceof Error ? error.message : 'Unable to read Token Harbor allowance. Try Refresh.');
    } finally {
      refreshButton.update({ loading: false });
      inFlight = false;
    }
  };

  return { refresh };
};
