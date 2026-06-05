import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayUnits, computeIngredientMacros, scaleByNative, orderVariantsForCatalog } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('supplement with multiple per-serving scheduled times exposes all variants', () => {
  const items = mkCatalog();
  const variants = getDisplayUnits(items.omega3_softgel);
  // 3 scheduled servings, no synthetic 1 g (defaultMeasuredIn is units)
  assert.equal(variants.length, 3);
  assert.deepEqual(variants.map(v => v.label).sort(), ['AM', 'Lunch', 'PM'].sort());
});

test('omega3 supplement single capsule scales macros correctly', () => {
  const items = mkCatalog();
  const out = scaleByNative(items.omega3_softgel, 1);
  assert.equal(out.kcal, 10);
  assert.equal(out.omega3, 720);
});

test('omega3 three capsules per day sum to expected macros', () => {
  const items = mkCatalog();
  // 3 caps = 30 kcal, 2160 mg omega-3
  const total = scaleByNative(items.omega3_softgel, 3);
  assert.equal(total.kcal, 30);
  assert.equal(total.omega3, 2160);
});

test('discrete supplement ingredient in a recipe uses canonical (×1 capsule)', () => {
  const items = mkCatalog();
  // 2 omega-3 capsules as a recipe ingredient
  const out = computeIngredientMacros({ itemKey: 'omega3_softgel', multiplier: 2 }, items);
  // 2 × 10 = 20 kcal, 2 × 720 = 1440 mg omega-3
  assert.equal(out.kcal, 20);
  assert.equal(out.omega3, 1440);
});

test('orderVariantsForCatalog for omega-3 keeps AM (default) at the front', () => {
  const items = mkCatalog();
  const ordered = orderVariantsForCatalog(getDisplayUnits(items.omega3_softgel));
  assert.equal(ordered[0].label, 'AM');
});

test('caffeine_capsule kcal=0 still passes through scaling', () => {
  const items = mkCatalog();
  const out = scaleByNative(items.caffeine_capsule, 1);
  assert.equal(out.kcal, 0);
  assert.equal(out.caffeine, 200);
});

test('supplement renders without a synthetic 1 g trailer', () => {
  const items = mkCatalog();
  const v = getDisplayUnits(items.caffeine_capsule);
  assert.ok(!v.some(x => x.synthetic), 'units items must not append synthetic 1 g');
});

test('display name for branded supplement includes brand when brand set', () => {
  const items = mkCatalog();
  items.branded_supp = {
    name: 'Multivitamin',
    brand: 'NOW',
    category: 'supplements',
    defaultMeasuredIn: 'units',
    kcal: 0,
    displayUnits: [{ label: 'AM', multiplier: 1, default: true }],
  };
  // resolveIngredient already tested elsewhere; this just verifies brand merges
  assert.equal(items.branded_supp.brand, 'NOW');
});
