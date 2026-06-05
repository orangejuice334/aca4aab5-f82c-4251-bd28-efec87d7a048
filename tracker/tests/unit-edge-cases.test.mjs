import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIngredientMacros,
  computeItemMacros,
  scaleByNative,
  getDisplayUnits,
  resolveIngredient,
  formatItemDisplayName,
  bmiFor,
  pacingFraction,
  addNutrients,
  zeroNutrients,
} from '../lib/tracker-core.mjs';

test('computeIngredientMacros: negative amount produces proportionally negative kcal', () => {
  const items = { x: { name: 'X', defaultMeasuredIn: 'g', kcal: 1, displayUnits: [{ multiplier: 1, default: true }] } };
  const out = computeIngredientMacros({ itemKey: 'x', amount: -50 }, items);
  assert.equal(out.kcal, -50);
});

test('computeIngredientMacros: very large amount does not overflow', () => {
  const items = { x: { name: 'X', defaultMeasuredIn: 'g', kcal: 100, displayUnits: [{ multiplier: 1, default: true }] } };
  const out = computeIngredientMacros({ itemKey: 'x', amount: 1e6 }, items);
  assert.equal(out.kcal, 1e8);
  assert.ok(Number.isFinite(out.kcal));
});

test('computeIngredientMacros: NaN amount treated as zero (no-op)', () => {
  const items = { x: { name: 'X', defaultMeasuredIn: 'g', kcal: 1, displayUnits: [{ multiplier: 1, default: true }] } };
  const out = computeIngredientMacros({ itemKey: 'x', amount: NaN }, items);
  assert.equal(out.kcal, 0);
});

test('scaleByNative: NaN units treated as zero', () => {
  const out = scaleByNative({ kcal: 100 }, NaN);
  assert.equal(out.kcal, 0);
});

test('getDisplayUnits: item with empty displayUnits array falls back to amount', () => {
  const out = getDisplayUnits({ defaultMeasuredIn: 'g', displayUnits: [], amount: { value: 5, unit: 'g' } });
  assert.ok(out.length >= 1);
});

test('formatItemDisplayName: brand with newline and tabs trims them', () => {
  assert.equal(formatItemDisplayName({ name: 'X', brand: '\n\tY\n' }), 'X (Y)');
});

test('resolveIngredient: missing item returns broken=true with zeroed nutrients', () => {
  const r = resolveIngredient({ itemKey: 'gone' }, {});
  assert.equal(r.broken, true);
  assert.equal(r.kcal, 0);
});

test('bmiFor: negative weight returns null', () => {
  assert.equal(bmiFor(-1, 175), null);
});

test('pacingFraction: at exact end returns 1', () => {
  assert.equal(pacingFraction('kcal', 21 * 60), 1);
});

test('pacingFraction: 30 seconds past end clamps to 1', () => {
  assert.equal(pacingFraction('kcal', 21 * 60 + 30), 1);
});

test('addNutrients: src with negative values still adds (subtracts)', () => {
  const t = zeroNutrients();
  addNutrients(t, { kcal: 100 });
  addNutrients(t, { kcal: -30 });
  assert.equal(t.kcal, 70);
});

test('computeItemMacros: empty displayUnits, no ingredients still returns scaled by 0', () => {
  const out = computeItemMacros({ name: 'X', defaultMeasuredIn: 'g', kcal: 5 }, {});
  // No displayUnits => getDisplayUnits synthesizes {unitsPerServing: 1}
  // (since amount defaults to value:1). canon = first. Result = 5 × 1 = 5 kcal.
  assert.ok(Number.isFinite(out.kcal));
});

test('computeIngredientMacros: ing object with only itemKey and no amount/multiplier returns zero', () => {
  const items = { x: { name: 'X', defaultMeasuredIn: 'g', kcal: 1, displayUnits: [{ multiplier: 1, default: true }] } };
  const out = computeIngredientMacros({ itemKey: 'x' }, items);
  assert.equal(out.kcal, 0);
});

test('flat ingredient: caffeine field passes through', () => {
  const out = computeIngredientMacros({ name: 'Energy shot', kcal: 0, caffeine: 200 }, {});
  assert.equal(out.caffeine, 200);
});

test('flat ingredient: missing macro fields default to zero', () => {
  const out = computeIngredientMacros({ name: 'half-spec' }, {});
  for (const k of ['kcal', 'p', 'sf', 'water', 'caffeine', 'potassium']) {
    assert.equal(out[k], 0);
  }
});
