import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTracker, typeInto, waitMs } from './_dom-harness.mjs';

// Luis's request: mirror the weight tracker for mood. Same shape:
//   - a daily input (0-10 scale)
//   - a chart section that visualizes historical mood over time
//   - state.days[date].mood + moodMeta, backed by mood_set / mood_clear ops
//   - context-bar input mirrors the checkout-mood input (like weight)

// Boot always resets activeDate to todayKey() (see track.html "reset to
// today on page load"), so tests must seed today's bucket dynamically.
// track.html builds todayKey from LOCAL date components (getFullYear /
// getMonth / getDate) so we mirror that here rather than toISOString(),
// which is UTC and can straddle a day boundary from the local clock.
const TODAY = (() => {
  const d = new Date();
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
})();

function seedWithHistory() {
  return {
    state: {
      activeDate: TODAY,
      days: {
        '2026-07-01': { mood: 7,   moodMeta: '2026-07-01T09:00:00Z', counters: {}, customs: [], toggles: {}, counterMeta: {} },
        '2026-07-02': { mood: 8,   moodMeta: '2026-07-02T09:00:00Z', counters: {}, customs: [], toggles: {}, counterMeta: {} },
        '2026-07-03': { mood: 5,   moodMeta: '2026-07-03T09:00:00Z', counters: {}, customs: [], toggles: {}, counterMeta: {} },
        [TODAY]: { counters: {}, customs: [], toggles: {}, counterMeta: {} },
      },
      customs: [],
      profile: { sex: 'M', ageYears: 35, heightCm: 175 },
      userCatalog: { items: {}, categories: [] },
      toggles: {},
    },
  };
}

test('mood input elements exist (context bar + section) with min=0 max=10', async () => {
  const h = await loadTracker({ seedState: seedWithHistory() });
  try {
    const ctxMood  = h.doc.getElementById('context-bar-mood');
    const sectMood = h.doc.getElementById('checkout-mood');
    assert.ok(ctxMood, 'context-bar-mood input must exist');
    assert.ok(sectMood, 'checkout-mood input must exist');
    for (const el of [ctxMood, sectMood]) {
      assert.equal(el.type, 'number');
      assert.equal(el.getAttribute('min'), '0');
      assert.equal(el.getAttribute('max'), '10');
    }
  } finally { h.teardown(); }
});

test('mood-tracker section exists as its own <section>', async () => {
  const h = await loadTracker({ seedState: seedWithHistory() });
  try {
    const section = h.doc.getElementById('mood-tracker');
    assert.ok(section, '#mood-tracker section must exist');
    assert.equal(section.tagName.toLowerCase(), 'section');
    const chart = section.querySelector('#mood-chart');
    assert.ok(chart, 'mood chart SVG must live inside #mood-tracker');
  } finally { h.teardown(); }
});

test('seeded mood value hydrates into today\'s input on boot', async () => {
  const withToday = seedWithHistory();
  withToday.state.days[TODAY].mood = 6;
  const h = await loadTracker({ seedState: withToday });
  try {
    // Let the async loadFromGist chain + render() settle.
    await waitMs(200);
    // The generic renderWeightSection-style syncInput populates both mirrors.
    const ctxMood  = h.doc.getElementById('context-bar-mood');
    const sectMood = h.doc.getElementById('checkout-mood');
    assert.equal(ctxMood.value, '6', 'context-bar-mood must reflect today\'s stored mood');
    assert.equal(sectMood.value, '6', 'checkout-mood must reflect today\'s stored mood');
  } finally { h.teardown(); }
});

test('typing a mood value mirrors into the context-bar input immediately', async () => {
  const h = await loadTracker({ seedState: seedWithHistory() });
  try {
    const section = h.doc.getElementById('checkout-mood');
    const ctxbar = h.doc.getElementById('context-bar-mood');
    typeInto(section, '7');
    // The generic renderWeightSection sync copies today's bucket value to
    // both mirror inputs; the context bar should mirror the section input
    // per-keystroke via the same commit → renderWeightSection path.
    assert.equal(ctxbar.value, '7', 'context-bar-mood must mirror on keystroke');
  } finally { h.teardown(); }
});

test('typing a mood value fires a mood_set op to the backend', async () => {
  const h = await loadTracker({ seedState: seedWithHistory() });
  try {
    const input = h.doc.getElementById('checkout-mood');
    typeInto(input, '8');
    // Wait past the FLUSH_DEBOUNCE_MS (700ms) so the op is POSTed.
    await waitMs(1000);
    const posts = h.fetchLog
      .filter(e => e.method === 'POST' && /\/ops/.test(e.url))
      .flatMap(e => { try { return JSON.parse(e.body).ops || []; } catch (_) { return []; } });
    const moodOp = posts.find(op => op.type === 'mood_set' && op.value === 8);
    assert.ok(moodOp, 'a mood_set op with value=8 must be POSTed to /ops');
  } finally { h.teardown(); }
});

test('mood_set op handler is present in the Worker source', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const workerSrc = join(here, '..', 'worker', 'src', 'index.js');
  const text = readFileSync(workerSrc, 'utf8');
  assert.ok(/mood_set\s*\(/.test(text), 'Worker must expose a mood_set(state, op) handler');
  assert.ok(/mood_clear\s*\(/.test(text), 'Worker must expose a mood_clear(state, op) handler');
});

test('clearing the mood input fires a mood_clear op', async () => {
  const withToday = seedWithHistory();
  withToday.state.days[TODAY].mood = 5;
  withToday.state.days[TODAY].moodMeta = '2026-07-06T09:00:00Z';
  const h = await loadTracker({ seedState: withToday });
  try {
    const input = h.doc.getElementById('checkout-mood');
    typeInto(input, '');
    await waitMs(1000);
    const posts = h.fetchLog
      .filter(e => e.method === 'POST' && /\/ops/.test(e.url))
      .flatMap(e => { try { return JSON.parse(e.body).ops || []; } catch (_) { return []; } });
    const clearOp = posts.find(op => op.type === 'mood_clear');
    assert.ok(clearOp, 'clearing the mood input must POST a mood_clear op');
  } finally { h.teardown(); }
});
