import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumIngredientNativeUnits } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('sumIngredientNativeUnits sums linked amount fields', () => {
  const items = mkCatalog();
  const total = sumIngredientNativeUnits([
    { itemKey: 'string_cheese', amount: 84 },
    { itemKey: 'egg_substitute', amount: 828 },
  ], items);
  assert.equal(total, 912);
});

test('sumIngredientNativeUnits expands multiplier * default variant size', () => {
  const items = mkCatalog();
  // turkey_breast_smithfield default = "1 slice" 28g. multiplier 10 => 280g
  const total = sumIngredientNativeUnits([
    { itemKey: 'turkey_breast_smithfield', multiplier: 10 },
  ], items);
  assert.equal(total, 280);
});

test('sumIngredientNativeUnits sums flat g amounts when present', () => {
  const total = sumIngredientNativeUnits([
    { name: 'flour', amount: { value: 100, unit: 'g' } },
    { name: 'sugar', amount: { value: 50, unit: 'g' } },
  ], mkCatalog());
  assert.equal(total, 150);
});

test('sumIngredientNativeUnits ignores flat ingredients with non-g/ml units', () => {
  const total = sumIngredientNativeUnits([
    { name: 'salt', amount: { value: 1, unit: 'tsp' } },
  ], mkCatalog());
  assert.equal(total, 0);
});

test('sumIngredientNativeUnits ignores missing source items', () => {
  const total = sumIngredientNativeUnits([
    { itemKey: 'gone', amount: 100 },
    { itemKey: 'string_cheese', amount: 21 },
  ], mkCatalog());
  assert.equal(total, 21);
});

test('sumIngredientNativeUnits returns 0 for empty/null lists', () => {
  assert.equal(sumIngredientNativeUnits([], mkCatalog()), 0);
  assert.equal(sumIngredientNativeUnits(null, mkCatalog()), 0);
  assert.equal(sumIngredientNativeUnits(undefined, mkCatalog()), 0);
});

test('sumIngredientNativeUnits handles a mix of amount, multiplier, and flat', () => {
  const items = mkCatalog();
  const total = sumIngredientNativeUnits([
    { itemKey: 'string_cheese', amount: 42 },              // 42
    { itemKey: 'turkey_breast_smithfield', multiplier: 2 },// 56 (2 * 28g default)
    { name: 'salt', amount: { value: 5, unit: 'g' } },     // 5
    { name: 'soda', amount: { value: 250, unit: 'ml' } },  // 250
  ], items);
  assert.equal(total, 42 + 56 + 5 + 250);
});

test('sumIngredientNativeUnits rounds to 1 decimal', () => {
  // 1 cup soy milk: multiplier=1, default size=240 => 240 native (ml)
  const items = mkCatalog();
  const total = sumIngredientNativeUnits([
    { itemKey: 'soy_milk_unsw', multiplier: 1 },
  ], items);
  assert.equal(total, 240);
});

test('sumIngredientNativeUnits zero-only amounts contribute zero', () => {
  const items = mkCatalog();
  const total = sumIngredientNativeUnits([
    { itemKey: 'string_cheese', amount: 0 },
    { itemKey: 'egg_substitute', amount: 0 },
  ], items);
  assert.equal(total, 0);
});
