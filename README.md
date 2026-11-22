# OpenChamber Token Harbor Usage

A lightweight OpenChamber extension that displays your Token Harbor allowance
directly inside OpenChamber: how much of the current 7-day window your Pass and
your free models have used, whether either is spent, and when the window resets.

## Preview

![Token Harbor Usage panel](assets/preview.png)

The colours come from the host theme, so the panel matches whatever OpenChamber
is set to; this render uses a dark one. Run `npm run preview` to draw the panel
in a browser without installing it, and add `?state=spent` or `?state=none` to
see the spent and no-Pass states.

## Features

- Pass allowance: the plan name, the share of this 7-day window used, and whether
  it is spent
- Free allowance: the share of the free-model allowance used, and whether it is
  spent
- The 7-day window: when it started and a live countdown to the reset that
  restores both allowances
- The `:free` model ids your key can call right now, and whether free models are
  turned on for the account
- Manual refresh, one refresh when the panel opens, and refreshes every five
  minutes while it stays open
- A **Work Status section** in the chat's panel with the same two meters in three
  compact lines, refreshed every minute while it is open

## Requirements

- OpenChamber with extension support (`>=2.2.0`)
- A Token Harbor API key (`thk_live_...`)

### Where the key comes from

**Settings → Integrations → Token Harbor** is the only source. Paste the key
there once; OpenChamber stores it and adds the `Authorization: Bearer` header to
the extension's requests, so the key never passes through the extension itself.

Unlike the Command Code extension this one is modeled on, there is **no local
fallback** (no on-disk login file, no environment variable). Token Harbor issues
its key through the dashboard, not a CLI that logs in on this machine, so there
would be nothing for a fallback to read. Without a stored key the panel says so
and points at the Integrations card.

## Installation

The repository includes the generated `panel/main.js` and `status/status.js`
required by OpenChamber.
Git URL installation does not run `npm install` or compile TypeScript for the
extension, so that file is committed.

1. Open OpenChamber.
2. Go to **Settings → Extensions**.
3. Paste this repository's URL.
4. Click **Add**.
5. Approve the network permission — the extension reads one Token Harbor
   endpoint and nothing else.
6. Paste your Token Harbor API key in **Settings → Integrations → Token Harbor**.

## How it works

```text
OpenChamber panel
    ↓
host.request (Authorization added by the host)
    ↓
GET https://tokenharbor.ai/api/cli/free-tier
```

The panel asks the OpenChamber host for one endpoint on the origin declared in
`package.json` (`https://tokenharbor.ai`). That call has no parameters: the
account is the one the API key belongs to, so a key can only ever read its own
allowance. The call is read-only, free, and does not consume allowance.

### What the numbers are

The API reports **percentages, not money**: it does not say how many dollars of
allowance are used or left. `plan_used_pct` and `used_pct` are integers from 0 to
100, and the Pass allowance and the free allowance are measured separately but
share one window, so a single `reset_at` applies to both.

The panel treats `plan_exhausted` / `exhausted` as the truth about being spent,
not `== 100`: the two do not always happen on the same request.

Source of this contract: <https://tokenharbor.ai/docs/api/allowance>.

## Privacy / Security

- The API key is stored by OpenChamber and attached by the host; the extension
  never reads it from disk and never sees an environment variable.
- The extension reaches exactly one origin, `https://tokenharbor.ai`, declared in
  `package.json` and shown in the install approval dialog.
- The allowance response is read for the fields the panel draws; anything else in
  it is ignored.
- API error bodies are never shown. A failed lookup becomes a short, fixed
  message chosen from the HTTP status and the API's own error token.
- No usage data leaves your machine other than the allowance request itself.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
npm run preview   # the panel in a browser, at http://127.0.0.1:8791
```

- `panel/allowance.ts` holds every rule about the Token Harbor response: parsing,
  clamping, and the failure messages. No DOM, no Node, so it is the part under
  test in `test/allowance.test.ts`.
- `panel/app.ts` draws the panel. `createApp` takes the loader as an argument, so
  `test/app.test.ts` drives every state through happy-dom with no host, no network
  and no browser, down to the class names matching the stylesheet.
- `panel/main.ts` is the OpenChamber entrypoint: it connects the host, makes the
  one request, and hands the answer to `createApp`.
- `panel/main.js` is the browser IIFE OpenChamber loads; run `npm run build` after
  changing the TypeScript. `test/app.test.ts` fails if it no longer matches the
  source that is committed.
- `preview/` is a development-only harness. It renders the real panel with a
  canned allowance against a synthetic host theme, and is not part of the
  extension.

## Scope

- English only. The reference extension also ships `README.zh-CN.md` and
  `README.ja.md`; this one does not.
- No local service process, so there is no `serviceRequest` path and no extra
  permission to approve.
- The panel is a read-only view. Buying a Pass, topping up, or changing "Keep
  working after my Pass allowance runs out" stays in the Token Harbor dashboard.
