// happy-dom registered as globals before the UI kit is evaluated. Imported
// first by the render tests, so `document`, `Node` and `HTMLStyleElement` exist
// by the time `panel/app.ts` pulls in `@openchamber/sdk/ui`.
import { Window } from 'happy-dom';

const browser = new Window({ url: 'https://localhost/' });

Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  Node: browser.Node,
  HTMLStyleElement: browser.HTMLStyleElement,
});
