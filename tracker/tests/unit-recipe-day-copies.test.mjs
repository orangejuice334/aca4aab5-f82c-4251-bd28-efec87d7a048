import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsForDay, loggedRecipeNutrients, recipeKeysNeededForDay } from '../lib/tracker-core.mjs';

// A day that logs a recipe keeps a frozen copy of it, and of every recipe
// nested in it (day.recipeSnapshots), so a later edit never changes that
// day. Mirrors track.html's withRecipeDay / ingredientSource /
// loggedRecipeNutrients / recipeKeysNeededForDay.

function catalog() {
  return {
    // 1.65 kcal and 0.31 g protein per gram.
    chicken_breast: {
      name: 'Chicken breast', category: 'items', defaultMeasuredIn: 'g', kcal: 1.65, p: 0.31,
      displayUnits: [{ label: '1 breast', multiplier: 200, default: true }],
    },
    // 1.3 kcal and 0.025 g protein per gram.
    rice_cooked: {
      name: 'White rice', category: 'items', defaultMeasuredIn: 'g', kcal: 1.3, p: 0.025,
      displayUnits: [{ label: '1 cup', multiplier: 160, default: true }],
    },
    // 8 kcal per ml.
    olive_oil: {
      name: 'Olive oil', category: 'items', defaultMeasuredIn: 'ml', kcal: 8,
      displayUnits: [{ label: '1 tbsp', multiplier: 15, default: true }],
    },
    // 1440 g, 2152 kcal, 264 g protein.
    meal_prep_slab: {
      name: 'Meal prep slab', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [{ itemKey: 'chicken_breast', amount: 800 }, { itemKey: 'rice_cooked', amount: 640 }],
      displayUnits: [{ label: 'full recipe', multiplier: 1440, locked: true, default: true }],
    },
    // A quarter of the slab plus 5 ml oil: 365 g, 578 kcal.
    slab_bowl: {
      name: 'Slab bowl', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [{ itemKey: 'meal_prep_slab', multiplier: 0.25 }, { itemKey: 'olive_oil', amount: 5 }],
      displayUnits: [{ label: 'full recipe', multiplier: 365, locked: true, default: true }],
    },
  };
}

const copyOf = item => JSON.parse(JSON.stringify(item));

// The catalog after the slab gets 1000 g of chicken instead of 800 g:
// 1640 g and 2482 kcal, so the bowl becomes 415 g and 660.5 kcal.
function catalogAfterSlabEdit() {
  const items = catalog();
  items.meal_prep_slab.ingredients[0].amount = 1000;
  return items;
}

test('a day without copies prices everything from the catalog', () => {
  const items = catalog();
  assert.equal(itemsForDay(items, { counters: {} }), items);
  assert.equal(itemsForDay(items, null), items);
});

test('a day reads its copy of a recipe still in the catalog, and the catalog for everything else', () => {
  const items = catalogAfterSlabEdit();
  const frozenSlab = copyOf(catalog().meal_prep_slab);
  const day = {
    recipeSnapshots: {
      meal_prep_slab: frozenSlab,
      deleted_recipe: { category: 'recipes', ingredients: [{ itemKey: 'rice_cooked', amount: 100 }] },
      slab_bowl: { category: 'recipes', ingredients: [] },
    },
  };
  const dayItems = itemsForDay(items, day);
  assert.equal(dayItems.meal_prep_slab, frozenSlab);
  assert.equal(dayItems.chicken_breast, items.chicken_breast);
  assert.equal(dayItems.slab_bowl, items.slab_bowl, 'a copy without ingredients is not used');
  assert.equal('deleted_recipe' in dayItems, false, 'a deleted recipe stays deleted on every day');
  assert.equal(items.meal_prep_slab.ingredients[0].amount, 1000, 'the catalog itself is untouched');
});

test('a recipe logged on a past day keeps the price of its copy after the recipe changes', () => {
  const items = catalogAfterSlabEdit();
  const day = { recipeSnapshots: { meal_prep_slab: copyOf(catalog().meal_prep_slab) } };
  const frozen = loggedRecipeNutrients('meal_prep_slab', 1440, items, day);
  assert.equal(frozen.kcal, 2152);
  assert.equal(frozen.p, 264);
  // Without a copy the same 1440 g are 1440/1640 of the new 2482 kcal batch.
  const live = loggedRecipeNutrients('meal_prep_slab', 1440, items, { counters: {} });
  assert.ok(Math.abs(live.kcal - 2482 * 1440 / 1640) < 1e-9, `live kcal ${live.kcal}`);
});

test('the recipes nested in a logged recipe are priced from the same day\'s copies', () => {
  const items = catalogAfterSlabEdit();
  const original = catalog();
  const bothCopies = { recipeSnapshots: { slab_bowl: copyOf(original.slab_bowl), meal_prep_slab: copyOf(original.meal_prep_slab) } };
  const frozen = loggedRecipeNutrients('slab_bowl', 365, items, bothCopies);
  assert.equal(frozen.kcal, 578);
  assert.equal(frozen.p, 66);
  // With only the bowl's copy, its quarter slab is the edited slab: 365 g of
  // a 415 g, 660.5 kcal bowl.
  const bowlCopyOnly = { recipeSnapshots: { slab_bowl: copyOf(original.slab_bowl) } };
  const drifted = loggedRecipeNutrients('slab_bowl', 365, items, bowlCopyOnly);
  assert.ok(Math.abs(drifted.kcal - 660.5 * 365 / 415) < 1e-9, `drifted kcal ${drifted.kcal}`);
});

test('a deleted nested recipe computes as zero even on a day that holds its copy', () => {
  const items = catalog();
  const original = catalog();
  delete items.meal_prep_slab;
  const day = { recipeSnapshots: { slab_bowl: copyOf(original.slab_bowl), meal_prep_slab: copyOf(original.meal_prep_slab) } };
  const portion = loggedRecipeNutrients('slab_bowl', 5, items, day);
  // Only the 5 ml of oil is left: 5 g of batch, 40 kcal.
  assert.equal(portion.kcal, 40);
});

test('the copies a log needs are the recipe and every recipe nested in it, each once', () => {
  const items = catalog();
  assert.deepEqual(recipeKeysNeededForDay('slab_bowl', items, null, true), ['slab_bowl', 'meal_prep_slab']);
  assert.deepEqual(recipeKeysNeededForDay('meal_prep_slab', items, null, true), ['meal_prep_slab']);
  assert.deepEqual(recipeKeysNeededForDay('chicken_breast', items, null, true), [], 'a plain item needs no copy');
  assert.deepEqual(recipeKeysNeededForDay('gone', items, null, true), [], 'a deleted recipe needs no copy');
});

test('a past day follows its own copies to find the nested recipes; today follows the catalog', () => {
  const items = catalog();
  items.old_slab = copyOf(items.meal_prep_slab);
  // The day's bowl was made with old_slab; the catalog bowl now uses meal_prep_slab.
  const frozenBowl = copyOf(items.slab_bowl);
  frozenBowl.ingredients[0].itemKey = 'old_slab';
  const day = { recipeSnapshots: { slab_bowl: frozenBowl } };
  assert.deepEqual(recipeKeysNeededForDay('slab_bowl', items, day, false), ['slab_bowl', 'old_slab']);
  assert.deepEqual(recipeKeysNeededForDay('slab_bowl', items, day, true), ['slab_bowl', 'meal_prep_slab']);
});

test('recipes that contain each other are each needed once', () => {
  const items = catalog();
  items.recipe_a = { name: 'A', category: 'recipes', ingredients: [{ itemKey: 'recipe_b', multiplier: 1 }, { itemKey: 'olive_oil', amount: 5 }] };
  items.recipe_b = { name: 'B', category: 'recipes', ingredients: [{ itemKey: 'recipe_a', multiplier: 1 }, { itemKey: 'rice_cooked', amount: 10 }] };
  assert.deepEqual(recipeKeysNeededForDay('recipe_a', items, null, true), ['recipe_a', 'recipe_b']);
});