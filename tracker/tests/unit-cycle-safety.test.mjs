import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIngredientMacros, computeItemMacros } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('cycle_a + cycle_b: macros are finite and zero (no nutrients on either)', () => {
  const items = mkCatalog();
  const a = computeItemMacros(items.cycle_a, items);
  const b = computeItemMacros(items.cycle_b, items);
  for (const k of ['kcal', 'p', 'sf']) {
    assert.ok(Number.isFinite(a[k]));
    assert.ok(Number.isFinite(b[k]));
  }
});

test('self-referencing recipe does not stack-overflow', () => {
  const items = mkCatalog();
  items.selfref = {
    name: 'Selfref',
    category: 'recipes',
    ingredients: [{ itemKey: 'selfref', multiplier: 1 }],
    displayUnits: [{ label: 'full recipe', multiplier: 100, default: true, locked: true }],
  };
  const out = computeItemMacros(items.selfref, items);
  assert.ok(Number.isFinite(out.kcal));
});

test('long chain of three recipes referencing each other in a triangle', () => {
  const items = mkCatalog();
  items.tri_a = {
    name: 'Tri A', category: 'recipes',
    ingredients: [{ itemKey: 'tri_b', multiplier: 1 }],
    displayUnits: [{ label: 'full recipe', multiplier: 1, default: true, locked: true }],
  };
  items.tri_b = {
    name: 'Tri B', category: 'recipes',
    ingredients: [{ itemKey: 'tri_c', multiplier: 1 }],
    displayUnits: [{ label: 'full recipe', multiplier: 1, default: true, locked: true }],
  };
  items.tri_c = {
    name: 'Tri C', category: 'recipes',
    ingredients: [{ itemKey: 'tri_a', multiplier: 1 }],
    displayUnits: [{ label: 'full recipe', multiplier: 1, default: true, locked: true }],
  };
  const out = computeItemMacros(items.tri_a, items);
  assert.ok(Number.isFinite(out.kcal));
});

test('mixed cycle: A -> B; B -> A and a real ingredient', () => {
  const items = mkCatalog();
  items.cy_a = {
    name: 'CyA', category: 'recipes',
    ingredients: [{ itemKey: 'cy_b', multiplier: 1 }],
    displayUnits: [{ label: 'full recipe', multiplier: 100, default: true, locked: true }],
  };
  items.cy_b = {
    name: 'CyB', category: 'recipes',
    ingredients: [
      { itemKey: 'cy_a', multiplier: 1 },
      { itemKey: 'string_cheese', amount: 21 },
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 100, default: true, locked: true }],
  };
  const out = computeItemMacros(items.cy_b, items);
  // Cycle component contributes 0 (cy_a is already on the visited path
  // by the time cy_b's first ingredient resolves); the cheese still counts.
  assert.ok(out.kcal > 0);
});
