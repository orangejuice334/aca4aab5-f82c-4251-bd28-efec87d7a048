import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeItemMacros,
  sumIngredientNativeUnits,
  servingPickerOptions,
  ingredientPickerOptions,
  getDisplayUnits,
  orderVariantsForCatalog,
} from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// Full story: build a recipe from scratch, then modify an existing
// ingredient amount, then add a new ingredient via the picker flow.
// Every step asserts macros + full-recipe variant grams.

test('create recipe, modify an ingredient amount, then add a new ingredient', () => {
  const items = mkCatalog();

  // STEP 1: create a fresh recipe with two ingredients
  items.workout_meal = {
    name: 'Workout meal',
    category: 'recipes',
    ingredients: [
      { itemKey: 'salmon_atlantic_cooked', amount: 100, label: '100 g' }, // 208 kcal, 22.1 P
      { itemKey: 'string_cheese', amount: 21, label: '1 stick' },          // 80 kcal, 7 P
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 121, default: true, locked: true }],
  };
  // Initial macros = 208 + 80 = 288 kcal, p = 22.1 + 7 = 29.1
  let m = computeItemMacros(items.workout_meal, items);
  assert.ok(Math.abs(m.kcal - 288) < 0.5, `step 1 kcal got ${m.kcal}`);
  assert.ok(Math.abs(m.p - 29.1) < 0.5);
  // Full-recipe variant size matches the ingredient native sum
  let total = sumIngredientNativeUnits(items.workout_meal.ingredients, items);
  assert.equal(total, 121);
  items.workout_meal.displayUnits[0].multiplier = total;

  // STEP 2: modify the salmon amount (100 g -> 150 g) and recompute
  items.workout_meal.ingredients[0].amount = 150;
  m = computeItemMacros(items.workout_meal, items);
  // 150 * 2.08 + 80 = 312 + 80 = 392 kcal
  assert.ok(Math.abs(m.kcal - 392) < 0.5, `step 2 kcal got ${m.kcal}`);
  // p = 150 * 0.221 + 7 = 33.15 + 7 = 40.15
  assert.ok(Math.abs(m.p - 40.15) < 0.5);
  total = sumIngredientNativeUnits(items.workout_meal.ingredients, items);
  assert.equal(total, 171);
  items.workout_meal.displayUnits[0].multiplier = total;

  // STEP 3: add a new ingredient via the picker contract. The picker
  // uses servingPickerOptions to surface variants for the user; we
  // simulate the user picking "1 cup" of soy milk (240 ml).
  const sourceItems = ingredientPickerOptions(items, 'workout_meal');
  // soy_milk_unsw is in the picker
  assert.ok(sourceItems.some(o => o.key === 'soy_milk_unsw'),
    'soy milk should be selectable as an ingredient');
  // User picks soy milk, picker fetches serving options
  const servings = servingPickerOptions(items.soy_milk_unsw);
  // Should include "1 cup", "1 carton (946 ml)", "1 tbsp", "1 ml" (synthetic)
  assert.ok(servings.some(s => s.label === '1 cup'));
  assert.ok(servings.some(s => s.label === '1 ml'));
  // Default = 1 cup (240 ml)
  const def = servings.find(s => s.default);
  assert.equal(def.label, '1 cup');
  assert.equal(def.amount, 240);

  // Commit: push the new ingredient with amount=240 (basis source, ml)
  items.workout_meal.ingredients.push({
    itemKey: 'soy_milk_unsw', amount: def.amount, label: def.label,
  });

  // STEP 4: verify macros now include the soy milk
  m = computeItemMacros(items.workout_meal, items);
  // soy milk kcal = 240 * 0.4 = 96
  assert.ok(Math.abs(m.kcal - (392 + 96)) < 0.5, `step 4 kcal got ${m.kcal}`);
  // water: 240 * 0.94 = 225.6, salmon adds 150*0.65 = 97.5, plus 0 from cheese
  assert.ok(Math.abs(m.water - (97.5 + 225.6)) < 1);

  // Full-recipe variant native total = 171 + 240 = 411
  total = sumIngredientNativeUnits(items.workout_meal.ingredients, items);
  assert.equal(total, 411);
});

test('modifying an ingredient amount to zero drops its contribution to macros', () => {
  const items = mkCatalog();
  items.r = {
    name: 'R', category: 'recipes',
    ingredients: [
      { itemKey: 'string_cheese', amount: 21 },
      { itemKey: 'salmon_atlantic_cooked', amount: 100 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 121, default: true, locked: true }],
  };
  const before = computeItemMacros(items.r, items).kcal;
  items.r.ingredients[1].amount = 0;
  const after = computeItemMacros(items.r, items).kcal;
  assert.ok(after < before);
  assert.ok(Math.abs(after - 80) < 0.5, `cheese alone should be 80 kcal, got ${after}`);
});

test('adding a recipe as a new ingredient sums the parent recipe correctly', () => {
  const items = mkCatalog();
  items.r = {
    name: 'R', category: 'recipes',
    ingredients: [{ itemKey: 'string_cheese', amount: 21 }], // 80 kcal
    displayUnits: [{ label: 'full recipe', multiplier: 21, default: true, locked: true }],
  };
  // Now add scrambled_feggs as a recipe-ingredient
  items.r.ingredients.push({ itemKey: 'scrambled_feggs', amount: 228 }); // 228/912 of 734 = 183.5 kcal
  const m = computeItemMacros(items.r, items);
  assert.ok(Math.abs(m.kcal - (80 + 183.5)) < 1);
});

test('switching an ingredient to a different serving updates the stored amount accordingly', () => {
  const items = mkCatalog();
  items.r = {
    name: 'R', category: 'recipes',
    ingredients: [{ itemKey: 'turkey_breast_smithfield', amount: 28, label: '1 slice' }],
    displayUnits: [{ label: 'full recipe', multiplier: 28, default: true, locked: true }],
  };
  // User wants 1 pkg instead. Serving picker exposes the pkg variant.
  const servings = servingPickerOptions(items.turkey_breast_smithfield);
  const pkg = servings.find(s => s.label === '1 pkg');
  assert.ok(pkg);
  // Update the ingredient
  items.r.ingredients[0] = {
    itemKey: 'turkey_breast_smithfield',
    amount: pkg.amount,
    label: pkg.label,
  };
  const m = computeItemMacros(items.r, items);
  // turkey kcal/g = 1.0; 224 g -> 224 kcal
  assert.ok(Math.abs(m.kcal - 224) < 1);
});
