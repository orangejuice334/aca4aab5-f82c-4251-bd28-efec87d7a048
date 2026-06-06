import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecipe,
  modifyIngredientAmount,
  addIngredientToRecipe,
  buildIngredientFromPicker,
  servingPickerOptions,
  computeItemMacros,
  sumIngredientNativeUnits,
} from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// End-to-end: drive the same code paths the UI drives.
// Recipe construction goes through createRecipe (which calls
// buildIngredientFromPicker per ingredient + buildFullRecipeVariant);
// modifications go through modifyIngredientAmount; additions go
// through addIngredientToRecipe. No hand-rolled item objects.

test('create recipe, modify an ingredient amount, then add a new ingredient', () => {
  const items = mkCatalog();

  // Resolve the servingIndex for each source from the picker contract.
  // salmon default = "3 oz portion" (85 g) at index 0.
  const salmonServings = servingPickerOptions(items.salmon_atlantic_cooked);
  const salmonDefaultIdx = salmonServings.findIndex(s => s.default);
  // string_cheese default = "1 stick" at index 0
  const cheeseServings = servingPickerOptions(items.string_cheese);
  const cheeseDefaultIdx = cheeseServings.findIndex(s => s.default);
  // soy_milk default = "1 cup" 240 ml at index 0
  const soyServings = servingPickerOptions(items.soy_milk_unsw);
  const soyDefaultIdx = soyServings.findIndex(s => s.default);

  // STEP 1: create a fresh recipe via the page's createRecipe path
  const recipe = createRecipe(items, {
    name: 'Workout meal',
    ingredients: [
      { sourceKey: 'salmon_atlantic_cooked', servingIndex: salmonDefaultIdx },
      { sourceKey: 'string_cheese',          servingIndex: cheeseDefaultIdx },
    ],
  });
  items.workout_meal = recipe;

  // Sanity-check the constructed recipe shape (no hand-written state)
  assert.equal(recipe.category, 'recipes');
  assert.equal(recipe.ingredients.length, 2);
  const fullVariant = recipe.displayUnits.find(v => v.locked);
  assert.ok(fullVariant);
  assert.equal(fullVariant.label, 'full recipe');
  // Salmon default 85 g + cheese stick 21 g = 106 g
  assert.equal(fullVariant.multiplier, 106);
  // Macros from page primitives: salmon (85*2.08) + cheese (80) = 256.8
  let m = computeItemMacros(recipe, items);
  assert.ok(Math.abs(m.kcal - (85 * 2.08 + 80)) < 0.5,
    `step 1 kcal got ${m.kcal}`);

  // STEP 2: bump salmon amount (85 -> 150 g) via modifyIngredientAmount.
  // Mirrors the page's auto-recompute of the full-recipe variant.
  modifyIngredientAmount(recipe, items, 0, 150);
  assert.equal(recipe.ingredients[0].amount, 150);
  const fullAfterMod = recipe.displayUnits.find(v => v.locked);
  assert.equal(fullAfterMod.multiplier, 171); // 150 + 21
  m = computeItemMacros(recipe, items);
  assert.ok(Math.abs(m.kcal - (150 * 2.08 + 80)) < 0.5,
    `step 2 kcal got ${m.kcal}`);

  // STEP 3: add soy milk via addIngredientToRecipe + default serving.
  addIngredientToRecipe(recipe, items, 'soy_milk_unsw', soyDefaultIdx);
  assert.equal(recipe.ingredients.length, 3);
  const fullAfterAdd = recipe.displayUnits.find(v => v.locked);
  assert.equal(fullAfterAdd.multiplier, 411); // 171 + 240

  // STEP 4: verify macros include the new soy ingredient
  m = computeItemMacros(recipe, items);
  // soy kcal = 240 * 0.4 = 96
  assert.ok(Math.abs(m.kcal - (150 * 2.08 + 80 + 96)) < 0.5);
  // water = 150 * 0.65 (salmon) + 240 * 0.94 (soy) = 97.5 + 225.6 = 323.1
  assert.ok(Math.abs(m.water - (150 * 0.65 + 240 * 0.94)) < 1);
});

test('createRecipe with a non-basis source stores multiplier as fraction of default', () => {
  const items = mkCatalog();
  // omega-3 supplement: defaultMeasuredIn=units; default = AM (multiplier 1)
  // Picking servingIndex 0 (default) should yield multiplier=1
  const recipe = createRecipe(items, {
    name: 'Suppy',
    ingredients: [{ sourceKey: 'omega3_softgel', servingIndex: 0 }],
  });
  const ing = recipe.ingredients[0];
  assert.equal(ing.multiplier, 1);
  // No `amount` field for non-basis sources
  assert.equal(ing.amount, undefined);
});

test('createRecipe with non-default serving on a g item stores the picked variant amount', () => {
  const items = mkCatalog();
  const servings = servingPickerOptions(items.turkey_breast_smithfield);
  const pkgIdx = servings.findIndex(s => s.label === '1 pkg');
  const recipe = createRecipe(items, {
    name: 'Turkey wrap',
    ingredients: [{ sourceKey: 'turkey_breast_smithfield', servingIndex: pkgIdx }],
  });
  assert.equal(recipe.ingredients[0].amount, 224);
  assert.equal(recipe.ingredients[0].label, '1 pkg');
});

test('addIngredientToRecipe with the synthetic 1 g serving stores amount=1', () => {
  const items = mkCatalog();
  const recipe = createRecipe(items, {
    name: 'Tester',
    ingredients: [{ sourceKey: 'string_cheese', servingIndex: 0 }],
  });
  const servings = servingPickerOptions(items.salmon_atlantic_cooked);
  const synthIdx = servings.findIndex(s => s.label === '1 g');
  assert.ok(synthIdx >= 0, 'salmon should have a synthetic 1 g variant');
  addIngredientToRecipe(recipe, items, 'salmon_atlantic_cooked', synthIdx);
  const added = recipe.ingredients[recipe.ingredients.length - 1];
  assert.equal(added.amount, 1);
});

test('modifyIngredientAmount(0) drops the ingredient contribution from macros', () => {
  const items = mkCatalog();
  const recipe = createRecipe(items, {
    name: 'Drop test',
    ingredients: [
      { sourceKey: 'string_cheese', servingIndex: 0 },         // 80 kcal
      { sourceKey: 'salmon_atlantic_cooked', servingIndex: 0 },// 85 g default = 176.8 kcal
    ],
  });
  modifyIngredientAmount(recipe, items, 1, 0);
  const m = computeItemMacros(recipe, items);
  assert.ok(Math.abs(m.kcal - 80) < 0.5);
});

test('addIngredientToRecipe with a recipe source (recipe-as-ingredient)', () => {
  const items = mkCatalog();
  const recipe = createRecipe(items, {
    name: 'Compound',
    ingredients: [{ sourceKey: 'string_cheese', servingIndex: 0 }],
  });
  // scrambled_feggs has only one variant "full recipe" + synthetic 1 g.
  // Picking the synthetic 1 g stores it as a fraction of canonical.
  const servings = servingPickerOptions(items.scrambled_feggs);
  const gramIdx = servings.findIndex(s => s.label === '1 g');
  addIngredientToRecipe(recipe, items, 'scrambled_feggs', gramIdx);
  const added = recipe.ingredients[recipe.ingredients.length - 1];
  // scrambled_feggs is a recipe (non-basis); multiplier = 1g / 912g batch
  assert.ok(Math.abs(added.multiplier - (1 / 912)) < 1e-6);
});

test('createRecipe throws when an ingredient sourceKey is missing', () => {
  const items = mkCatalog();
  assert.throws(() => createRecipe(items, {
    name: 'Bad',
    ingredients: [{ sourceKey: 'nope', servingIndex: 0 }],
  }), /unknown source key/);
});

test('createRecipe throws when servingIndex is out of range', () => {
  const items = mkCatalog();
  assert.throws(() => createRecipe(items, {
    name: 'Bad',
    ingredients: [{ sourceKey: 'string_cheese', servingIndex: 99 }],
  }), /servingIndex 99 out of range/);
});

test('createRecipe requires a non-empty name', () => {
  const items = mkCatalog();
  assert.throws(() => createRecipe(items, { name: '   ', ingredients: [] }),
    /spec\.name is required/);
});

test('full-recipe variant native total stays in sync across modify + add', () => {
  const items = mkCatalog();
  const recipe = createRecipe(items, {
    name: 'Track',
    ingredients: [
      { sourceKey: 'string_cheese', servingIndex: 0 }, // 21
      { sourceKey: 'salmon_atlantic_cooked', servingIndex: 0 }, // 85
    ],
  });
  let lockedVar = () => recipe.displayUnits.find(v => v.locked);
  assert.equal(lockedVar().multiplier, 106);

  modifyIngredientAmount(recipe, items, 1, 200);
  assert.equal(lockedVar().multiplier, 221);

  addIngredientToRecipe(recipe, items, 'soy_milk_unsw', 0); // 240 ml default
  assert.equal(lockedVar().multiplier, 461);

  // Verify the variant.amount field tracks too (page reads either field)
  assert.equal(lockedVar().amount, 461);

  // Sanity: sumIngredientNativeUnits agrees with the stored variant
  assert.equal(lockedVar().multiplier, sumIngredientNativeUnits(recipe.ingredients, items));
});
