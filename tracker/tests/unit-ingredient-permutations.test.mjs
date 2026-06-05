import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIngredientMacros } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// Sweep over a matrix of ingredient shapes and source types to make sure
// every combination resolves to a finite-non-negative kcal.

const linkedAmounts = [0, 1, 50, 100, 1000];
const linkedMults   = [0, 0.5, 1, 2, 10];

const sourceKeys = [
  'salmon_atlantic_cooked',  // g
  'soy_milk_unsw',           // ml
  'omega3_softgel',          // units
  'scrambled_feggs',         // recipe
  'string_cheese',           // g, single-variant
];

for (const k of sourceKeys) {
  for (const amount of linkedAmounts) {
    test(`computeIngredientMacros amount-form: ${k} amount=${amount}`, () => {
      const out = computeIngredientMacros({ itemKey: k, amount }, mkCatalog());
      assert.ok(Number.isFinite(out.kcal));
      assert.ok(out.kcal >= 0);
    });
  }
  for (const multiplier of linkedMults) {
    test(`computeIngredientMacros multiplier-form: ${k} ×${multiplier}`, () => {
      const out = computeIngredientMacros({ itemKey: k, multiplier }, mkCatalog());
      assert.ok(Number.isFinite(out.kcal));
      assert.ok(out.kcal >= 0);
    });
  }
}

test('amount=0 always returns zero kcal across all source types', () => {
  for (const k of sourceKeys) {
    const out = computeIngredientMacros({ itemKey: k, amount: 0 }, mkCatalog());
    assert.equal(out.kcal, 0, 'kcal not zero for ' + k);
  }
});

test('multiplier=0 always returns zero kcal across all source types', () => {
  for (const k of sourceKeys) {
    const out = computeIngredientMacros({ itemKey: k, multiplier: 0 }, mkCatalog());
    assert.equal(out.kcal, 0);
  }
});

test('doubling the amount/multiplier doubles the kcal (linearity check)', () => {
  for (const k of sourceKeys) {
    const items = mkCatalog();
    const a = computeIngredientMacros({ itemKey: k, multiplier: 1 }, items);
    const b = computeIngredientMacros({ itemKey: k, multiplier: 2 }, items);
    if (a.kcal === 0) continue;
    assert.ok(Math.abs(b.kcal - 2 * a.kcal) < 0.01, 'non-linear for ' + k);
  }
});

test('per-100 amount-form and multiplier-form agree when scaled against the DEFAULT variant', () => {
  const items = mkCatalog();
  // salmon's DEFAULT variant is "3 oz portion" (85 g). multiplier=1
  // resolves against the default, so 1 × 85 = 85 g. Match with amount=85.
  const a = computeIngredientMacros({ itemKey: 'salmon_atlantic_cooked', amount: 85 }, items);
  const b = computeIngredientMacros({ itemKey: 'salmon_atlantic_cooked', multiplier: 1 }, items);
  assert.ok(Math.abs(a.kcal - b.kcal) < 0.01);
});

test('ingredient with both amount and multiplier set: amount wins (per-100) / multiplier wins (recipe)', () => {
  // For per-100 sources, the resolver prefers amount when present.
  const items = mkCatalog();
  const r1 = computeIngredientMacros({ itemKey: 'salmon_atlantic_cooked', amount: 100, multiplier: 99 }, items);
  assert.ok(Math.abs(r1.kcal - 208) < 0.01);
  // For recipe sources, the resolver prefers multiplier (which is fraction of batch).
  const r2 = computeIngredientMacros({ itemKey: 'scrambled_feggs', multiplier: 0.5, amount: 9999 }, items);
  // Expect half batch (~367), not 9999/912*734
  assert.ok(Math.abs(r2.kcal - 367) < 1);
});
