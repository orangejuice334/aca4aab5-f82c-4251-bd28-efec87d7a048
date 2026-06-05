import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeItemMacros,
  sumIngredientNativeUnits,
  getDisplayUnits,
  resolveIngredient,
} from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// Full story B: a user builds a "meal" recipe using another recipe as an
// ingredient, modifies the inner recipe, and verifies the outer recipe
// re-computes correctly (no stale snapshot).

test('full story B: nested recipes update transitively when inner recipe changes', () => {
  const items = mkCatalog();
  // Outer recipe uses scrambled_feggs (batch=912g, ~734 kcal) as one ingredient
  items.outer = {
    name: 'Outer',
    category: 'recipes',
    ingredients: [
      { itemKey: 'scrambled_feggs', amount: 228 }, // quarter batch = 183.5 kcal
      { itemKey: 'soy_milk_unsw', amount: 240 },   // 96 kcal
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 228 + 240, default: true, locked: true }],
  };
  const baselineKcal = computeItemMacros(items.outer, items).kcal;
  assert.ok(Math.abs(baselineKcal - (183.5 + 96)) < 1);

  // User edits scrambled_feggs by removing the string_cheese ingredient.
  items.scrambled_feggs.ingredients = items.scrambled_feggs.ingredients.filter(i => i.itemKey !== 'string_cheese');
  // Also recompute scrambled_feggs full-recipe variant grams
  const newBatch = sumIngredientNativeUnits(items.scrambled_feggs.ingredients, items);
  items.scrambled_feggs.displayUnits[0].multiplier = newBatch;
  items.scrambled_feggs.displayUnits[0].amount = newBatch;
  // Now scrambled_feggs full kcal = 0.5 * 828 = 414; per-g = 414/828 = 0.5
  // Outer's 228 g of scrambled_feggs => 228/828 * 414 = 114
  // Outer's soy milk stays 96 kcal
  const newKcal = computeItemMacros(items.outer, items).kcal;
  assert.ok(Math.abs(newKcal - (114 + 96)) < 1);
});

test('full story B2: rename the inner recipe ingredient (key change requires updating the outer ref)', () => {
  const items = mkCatalog();
  items.outer = {
    name: 'Outer',
    category: 'recipes',
    ingredients: [
      { itemKey: 'scrambled_feggs', amount: 228 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 228, default: true, locked: true }],
  };
  const before = computeItemMacros(items.outer, items).kcal;
  // Simulate a key rename - drop old key, leave outer pointing to nothing
  delete items.scrambled_feggs;
  const after = computeItemMacros(items.outer, items).kcal;
  // outer loses all its calories
  assert.equal(after, 0);
  // Restore under a new key, update the outer ingredient
  items.scrambled_feggs_v2 = {
    name: 'Scrambled feggs v2',
    category: 'recipes',
    ingredients: [{ itemKey: 'egg_substitute', amount: 828 }],
    displayUnits: [{ label: 'full recipe', multiplier: 828, default: true, locked: true }],
  };
  items.outer.ingredients[0].itemKey = 'scrambled_feggs_v2';
  const restored = computeItemMacros(items.outer, items).kcal;
  // 228 / 828 * (0.5 * 828) = 228/828 * 414 = 114
  assert.ok(Math.abs(restored - 114) < 1);
});

test('full story B3: synthetic "1 g" exposes typing raw grams of any recipe in another recipe', () => {
  const items = mkCatalog();
  const sfVariants = getDisplayUnits(items.scrambled_feggs);
  assert.ok(sfVariants.some(v => v.synthetic && v.label === '1 g'));
  // Use scrambled_feggs in a new recipe via raw grams (250)
  items.combo = {
    name: 'Combo',
    category: 'recipes',
    ingredients: [{ itemKey: 'scrambled_feggs', amount: 250 }],
    displayUnits: [{ label: 'full recipe', multiplier: 250, default: true, locked: true }],
  };
  const m = computeItemMacros(items.combo, items);
  // 250/912 * 734 = 201.2
  assert.ok(Math.abs(m.kcal - 201.2) < 1);
});

test('full story B4: ingredient row resolves with brand suffix for branded sources', () => {
  const items = mkCatalog();
  const r = resolveIngredient({ itemKey: 'turkey_breast_smithfield', amount: 28 }, items);
  assert.equal(r.name, 'Turkey breast oven roasted (Smithfield Safeway)');
  assert.equal(r.kcal, 28);
});
