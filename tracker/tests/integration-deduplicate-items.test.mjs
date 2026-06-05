import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIngredientMacros, computeItemMacros } from '../lib/tracker-core.mjs';

// Story: two duplicate catalog items represent the same physical product;
// a recipe uses one of them. The user wants to delete the duplicate.
// To preserve macros, rewrite the recipe ingredient to point at the
// kept item, then delete the duplicate. The kept item must expose a
// matching canonical (default variant) so the existing multiplier stays
// semantically correct.

test('rerouting a multiplier-form ingredient to a same-canonical item preserves kcal', () => {
  // ORIGINAL: recipe uses turkey_A with default 2 slices = 56g, mult=1
  const itemsBefore = {
    turkey_A: {
      name: 'Turkey A', defaultMeasuredIn: 'g', kcal: 1.0,
      displayUnits: [{ label: '2 slices', multiplier: 56, default: true }],
    },
    recipe: {
      name: 'r', category: 'recipes',
      ingredients: [{ itemKey: 'turkey_A', multiplier: 1 }],
      displayUnits: [{ label: 'full recipe', multiplier: 56, default: true, locked: true }],
    },
  };
  const baseKcal = computeItemMacros(itemsBefore.recipe, itemsBefore).kcal;

  // AFTER MERGE: turkey_A deleted, recipe points at turkey_B which also
  // has default 2 slices = 56g. Multiplier stays the same.
  const itemsAfter = {
    turkey_B: {
      name: 'Turkey B', defaultMeasuredIn: 'g', kcal: 1.0,
      displayUnits: [
        { label: '1 pkg', multiplier: 224 },
        { label: '2 slices', multiplier: 56, default: true },
        { label: '1 slice', multiplier: 28 },
      ],
    },
    recipe: {
      name: 'r', category: 'recipes',
      ingredients: [{ itemKey: 'turkey_B', multiplier: 1 }],
      displayUnits: [{ label: 'full recipe', multiplier: 56, default: true, locked: true }],
    },
  };
  const newKcal = computeItemMacros(itemsAfter.recipe, itemsAfter).kcal;
  assert.equal(baseKcal, newKcal);
});

test('rerouting WITHOUT matching default canon changes kcal (intended)', () => {
  const recipe = {
    name: 'r', category: 'recipes',
    ingredients: [{ itemKey: 'src', multiplier: 1 }],
    displayUnits: [{ label: 'full recipe', multiplier: 28, default: true, locked: true }],
  };
  const A = {
    src: { name: 'A', defaultMeasuredIn: 'g', kcal: 1,
      displayUnits: [{ label: '1 slice', multiplier: 28, default: true }] },
    recipe,
  };
  const B = {
    src: { name: 'B', defaultMeasuredIn: 'g', kcal: 1,
      displayUnits: [{ label: '1 pkg', multiplier: 224, default: true }] },
    recipe,
  };
  const kcalA = computeItemMacros(A.recipe, A).kcal;
  const kcalB = computeItemMacros(B.recipe, B).kcal;
  assert.notEqual(kcalA, kcalB);
});

test('reordering displayUnits without moving the default flag preserves macros', () => {
  const item = {
    name: 'X', defaultMeasuredIn: 'g', kcal: 1,
    displayUnits: [
      { label: 'A', multiplier: 100 },
      { label: 'B', multiplier: 50, default: true },
      { label: 'C', multiplier: 25 },
    ],
  };
  const kcal1 = computeIngredientMacros({ itemKey: 'k', multiplier: 1 }, { k: item }).kcal;
  // Reverse the array; default flag stays on B
  item.displayUnits = item.displayUnits.slice().reverse();
  const kcal2 = computeIngredientMacros({ itemKey: 'k', multiplier: 1 }, { k: item }).kcal;
  assert.equal(kcal1, kcal2);
});
