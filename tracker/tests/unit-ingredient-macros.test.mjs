import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIngredientMacros, computeItemMacros } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('flat ingredient (no itemKey) returns its own nutrients as-is', () => {
  const out = computeIngredientMacros({ name: 'salt', kcal: 0, p: 0, sf: 0, sodium: 1000 }, {});
  assert.equal(out.kcal, 0);
  assert.equal(out.sodium, 1000);
});

test('linked per-100 ingredient with amount returns native-scaled macros', () => {
  const items = mkCatalog();
  // salmon: kcal=2.08/g, 100g should give 208 kcal
  const out = computeIngredientMacros({ itemKey: 'salmon_atlantic_cooked', amount: 100 }, items);
  assert.ok(Math.abs(out.kcal - 208) < 0.01);
  assert.ok(Math.abs(out.p - 22.1) < 0.01);
});

test('linked per-100 ingredient with multiplier resolves against canonical serving', () => {
  const items = mkCatalog();
  // string_cheese canonical (after orderVariantsForCatalog) is "1 stick" (21g default).
  // getDisplayUnits returns it in original order, so canon = "1 stick" first.
  const out = computeIngredientMacros({ itemKey: 'string_cheese', multiplier: 2 }, items);
  // 2 * 21g = 42g; kcal = 80/21 * 42 = 160
  assert.ok(Math.abs(out.kcal - 160) < 0.01);
});

test('discrete-unit ingredient (omega-3) resolves multiplier × canonical', () => {
  const items = mkCatalog();
  const out = computeIngredientMacros({ itemKey: 'omega3_softgel', multiplier: 3 }, items);
  // 3 capsules * 10 kcal = 30 kcal
  assert.equal(out.kcal, 30);
  assert.equal(out.omega3, 2160);
});

test('missing itemKey returns zero nutrients', () => {
  const out = computeIngredientMacros({ itemKey: 'does_not_exist', amount: 100 }, mkCatalog());
  assert.equal(out.kcal, 0);
});

test('recipe-as-ingredient with multiplier scales batch macros by fraction', () => {
  const items = mkCatalog();
  // scrambled_feggs batch macros = string_cheese 84g + egg_substitute 828g
  // kcal = (80/21)*84 + 0.5*828 = 320 + 414 = 734
  // half-batch (multiplier 0.5) => 367 kcal
  const out = computeIngredientMacros({ itemKey: 'scrambled_feggs', multiplier: 0.5 }, items);
  assert.ok(Math.abs(out.kcal - 367) < 0.01);
});

test('recipe-as-ingredient with amount divides by canonical batch grams', () => {
  const items = mkCatalog();
  // canonical batch (full recipe variant) = 912 g.
  // 456 g = half batch => 367 kcal
  const out = computeIngredientMacros({ itemKey: 'scrambled_feggs', amount: 456 }, items);
  assert.ok(Math.abs(out.kcal - 367) < 0.01);
});

test('recipe-as-ingredient: zero amount yields zero macros', () => {
  const items = mkCatalog();
  const out = computeIngredientMacros({ itemKey: 'scrambled_feggs', amount: 0 }, items);
  assert.equal(out.kcal, 0);
});

test('cyclic recipe ingredient returns zero, does not blow the stack', () => {
  const items = mkCatalog();
  const out = computeIngredientMacros({ itemKey: 'cycle_a', multiplier: 1 }, items);
  // cycle_a -> cycle_b -> cycle_a: protection returns zero on the second visit
  assert.ok(Number.isFinite(out.kcal));
});

test('empty recipe (no ingredients) computes zero macros', () => {
  const items = mkCatalog();
  const out = computeItemMacros(items.empty_recipe, items);
  assert.equal(out.kcal, 0);
});

test('null ingredient returns zero nutrients without throwing', () => {
  const out = computeIngredientMacros(null, mkCatalog());
  assert.equal(out.kcal, 0);
});

test('computeItemMacros for non-recipe scales by canonical serving', () => {
  const items = mkCatalog();
  // string_cheese canonical = 21 g; kcal/g = 80/21; total = 80
  const out = computeItemMacros(items.string_cheese, items);
  assert.ok(Math.abs(out.kcal - 80) < 0.01);
});

test('computeItemMacros for recipe sums every ingredient', () => {
  const items = mkCatalog();
  const out = computeItemMacros(items.scrambled_feggs, items);
  // 320 (cheese 84g at 80/21 kcal per g) + 414 (egg_sub 828g at 0.5/g) = 734
  assert.ok(Math.abs(out.kcal - 734) < 0.01);
});

test('computeItemMacros for null returns zero nutrients', () => {
  const out = computeItemMacros(null, {});
  assert.equal(out.kcal, 0);
});

test('recipe-as-ingredient nested two levels deep computes correctly', () => {
  const items = mkCatalog();
  // Build a parent recipe that uses scrambled_feggs as an ingredient
  items.parent_recipe = {
    name: 'Big breakfast',
    category: 'recipes',
    ingredients: [
      { itemKey: 'scrambled_feggs', amount: 456 }, // half batch -> 367 kcal
      { itemKey: 'salmon_atlantic_cooked', amount: 100 }, // 208 kcal
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 556, default: true, locked: true }],
  };
  const out = computeItemMacros(items.parent_recipe, items);
  assert.ok(Math.abs(out.kcal - (367 + 208)) < 0.05);
});

test('recipe-as-ingredient resolves with default lookup when no full-recipe variant labeled exactly', () => {
  const items = mkCatalog();
  items.unlabeled_recipe = {
    name: 'No-label batch',
    category: 'recipes',
    ingredients: [{ itemKey: 'string_cheese', amount: 42 }], // 160 kcal
    displayUnits: [{ label: 'batch', multiplier: 42, default: true }],
  };
  // multiplier 0.5 of unlabeled = 80 kcal
  const out = computeIngredientMacros({ itemKey: 'unlabeled_recipe', multiplier: 0.5 }, items);
  assert.ok(Math.abs(out.kcal - 80) < 0.01);
});
