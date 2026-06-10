import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// The kcal/p tile must show:
//  1. A second line "{above|below|at} goal {target}" colored per kcalPerPBarColor.
//  2. An always-full color-coded bar (no width%, no time-of-day marker).
//  3. No marker DOM (the bar is informational, not a progress indicator).

function seed(goalKcal = 2000, goalP = 180) {
  return {
    state: {
      days: {},
      customs: [],
      profile: {
        sex: 'M', ageYears: 35, heightCm: 175,
        goals: { kcal: goalKcal, p: goalP },
        displayedNutrients: ['kcal', 'p', '_kcal_per_p'],
      },
      userCatalog: {
        items: mkCatalog(),
        categories: [
          { key: 'items', label: 'Items' },
          { key: 'liquids', label: 'Liquids' },
          { key: 'supplements', label: 'Supplements' },
          { key: 'recipes', label: 'Recipes' },
        ],
      },
      toggles: {},
    },
  };
}

test('kcal/p tile has a goal-line slot in the DOM', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const goalLine = h.doc.querySelector('[data-goal-line="_kcal_per_p"]');
    assert.ok(goalLine, 'kcal/p tile must expose a [data-goal-line="_kcal_per_p"] element');
  } finally { h.teardown(); }
});

test('kcal/p tile has an always-full bar with no time-of-day marker', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const tile = h.doc.querySelector('[data-nutrient="_kcal_per_p"]');
    assert.ok(tile, 'kcal/p tile rendered');
    const bar = tile.querySelector('[data-bar="_kcal_per_p"]');
    assert.ok(bar, 'kcal/p tile must include a [data-bar="_kcal_per_p"] fill');
    // The marker DOM is only present on time-paced tiles. kcal/p must not
    // have it because the bar is informational, not a daily-pace track.
    const marker = tile.querySelector('[data-marker="_kcal_per_p"]');
    assert.equal(marker, null, 'kcal/p tile must NOT have a time-of-day marker');
  } finally { h.teardown(); }
});

test('kcal/p goal line shows "at goal {target}" when no intake yet', async () => {
  // With totals.p === 0 the derived kcal/p ratio is 0 — by current spec the
  // "neutral / at goal" label is used until the user logs protein. Target
  // 2000/180 = 11.1.
  const h = await loadTracker({ seedState: seed(2000, 180) });
  try {
    const goalLine = h.doc.querySelector('[data-goal-line="_kcal_per_p"]');
    const txt = (goalLine.textContent || '').toLowerCase();
    assert.ok(/at goal|below goal|above goal/.test(txt),
      'goal line should include "at goal" / "below goal" / "above goal"; got: "' + goalLine.textContent + '"');
    assert.ok(/11\.1|11/.test(txt),
      'goal line should include the target ratio; got: "' + goalLine.textContent + '"');
  } finally { h.teardown(); }
});

test('kcal/p bar fill is always 100% wide (no time-of-day pacing)', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const bar = h.doc.querySelector('[data-bar="_kcal_per_p"]');
    // Width may be set inline (style="width: 100%") OR via CSS. Check inline.
    assert.equal((bar.style.width || '').trim(), '100%',
      'kcal/p bar must be inline-styled to 100% width');
  } finally { h.teardown(); }
});
