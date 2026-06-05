import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleByNative,
  addNutrients,
  zeroNutrients,
  computeItemMacros,
  STORED_NUTRIENT_KEYS,
} from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// Re-implementation of computeTotals semantics over a mock day bucket.
function computeTotals(items, dayBucket) {
  const t = zeroNutrients();
  // Counter loop: each counter[key] = native units consumed
  for (const [key, native] of Object.entries(dayBucket.counters || {})) {
    if (!native) continue;
    const item = items[key];
    if (!item) continue;
    if (item.category === 'recipes' && Array.isArray(item.ingredients) && item.ingredients.length) {
      const batch = computeItemMacros(item, items);
      // recipe counter = native grams; canonical batch grams come from
      // the "full recipe" / first variant
      const canon = (item.displayUnits || [])[0];
      const canonGrams = (canon && (canon.multiplier || canon.unitsPerServing)) || 1;
      const factor = native / canonGrams;
      const scaled = {};
      for (const k of STORED_NUTRIENT_KEYS) scaled[k] = (batch[k] || 0) * factor;
      addNutrients(t, scaled);
    } else {
      addNutrients(t, scaleByNative(item, native));
    }
  }
  // Customs loop
  for (const c of (dayBucket.customs || [])) {
    const n = (c.count != null) ? c.count : 1;
    if (!n) continue;
    const scaled = {};
    for (const k of STORED_NUTRIENT_KEYS) scaled[k] = (c[k] || 0) * n;
    addNutrients(t, scaled);
  }
  // Toggles loop (each toggle = 1 unit of its scheduled-supplement item)
  for (const [tk, on] of Object.entries(dayBucket.toggles || {})) {
    if (!on) continue;
    const itemKey = tk.split('#')[0];
    const item = items[itemKey];
    if (!item) continue;
    addNutrients(t, scaleByNative(item, 1));
  }
  return t;
}

test('day with one weight food counter computes kcal correctly', () => {
  const items = mkCatalog();
  const t = computeTotals(items, {
    counters: { 'string_cheese': 21 }, // one stick
    customs: [],
    toggles: {},
  });
  assert.ok(Math.abs(t.kcal - 80) < 0.01);
});

test('counters + customs combine in totals', () => {
  const items = mkCatalog();
  const t = computeTotals(items, {
    counters: { 'string_cheese': 21 }, // 80 kcal
    customs: [{ name: 'bite', kcal: 50, p: 0, sf: 0, water: 0, caffeine: 0, count: 1 }],
    toggles: {},
  });
  assert.ok(Math.abs(t.kcal - 130) < 0.01);
});

test('scheduled-supplement toggles add their per-1-unit macros once per checked slot', () => {
  const items = mkCatalog();
  const t = computeTotals(items, {
    counters: {},
    customs: [],
    toggles: { 'omega3_softgel#08:00': true, 'omega3_softgel#12:30': true },
  });
  assert.equal(t.kcal, 20);
  assert.equal(t.omega3, 1440);
});

test('false toggles do not contribute', () => {
  const items = mkCatalog();
  const t = computeTotals(items, {
    counters: {},
    customs: [],
    toggles: { 'omega3_softgel#08:00': false },
  });
  assert.equal(t.kcal, 0);
});

test('recipe counter scales by ingredient sum', () => {
  const items = mkCatalog();
  // 228g of scrambled_feggs (quarter of 912g batch)
  // = 0.25 × 734 = 183.5 kcal
  const t = computeTotals(items, {
    counters: { 'scrambled_feggs': 228 },
    customs: [],
    toggles: {},
  });
  assert.ok(Math.abs(t.kcal - 183.5) < 0.5);
});

test('multiple of the same recipe via counter sums proportionally', () => {
  const items = mkCatalog();
  // 456g = half batch (=367 kcal). Same recipe twice = 912g = 734 kcal
  const t = computeTotals(items, {
    counters: { 'scrambled_feggs': 912 },
    customs: [],
    toggles: {},
  });
  assert.ok(Math.abs(t.kcal - 734) < 0.5);
});

test('custom item with count > 1 multiplies macros', () => {
  const items = mkCatalog();
  const t = computeTotals(items, {
    counters: {},
    customs: [{ name: 'donut', kcal: 250, p: 3, sf: 5, water: 0, caffeine: 0, count: 3 }],
    toggles: {},
  });
  assert.equal(t.kcal, 750);
});

test('zero counter does not crash and contributes zero', () => {
  const items = mkCatalog();
  const t = computeTotals(items, {
    counters: { 'string_cheese': 0 },
    customs: [],
    toggles: {},
  });
  assert.equal(t.kcal, 0);
});

test('empty day bucket yields zero totals', () => {
  const items = mkCatalog();
  const t = computeTotals(items, { counters: {}, customs: [], toggles: {} });
  for (const k of STORED_NUTRIENT_KEYS) assert.equal(t[k], 0);
});

test('counter keyed to missing item is silently skipped', () => {
  const items = mkCatalog();
  const t = computeTotals(items, {
    counters: { 'gone_key': 100, 'string_cheese': 21 },
    customs: [],
    toggles: {},
  });
  // only string_cheese counts
  assert.ok(Math.abs(t.kcal - 80) < 0.01);
});

test('totals include water from a liquid counter', () => {
  const items = mkCatalog();
  const t = computeTotals(items, {
    counters: { 'soy_milk_unsw': 240 }, // 1 cup
    customs: [],
    toggles: {},
  });
  // soy_milk_unsw water per ml = 0.94; 240ml = 225.6
  assert.ok(Math.abs(t.water - 225.6) < 0.5);
});
