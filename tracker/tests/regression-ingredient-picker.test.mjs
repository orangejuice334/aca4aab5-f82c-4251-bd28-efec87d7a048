import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingredientPickerOptions } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// Reproduces the bug: the recipe-item edit panel's "Add ingredient"
// dropdown was dropping the brand suffix and filtering out every recipe.
// These tests defined the contract that the fix must meet.

test('ingredient picker includes brand in option labels', () => {
  const opts = ingredientPickerOptions(mkCatalog(), 'some_recipe_key');
  const turkey = opts.find(o => o.key === 'turkey_breast_smithfield');
  assert.ok(turkey, 'expected turkey_breast_smithfield in picker options');
  assert.equal(turkey.label, 'Turkey breast oven roasted (Smithfield Safeway)');
});

test('ingredient picker includes recipes (so recipe-as-ingredient is possible)', () => {
  const opts = ingredientPickerOptions(mkCatalog(), 'parent_recipe');
  // scrambled_feggs is a recipe in the mock catalog; it must show up
  assert.ok(opts.some(o => o.key === 'scrambled_feggs'),
    'recipes must be selectable as ingredients of another recipe');
});

test('ingredient picker excludes the recipe currently being edited (no self-reference)', () => {
  const opts = ingredientPickerOptions(mkCatalog(), 'scrambled_feggs');
  assert.ok(!opts.some(o => o.key === 'scrambled_feggs'),
    'the item being edited must not appear in its own picker');
});

test('ingredient picker excludes water (dedicated hydration item)', () => {
  const opts = ingredientPickerOptions(mkCatalog(), 'r');
  assert.ok(!opts.some(o => o.key === 'water'));
});

test('ingredient picker sorted alphabetically by display label', () => {
  const opts = ingredientPickerOptions(mkCatalog(), 'r');
  for (let i = 1; i < opts.length; i++) {
    assert.ok(opts[i - 1].label.localeCompare(opts[i].label) <= 0);
  }
});

test('ingredient picker omits brand suffix when brand missing', () => {
  const opts = ingredientPickerOptions(mkCatalog(), 'r');
  const eggs = opts.find(o => o.key === 'egg_substitute');
  assert.ok(eggs);
  assert.equal(eggs.label, 'Egg substitute');
});

test('ingredient picker trims whitespace-only brand', () => {
  const items = { x: { name: 'Item', brand: '   ' } };
  const opts = ingredientPickerOptions(items, 'r');
  assert.equal(opts[0].label, 'Item');
});

test('ingredient picker handles null / empty catalog', () => {
  assert.deepEqual(ingredientPickerOptions({}, 'r'), []);
  assert.deepEqual(ingredientPickerOptions(null, 'r'), []);
  assert.deepEqual(ingredientPickerOptions(undefined, 'r'), []);
});

test('ingredient picker handles missing currentKey (still excludes water)', () => {
  const opts = ingredientPickerOptions(mkCatalog(), '');
  // Every non-water item should appear
  assert.ok(!opts.some(o => o.key === 'water'));
  assert.ok(opts.some(o => o.key === 'scrambled_feggs'));
});

test('ingredient picker includes branded supplements (caffeine cap, omega-3)', () => {
  const items = mkCatalog();
  items.omega3_softgel.brand = 'NOW';
  const opts = ingredientPickerOptions(items, 'r');
  const omega = opts.find(o => o.key === 'omega3_softgel');
  assert.equal(omega.label, 'Omega-3 (fish oil) (NOW)');
});
