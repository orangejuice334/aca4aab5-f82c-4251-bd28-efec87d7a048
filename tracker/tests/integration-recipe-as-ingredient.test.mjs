import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIngredientMacros, computeItemMacros, sumIngredientNativeUnits, getDisplayUnits } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('recipe-as-ingredient: typing 250g of scrambled_feggs in a parent recipe', () => {
  const items = mkCatalog();
  // 912 g batch, kcal = 734; per-g kcal in scrambled_feggs = 734/912 = 0.8048
  // 250 g should give 250 * 0.8048 = 201.2 kcal
  const out = computeIngredientMacros({ itemKey: 'scrambled_feggs', amount: 250 }, items);
  assert.ok(Math.abs(out.kcal - 201.2) < 0.5);
});

test('recipe-as-ingredient stored as multiplier (fraction of canonical batch)', () => {
  const items = mkCatalog();
  // multiplier 0.25 = quarter batch
  const out = computeIngredientMacros({ itemKey: 'scrambled_feggs', multiplier: 0.25 }, items);
  // quarter batch = 0.25 * 734 = 183.5 kcal
  assert.ok(Math.abs(out.kcal - 183.5) < 0.5);
});

test('two ways of expressing 250g of scrambled_feggs converge on same macros', () => {
  const items = mkCatalog();
  const byAmount = computeIngredientMacros({ itemKey: 'scrambled_feggs', amount: 250 }, items);
  const byMult   = computeIngredientMacros({ itemKey: 'scrambled_feggs', multiplier: 250 / 912 }, items);
  assert.ok(Math.abs(byAmount.kcal - byMult.kcal) < 0.1);
});

test('recipe-as-ingredient AND another non-recipe ingredient sum correctly', () => {
  const items = mkCatalog();
  items.parent = {
    name: 'Parent',
    category: 'recipes',
    ingredients: [
      { itemKey: 'scrambled_feggs', amount: 456 }, // half batch, 367 kcal
      { itemKey: 'soy_milk_unsw', amount: 240 },   // 1 cup, 96 kcal (0.4/ml)
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 696, default: true, locked: true }],
  };
  const out = computeItemMacros(items.parent, items);
  assert.ok(Math.abs(out.kcal - (367 + 96)) < 1);
});

test('sumIngredientNativeUnits across a recipe that contains another recipe', () => {
  const items = mkCatalog();
  // 456 g of scrambled_feggs + 100 g of salmon = 556 g
  const total = sumIngredientNativeUnits([
    { itemKey: 'scrambled_feggs', amount: 456 },
    { itemKey: 'salmon_atlantic_cooked', amount: 100 },
  ], items);
  assert.equal(total, 556);
});

test('recipe-as-ingredient resolves the canonical batch via "full recipe" variant', () => {
  const items = mkCatalog();
  // scrambled_feggs displayUnits has only "full recipe" multiplier 912
  // sumIngredientNativeUnits should treat multiplier-form as multiplier × batch size
  const total = sumIngredientNativeUnits([
    { itemKey: 'scrambled_feggs', multiplier: 0.5 },
  ], items);
  assert.equal(total, 456);
});

test('cycle protection: A uses B, B uses A; macros bound to zero, no stack blow', () => {
  const items = mkCatalog();
  const out = computeItemMacros(items.cycle_a, items);
  assert.ok(Number.isFinite(out.kcal));
});

test('Adding scrambled_feggs (1 g synthetic) lets user type raw grams', () => {
  const items = mkCatalog();
  const variants = getDisplayUnits(items.scrambled_feggs);
  // Synthetic 1 g exists
  const synth = variants.find(v => v.synthetic);
  assert.ok(synth);
  assert.equal(synth.unitsPerServing, 1);
});

test('deeply nested recipes (3 levels) compute correctly', () => {
  const items = mkCatalog();
  // level 1: micro_recipe = 10g string cheese (38.1 kcal)
  items.micro_recipe = {
    name: 'Micro',
    category: 'recipes',
    ingredients: [{ itemKey: 'string_cheese', amount: 10 }],
    displayUnits: [{ label: 'full recipe', multiplier: 10, default: true, locked: true }],
  };
  // level 2: mid_recipe = 1 full micro + 1 stick string cheese (= 38.1 + 80 = 118.1)
  items.mid_recipe = {
    name: 'Mid',
    category: 'recipes',
    ingredients: [
      { itemKey: 'micro_recipe', multiplier: 1 },
      { itemKey: 'string_cheese', amount: 21 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 31, default: true, locked: true }],
  };
  // level 3: big_recipe = half mid + 100g salmon (=59.05 + 208 = 267.05)
  items.big_recipe = {
    name: 'Big',
    category: 'recipes',
    ingredients: [
      { itemKey: 'mid_recipe', multiplier: 0.5 },
      { itemKey: 'salmon_atlantic_cooked', amount: 100 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 115, default: true, locked: true }],
  };
  const macros = computeItemMacros(items.big_recipe, items);
  // micro = (80/21)*10 = 38.0952
  // mid = 38.0952 + 80 = 118.0952
  // big = mid * 0.5 + 208 = 59.0476 + 208 = 267.05
  assert.ok(Math.abs(macros.kcal - 267.05) < 0.5);
});
