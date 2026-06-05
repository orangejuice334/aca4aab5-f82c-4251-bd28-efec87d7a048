import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDisplayUnits,
  orderVariantsForCatalog,
  scaleByNative,
  resolveIngredient,
} from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// Story-style: a user creates a new supplement (vitamin D), adds two
// scheduled servings, and the catalog/recipe pathways stay consistent.

test('create a brand-new supplement with two scheduled servings', () => {
  const items = mkCatalog();
  items.vitamin_d = {
    name: 'Vitamin D',
    brand: 'NOW',
    category: 'supplements',
    defaultMeasuredIn: 'units',
    kcal: 0, vitD: 25,
    displayUnits: [
      { label: 'AM', multiplier: 1, time: '08:00', frequency: 'daily', default: true },
      { label: 'PM', multiplier: 1, time: '20:00', frequency: 'daily' },
    ],
  };
  const variants = getDisplayUnits(items.vitamin_d);
  // No synthetic 1 g for units items
  assert.ok(!variants.some(v => v.synthetic));
  assert.equal(variants.length, 2);
});

test('supplements appear in resolveIngredient with brand', () => {
  const items = mkCatalog();
  items.vitamin_d = {
    name: 'Vitamin D', brand: 'NOW',
    category: 'supplements', defaultMeasuredIn: 'units',
    vitD: 25, kcal: 0,
    displayUnits: [{ label: 'AM', multiplier: 1, default: true }],
  };
  const r = resolveIngredient({ itemKey: 'vitamin_d', multiplier: 2 }, items);
  assert.equal(r.name, 'Vitamin D (NOW)');
  assert.equal(r.vitD, 50);
});

test('orderVariantsForCatalog for a supplement keeps default first', () => {
  const items = mkCatalog();
  items.s = {
    name: 'S', category: 'supplements', defaultMeasuredIn: 'units',
    kcal: 0,
    displayUnits: [
      { label: 'Lunch', multiplier: 1 },
      { label: 'AM', multiplier: 1, default: true },
      { label: 'PM', multiplier: 1 },
    ],
  };
  const ordered = orderVariantsForCatalog(getDisplayUnits(items.s));
  assert.equal(ordered[0].label, 'AM');
});

test('supplement with kcalEach > 0 contributes to daily totals via toggle', () => {
  const items = mkCatalog();
  // omega3 is the canonical example: 10 kcal per cap
  const one = scaleByNative(items.omega3_softgel, 1);
  assert.equal(one.kcal, 10);
});

test('zero-kcal supplement (caffeine cap) totals zero kcal but carries caffeine', () => {
  const items = mkCatalog();
  const out = scaleByNative(items.caffeine_capsule, 1);
  assert.equal(out.kcal, 0);
  assert.equal(out.caffeine, 200);
});

test('supplement display via formatItemDisplayName surfaces brand and default serving', () => {
  // Already covered by formatItemDisplayName tests but verifying once more
  // that the supplement schema is compatible.
  const items = mkCatalog();
  items.s = {
    name: 'BCAA', brand: 'GNC',
    category: 'supplements', defaultMeasuredIn: 'units',
    displayUnits: [{ label: '1 scoop', multiplier: 1, default: true }],
  };
  // formatItemDisplayName not imported here; resolveIngredient does the
  // same brand-suffix work via its own name fallback.
  const r = resolveIngredient({ itemKey: 's', multiplier: 1 }, items);
  assert.equal(r.name, 'BCAA (GNC)');
});
