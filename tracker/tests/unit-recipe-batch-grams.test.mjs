import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIngredientFromPicker, computeIngredientMacros, getDisplayUnits, ingredientNativeUnits, ingredientPickerOptions,
  isRecipeWithIngredients, modifyIngredientAmount, recipeCatalogOptions, servingPickerOptions, sumIngredientNativeUnits,
} from '../lib/tracker-core.mjs';

// A recipe's batch (its "full recipe") is the live sum of its ingredient
// grams, counted the way computeIngredientMacros counts their calories.
// Mirrors track.html's recipeLinkedGrams / getDisplayUnits / edit-panel Add.

function catalog() {
  return {
    // 200 g breast = 330 kcal.
    chicken_breast: {
      name: 'Chicken breast', category: 'items', defaultMeasuredIn: 'g', kcal: 1.65, p: 0.31,
      displayUnits: [{ label: '1 breast', multiplier: 200, default: true }, { label: '100 g', multiplier: 100 }],
    },
    // 160 g cup = 208 kcal.
    rice_cooked: {
      name: 'White rice', category: 'items', defaultMeasuredIn: 'g', kcal: 1.3, p: 0.025,
      displayUnits: [{ label: '1 cup', multiplier: 160, default: true }],
    },
    // Default serving (the half tub) is not the first one listed.
    greek_yogurt: {
      name: 'Greek yogurt', category: 'items', defaultMeasuredIn: 'g', kcal: 0.6, p: 0.1,
      displayUnits: [{ label: '1 tub', multiplier: 680 }, { label: '1/2 tub', multiplier: 340, default: true }],
    },
    // Counted item whose default serving (2 eggs) is not its first serving.
    egg_large: {
      name: 'Egg', category: 'items', defaultMeasuredIn: 'units', kcal: 70, p: 6,
      displayUnits: [{ label: '1 egg', multiplier: 1 }, { label: '2 eggs', multiplier: 2, default: true }],
    },
    // 1440 g batch whose default serving is a 360 g quarter, listed first.
    meal_prep_slab: {
      name: 'Meal prep slab', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [{ itemKey: 'chicken_breast', amount: 800 }, { itemKey: 'rice_cooked', amount: 640 }],
      displayUnits: [
        { label: '1 serving', multiplier: 360, default: true },
        { label: 'full recipe', multiplier: 1000, locked: true },
      ],
    },
    // Inline ingredients only: one plate is the whole plate.
    toast_plate: {
      name: 'Toast and butter', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [{ name: 'Toast', kcal: 150, amount: { value: 2, unit: 'slices' } }, { name: 'Butter', kcal: 100, amount: { value: 14, unit: 'g' } }],
      displayUnits: [{ label: '1 plate', multiplier: 1, default: true }],
    },
    old_granola: { name: 'Old granola', category: 'items', defaultMeasuredIn: 'g', archived: true, kcal: 4.5, displayUnits: [{ label: '1 bowl', multiplier: 60 }] },
    water_bottle: { name: 'Water bottle', category: 'water', defaultMeasuredIn: 'ml', water: 1, displayUnits: [{ label: 'Morning', multiplier: 500 }] },
  };
}

test('isRecipeWithIngredients is true only for a recipe that has ingredients', () => {
  const items = catalog();
  assert.equal(isRecipeWithIngredients(items.meal_prep_slab), true);
  assert.equal(isRecipeWithIngredients(items.chicken_breast), false);
  assert.equal(isRecipeWithIngredients({ category: 'recipes', ingredients: [] }), false);
  assert.equal(isRecipeWithIngredients(null), false);
});

test('a multiplier on an item counts that many of its default serving, not its first one', () => {
  const items = catalog();
  assert.equal(ingredientNativeUnits([{ itemKey: 'greek_yogurt', multiplier: 1 }], items), 340);
  assert.equal(ingredientNativeUnits([{ itemKey: 'egg_large', multiplier: 1 }], items), 2);
});

test('a multiplier on a recipe counts that fraction of its live batch, whichever serving it lists first', () => {
  const items = catalog();
  // The slab's stored full recipe (1000) is stale; its ingredients add up to 1440 g.
  assert.equal(ingredientNativeUnits([{ itemKey: 'meal_prep_slab', multiplier: 0.25 }], items), 360);
});

test('inline ingredients and deleted sources add nothing to a batch', () => {
  const items = catalog();
  assert.equal(ingredientNativeUnits(items.toast_plate.ingredients, items), 0);
  assert.equal(ingredientNativeUnits([{ itemKey: 'gone', amount: 50 }, { itemKey: 'rice_cooked', amount: 160 }], items), 160);
});

test('recipes that contain each other still add up to a finite batch', () => {
  const items = catalog();
  items.loop_a = { name: 'Loop A', category: 'recipes', ingredients: [{ itemKey: 'loop_b', multiplier: 1 }, { itemKey: 'chicken_breast', amount: 100 }], displayUnits: [{ label: 'full recipe', multiplier: 200, locked: true }] };
  items.loop_b = { name: 'Loop B', category: 'recipes', ingredients: [{ itemKey: 'loop_a', multiplier: 1 }, { itemKey: 'rice_cooked', amount: 100 }], displayUnits: [{ label: 'full recipe', multiplier: 200, locked: true }] };
  assert.equal(Number.isFinite(ingredientNativeUnits(items.loop_a.ingredients, items)), true);
  assert.equal(Number.isFinite(getDisplayUnits(items.loop_a, items)[0].unitsPerServing), true);
});

test('with the catalog, a recipe full recipe is its live ingredient total; without it, the stored size', () => {
  const items = catalog();
  const live = getDisplayUnits(items.meal_prep_slab, items).find(unit => unit.locked);
  assert.equal(live.unitsPerServing, 1440);
  assert.equal(live.multiplier, 1440);
  assert.equal(live.amount, 1440);
  assert.equal(getDisplayUnits(items.meal_prep_slab).find(unit => unit.locked).unitsPerServing, 1000);
  // Fixed portions are never resized.
  assert.equal(getDisplayUnits(items.meal_prep_slab, items).find(unit => unit.label === '1 serving').unitsPerServing, 360);
});

test('a recipe of inline ingredients keeps its own serving size even with the catalog', () => {
  const items = catalog();
  assert.equal(getDisplayUnits(items.toast_plate, items)[0].unitsPerServing, 1);
});

test('grams of a recipe used as an ingredient are a share of its live batch', () => {
  const items = catalog();
  // 360 g of the 1440 g slab (2152 kcal) is a quarter: 538 kcal.
  assert.equal(computeIngredientMacros({ itemKey: 'meal_prep_slab', amount: 360 }, items).kcal, 538);
});

test('adding one default serving of a recipe stores its fraction of the batch', () => {
  const items = catalog();
  const options = servingPickerOptions(items.meal_prep_slab, items);
  assert.deepEqual(options.map(option => [option.label, option.amount]), [['1 serving', 360], ['full recipe', 1440], ['1 g', 1]]);
  assert.deepEqual(buildIngredientFromPicker(items, 'meal_prep_slab', 0), { itemKey: 'meal_prep_slab', multiplier: 0.25, label: '1 serving' });
  assert.deepEqual(buildIngredientFromPicker(items, 'meal_prep_slab', 1), { itemKey: 'meal_prep_slab', multiplier: 1, label: 'full recipe' });
});

test('adding a counted item stores a count of its default serving', () => {
  const items = catalog();
  const twoEggs = servingPickerOptions(items.egg_large, items).findIndex(option => option.label === '2 eggs');
  const oneEgg = servingPickerOptions(items.egg_large, items).findIndex(option => option.label === '1 egg');
  assert.deepEqual(buildIngredientFromPicker(items, 'egg_large', twoEggs), { itemKey: 'egg_large', multiplier: 1, label: '2 eggs' });
  assert.deepEqual(buildIngredientFromPicker(items, 'egg_large', oneEgg), { itemKey: 'egg_large', multiplier: 0.5, label: '1 egg' });
});

test('typing grams of a recipe ingredient stores its fraction of the batch and resizes the full recipe', () => {
  const items = catalog();
  const bowl = {
    name: 'Slab bowl', category: 'recipes',
    ingredients: [{ itemKey: 'meal_prep_slab', multiplier: 0.25 }, { itemKey: 'rice_cooked', amount: 40 }],
    displayUnits: [{ label: 'full recipe', multiplier: 400, amount: 400, unit: 'g', default: true, locked: true }],
  };
  modifyIngredientAmount(bowl, items, 0, 180);
  assert.deepEqual(bowl.ingredients[0], { itemKey: 'meal_prep_slab', multiplier: 0.125 });
  assert.equal(bowl.displayUnits[0].multiplier, 220);
  assert.equal(sumIngredientNativeUnits(bowl.ingredients, items), 220);
});

test('the recipe maker and the edit-panel picker never offer archived items or water', () => {
  const items = catalog();
  for (const options of [recipeCatalogOptions(items), ingredientPickerOptions(items, 'meal_prep_slab')]) {
    const keys = options.map(option => option.key);
    assert.equal(keys.includes('old_granola'), false);
    assert.equal(keys.includes('water_bottle'), false);
    assert.equal(keys.includes('chicken_breast'), true);
  }
});