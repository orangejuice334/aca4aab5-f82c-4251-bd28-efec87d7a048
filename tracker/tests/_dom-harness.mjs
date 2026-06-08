// jsdom harness — load track.html, stub network/storage, return a settled
// window so tests can drive real user interactions.
//
// Boot sequence inside track.html:
//   1. Parse JS, define globals (state, ITEMS, etc.)
//   2. restoreQueue() reads localStorage (we seed empty)
//   3. bindEvents() wires every input
//   4. render() paints initial UI
//   5. loadFromGist() async fetches the worker (we stub to 404 → offline)
//
// We intercept fetch BEFORE the IIFE runs (beforeParse), seed localStorage
// with a known-state payload, then await the gist-load microtask chain so
// `state` and `ITEMS` are populated when tests start poking the DOM.

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(HERE, '..', 'track.html');

// Minimal seed state for a fresh tracker. The on-disk localStorage shape
// is FLAT (matching saveStateLocal output): { days, savedItems, profile,
// sortMode, collapsedGroups, userCatalog: { items, categories } }. Tests
// that pass `seedState: { state: {...} }` are auto-unwrapped below.
const EMPTY_SEED = {
  days: {},
  savedItems: [],
  profile: {},
  userCatalog: { items: {}, categories: [] },
};

function normalizeSeed(seed) {
  if (!seed) return EMPTY_SEED;
  // Accept either the flat localStorage shape OR the gist-wrapped { state: {...} }
  // shape and produce the flat shape.
  if (seed.state && typeof seed.state === 'object') {
    return Object.assign({}, EMPTY_SEED, seed.state);
  }
  return Object.assign({}, EMPTY_SEED, seed);
}

export async function loadTracker({ user = 'lg', seedState = EMPTY_SEED, suppressConsole = true } = {}) {
  const html = readFileSync(HTML_PATH, 'utf8');

  const virtualConsole = new VirtualConsole();
  if (!suppressConsole) {
    // jsdom VirtualConsole exposes either `sendTo(console)` (older) or
    // event-style `on('jsdomError', ...)` (newer). Wire any event we get.
    if (typeof virtualConsole.sendTo === 'function') virtualConsole.sendTo(console);
    else {
      ['log', 'info', 'warn', 'error', 'debug', 'jsdomError'].forEach(ev => {
        virtualConsole.on(ev, (...args) => { try { console[ev === 'jsdomError' ? 'error' : ev](...args); } catch (_) { console.log(ev, ...args); } });
      });
    }
  }

  // Stub all fetches: GETs return an empty-gist 404; POST/PUT just succeed.
  // This forces the page into offline mode (good — no real network).
  const fetchLog = [];
  const fakeFetch = async (url, opts) => {
    fetchLog.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      text: async () => '{}',
      json: async () => ({ files: {} }),
    };
  };

  const dom = new JSDOM(html, {
    url: 'http://localhost/?user=' + encodeURIComponent(user),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      // Seed localStorage with the requested state for THIS user. Keys mirror
      // track.html constants (track.html builds them from USER at runtime).
      const STORAGE_KEY = '19ff6f4d-3d5b-40e6-88e2-573f647f903f-state-' + user;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSeed(seedState)));
      } catch (_) { /* ignore */ }

      // Intercept all fetch calls.
      window.fetch = fakeFetch;

      // Polyfills jsdom doesn't ship: requestIdleCallback (called as a hint
      // by some paths) and a no-op sendBeacon.
      if (!window.requestIdleCallback) {
        window.requestIdleCallback = (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
        window.cancelIdleCallback = (id) => clearTimeout(id);
      }
      if (!window.navigator.sendBeacon) {
        Object.defineProperty(window.navigator, 'sendBeacon', { value: () => true, writable: true });
      }
      // jsdom doesn't ship structuredClone on its window; emitDiffOps's
      // snapshot path needs it. Node's globalThis has it, share it across.
      if (!window.structuredClone && typeof globalThis.structuredClone === 'function') {
        window.structuredClone = (v) => globalThis.structuredClone(v);
      }
    },
  });

  // Let the IIFE finish synchronously, then let microtasks (loadFromGist) run.
  // Two awaits to flush nested Promise chains; the third small timeout covers
  // the setTimeout(..., 0) inside requestIdleCallback shim.
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(r => setTimeout(r, 10));

  return {
    dom,
    window: dom.window,
    doc: dom.window.document,
    fetchLog,
    teardown() { try { dom.window.close(); } catch (_) {} },
  };
}

// Fire an `input` event on a form field after assigning `value`. Mirrors
// what a real keystroke does.
export function typeInto(input, value) {
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

// Fire a `change` event (radio / select flips, blur of typed input).
export function changeTo(input, value) {
  if (input.tagName === 'SELECT' || input.type === 'radio' || input.type === 'checkbox') {
    if (input.type === 'checkbox') input.checked = !!value;
    else if (input.type === 'radio') input.checked = true;
    else input.value = value;
  } else {
    input.value = value;
  }
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

// Tick the event loop N times to let debounced handlers fire.
export async function waitMs(ms) {
  await new Promise(r => setTimeout(r, ms));
}
