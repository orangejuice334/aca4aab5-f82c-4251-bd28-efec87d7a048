import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeItemMacros,
  computeIngredientMacros,
  sumIngredientNativeUnits,
  getDisplayUnits,
  resolveIngredient,
} from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('create a fresh recipe, then modify an ingredient amount, totals follow', () => {
  const items = mkCatalog();
  // Build a new recipe in memory: 2 string cheese sticks + 100g salmon
  items.snack = {
    name: 'Cheese + salmon snack',
    category: 'recipes',
    ingredients: [
      { itemKey: 'string_cheese', amount: 42 },
      { itemKey: 'salmon_atlantic_cooked', amount: 100 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 142, default: true, locked: true }],
  };
  let macros = computeItemMacros(items.snack, items);
  const initialKcal = macros.kcal;
  assert.ok(Math.abs(initialKcal - ((80 / 21) * 42 + 2.08 * 100)) < 0.1);
  // Now bump the salmon to 150g
  items.snack.ingredients[1].amount = 150;
  macros = computeItemMacros(items.snack, items);
  assert.ok(Math.abs(macros.kcal - ((80 / 21) * 42 + 2.08 * 150)) < 0.1);
  // Full-recipe variant size should also recompute via sum helper
  const newTotal = sumIngredientNativeUnits(items.snack.ingredients, items);
  assert.equal(newTotal, 42 + 150);
});

test('modify the serving (full-recipe variant grams) tracks ingredient sum', () => {
  const items = mkCatalog();
  items.foo = {
    name: 'Foo',
    category: 'recipes',
    ingredients: [{ itemKey: 'string_cheese', amount: 21 }],
    displayUnits: [{ label: 'full recipe', multiplier: 21, default: true, locked: true }],
  };
  // Add another ingredient
  items.foo.ingredients.push({ itemKey: 'string_cheese', amount: 21 });
  const newSum = sumIngredientNativeUnits(items.foo.ingredients, items);
  assert.equal(newSum, 42);
});

test('add a per-serving variant to a recipe, full-recipe stays the source of truth', () => {
  const items = mkCatalog();
  items.bar = {
    name: 'Bar',
    category: 'recipes',
    ingredients: [{ itemKey: 'egg_substitute', amount: 460 }],
    displayUnits: [
      { label: 'full recipe', multiplier: 460, default: true, locked: true },
      { label: '1 serving (1/2)', multiplier: 230 },
    ],
  };
  const variants = getDisplayUnits(items.bar);
  // Should also gain a synthetic 1 g trailer
  assert.ok(variants.some(v => v.synthetic && v.label === '1 g'));
  // Default = full recipe
  const def = variants.find(v => v.default);
  assert.equal(def.label, 'full recipe');
});

test('resolveIngredient on a freshly-created recipe-as-ingredient computes correctly', () => {
  const items = mkCatalog();
  items.parent = {
    name: 'Parent',
    category: 'recipes',
    ingredients: [
      { itemKey: 'scrambled_feggs', amount: 228 }, // quarter batch (228/912)
      { itemKey: 'string_cheese', amount: 21 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 249, default: true, locked: true }],
  };
  const r = resolveIngredient({ itemKey: 'parent', amount: 249 }, items);
  // Full parent batch macros = quarter scrambled_feggs + 1 stick cheese
  // scrambled_feggs full batch kcal = 734; quarter = 183.5
  // 1 stick = 80 kcal
  assert.ok(Math.abs(r.kcal - (183.5 + 80)) < 0.5);
});

test('recipe full-batch macros do NOT include ingredients pointing to missing items', () => {
  const items = mkCatalog();
  items.broken = {
    name: 'Broken',
    category: 'recipes',
    ingredients: [
      { itemKey: 'string_cheese', amount: 21 },
      { itemKey: 'does_not_exist', amount: 50 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 21, default: true, locked: true }],
  };
  const out = computeItemMacros(items.broken, items);
  assert.ok(Math.abs(out.kcal - 80) < 0.01); // only string_cheese counts
});

test('a fully-zero-amount recipe yields zero macros without error', () => {
  const items = mkCatalog();
  items.empty_amts = {
    name: 'Empty amounts',
    category: 'recipes',
    ingredients: [
      { itemKey: 'string_cheese', amount: 0 },
      { itemKey: 'egg_substitute', amount: 0 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 0, default: true, locked: true }],
  };
  const out = computeItemMacros(items.empty_amts, items);
  assert.equal(out.kcal, 0);
});

test('changing an ingredient from amount to multiplier preserves the gram total', () => {
  const items = mkCatalog();
  // 84 g of string cheese == 4 × 21g sticks
  const viaAmount = computeIngredientMacros({ itemKey: 'string_cheese', amount: 84 }, items);
  const viaMult = computeIngredientMacros({ itemKey: 'string_cheese', multiplier: 4 }, items);
  // string_cheese canonical via getDisplayUnits is "1 stick" (21g default).
  // Note: orderVariantsForCatalog doesn't run here, so canon is the first
  // entry of displayUnits (which is "1 stick" 21g for this fixture).
  assert.ok(Math.abs(viaAmount.kcal - viaMult.kcal) < 0.01);
});

test('a recipe with both flat and linked ingredients sums correctly', () => {
  const items = mkCatalog();
  items.mixed = {
    name: 'Mixed',
    category: 'recipes',
    ingredients: [
      { itemKey: 'string_cheese', amount: 21 }, // 80 kcal
      { name: 'oil', kcal: 120, p: 0, sf: 1, water: 0, caffeine: 0 }, // flat
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 31, default: true, locked: true }],
  };
  const out = computeItemMacros(items.mixed, items);
  assert.ok(Math.abs(out.kcal - 200) < 0.01);
});
