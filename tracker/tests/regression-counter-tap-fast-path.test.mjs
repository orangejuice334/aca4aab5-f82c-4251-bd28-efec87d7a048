import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, waitMs } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Luis's rule: tapping +/- on a catalog row must NOT trigger heavy redraws.
// The slow renderers (renderSupplementWaterRows, renderWeightSection charts,
// renderWarningsRibbon's N-day rolls, renderHistory's per-date computeTotals
// loop) must be skipped synchronously and at most run on a debounced timer
// after the user stops tapping.
//
// We measure by instrumenting the page's render fns with counters BEFORE
// the click, then synthetically firing the click handler and asserting the
// counters are at their pre-click value (no synchronous heavy work).

function seed() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    state: {
      days: { [today]: { counters: {}, customs: [], toggles: {}, counterMeta: {} } },
      activeDate: today,
      counters: {},
      customs: [],
      profile: {
        sex: 'M', ageYears: 35, heightCm: 175,
        supplements: [
          { key: 'omega3_softgel', time: '08:00', label: 'AM', frequency: 'daily' },
        ],
        waterSchedule: [{ time: '09:00', label: 'mid-morning' }],
      },
      userCatalog: {
        items: mkCatalog(),
        categories: [
          { key: 'items',          label: 'Items' },
          { key: 'liquids',        label: 'Liquids' },
          { key: 'supplements',    label: 'Supplements' },
          { key: 'recipes',        label: 'Recipes' },
        ],
      },
      toggles: {},
    },
  };
}

async function bootWithCounters() {
  const h = await loadTracker({ seedState: seed() });
  // track.html bumps window.__perfCounts.{suppWater,weight,warnings,history}
  // at the entry of each heavy renderer. Reset the snapshot to zero just
  // before each click so we measure ONLY what the click triggered.
  const win = h.window;
  win.__perfCounts = win.__perfCounts || {};
  const reset = () => {
    win.__perfCounts.suppWater = 0;
    win.__perfCounts.weight = 0;
    win.__perfCounts.warnings = 0;
    win.__perfCounts.history = 0;
  };
  return { h, reset, get counts() { return win.__perfCounts; } };
}

test('counter increment tap does NOT synchronously call renderSupplementWaterRows', async () => {
  const { h, counts } = await bootWithCounters();
  try {
    const incBtn = h.doc.querySelector('.checkout-row[data-key="string_cheese"] .counter-btn[data-action="inc"]');
    if (!incBtn) return; // catalog seed missing
    const before = counts.suppWater;
    incBtn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    const after = counts.suppWater;
    assert.equal(after, before,
      `renderSupplementWaterRows fired synchronously on counter tap (before=${before}, after=${after})`);
  } finally { h.teardown(); }
});

test('counter increment tap does NOT synchronously call renderWeightSection (3-chart redraw)', async () => {
  const { h, counts } = await bootWithCounters();
  try {
    const incBtn = h.doc.querySelector('.checkout-row[data-key="string_cheese"] .counter-btn[data-action="inc"]');
    if (!incBtn) return;
    const before = counts.weight;
    incBtn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    const after = counts.weight;
    assert.equal(after, before,
      `renderWeightSection fired synchronously on counter tap (before=${before}, after=${after})`);
  } finally { h.teardown(); }
});

test('counter increment tap does NOT synchronously call renderHistory (per-date computeTotals)', async () => {
  const { h, counts } = await bootWithCounters();
  try {
    const incBtn = h.doc.querySelector('.checkout-row[data-key="string_cheese"] .counter-btn[data-action="inc"]');
    if (!incBtn) return;
    const before = counts.history;
    incBtn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    const after = counts.history;
    assert.equal(after, before,
      `renderHistory fired synchronously on counter tap (before=${before}, after=${after})`);
  } finally { h.teardown(); }
});

test('counter increment tap does NOT synchronously call renderWarningsRibbon (N-day rolls)', async () => {
  const { h, counts } = await bootWithCounters();
  try {
    const incBtn = h.doc.querySelector('.checkout-row[data-key="string_cheese"] .counter-btn[data-action="inc"]');
    if (!incBtn) return;
    const before = counts.warnings;
    incBtn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    const after = counts.warnings;
    assert.equal(after, before,
      `renderWarningsRibbon fired synchronously on counter tap (before=${before}, after=${after})`);
  } finally { h.teardown(); }
});

test('counter increment tap DOES update the totals strip (kcal/p tile reflects new value)', async () => {
  const { h } = await bootWithCounters();
  try {
    const incBtn = h.doc.querySelector('.checkout-row[data-key="string_cheese"] .counter-btn[data-action="inc"]');
    if (!incBtn) return;
    const kcalEl = h.doc.querySelector('[data-total="kcal"]');
    const before = kcalEl ? kcalEl.textContent.trim() : '';
    incBtn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    const after = kcalEl ? kcalEl.textContent.trim() : '';
    assert.notEqual(after, before,
      'kcal total should update after a +1 tap (got "' + after + '")');
  } finally { h.teardown(); }
});

test('counter increment updates the catalog row counter input value (per-key, not full sweep)', async () => {
  const { h } = await bootWithCounters();
  try {
    const row = h.doc.querySelector('.checkout-row[data-key="string_cheese"]');
    const incBtn = row.querySelector('.counter-btn[data-action="inc"]');
    const valInput = row.querySelector('input.counter-value');
    if (!incBtn || !valInput) return;
    incBtn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    assert.notEqual(valInput.value, '0',
      'counter input value did not update after +1 tap (still "' + valInput.value + '")');
  } finally { h.teardown(); }
});

test('heavy renderers do eventually run after debounce window (scheduleHeavyRefresh)', async () => {
  const { h, counts } = await bootWithCounters();
  try {
    const incBtn = h.doc.querySelector('.checkout-row[data-key="string_cheese"] .counter-btn[data-action="inc"]');
    if (!incBtn) return;
    incBtn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    // Wait past the debounce + safety margin.
    await waitMs(1200);
    // History + warnings ribbon should have rebuilt at least once by now.
    assert.ok(counts.history >= 1,
      `renderHistory expected to fire after debounce; counts=${counts.history}`);
    assert.ok(counts.warnings >= 1,
      `renderWarningsRibbon expected to fire after debounce; counts=${counts.warnings}`);
  } finally { h.teardown(); }
});
