import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIngredientMacros } from '../lib/tracker-core.mjs';

// Regression: multiplier-form ingredients should resolve against the
// DEFAULT variant, not the first listed variant. Reordering displayUnits
// must not change macro math.

test('multiplier-form canon = default variant, not first variant', () => {
  // Item with non-default first + default second
  const items = {
    turkey: {
      name: 'Turkey',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 1.0, p: 0.18,
      displayUnits: [
        { label: '1 pkg', multiplier: 224 },              // first, NOT default
        { label: '2 slices', multiplier: 56, default: true },
        { label: '1 slice', multiplier: 28 },
      ],
    },
  };
  // multiplier=10 should resolve against default (2 slices = 56g),
  // not first (1 pkg = 224g). 10 × 56 = 560 g => 560 kcal.
  const out = computeIngredientMacros({ itemKey: 'turkey', multiplier: 10 }, items);
  assert.ok(Math.abs(out.kcal - 560) < 0.01,
    `expected ~560 kcal, got ${out.kcal}`);
});

test('falls back to first variant when no default is flagged', () => {
  const items = {
    plain: {
      name: 'Plain',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 1,
      displayUnits: [
        { label: 'A', multiplier: 100 },
        { label: 'B', multiplier: 50 },
      ],
    },
  };
  const out = computeIngredientMacros({ itemKey: 'plain', multiplier: 2 }, items);
  // 2 × 100 = 200 kcal (first variant is canon)
  assert.equal(out.kcal, 200);
});

test('reordering displayUnits with default flag preserved keeps macros stable', () => {
  const itemA = {
    name: 'X', category: 'items', defaultMeasuredIn: 'g', kcal: 1,
    displayUnits: [
      { label: 'big', multiplier: 100, default: true },
      { label: 'small', multiplier: 10 },
    ],
  };
  const itemB = {
    name: 'X', category: 'items', defaultMeasuredIn: 'g', kcal: 1,
    displayUnits: [
      { label: 'small', multiplier: 10 },
      { label: 'big', multiplier: 100, default: true },
    ],
  };
  const a = computeIngredientMacros({ itemKey: 'k', multiplier: 1 }, { k: itemA });
  const b = computeIngredientMacros({ itemKey: 'k', multiplier: 1 }, { k: itemB });
  assert.equal(a.kcal, b.kcal); // both should be 100 (default's multiplier)
});

test('moving default flag changes the macro semantics (intended)', () => {
  const item1 = {
    name: 'X', category: 'items', defaultMeasuredIn: 'g', kcal: 1,
    displayUnits: [
      { label: 'A', multiplier: 100, default: true },
      { label: 'B', multiplier: 10 },
    ],
  };
  const item2 = {
    name: 'X', category: 'items', defaultMeasuredIn: 'g', kcal: 1,
    displayUnits: [
      { label: 'A', multiplier: 100 },
      { label: 'B', multiplier: 10, default: true },
    ],
  };
  const a = computeIngredientMacros({ itemKey: 'k', multiplier: 1 }, { k: item1 });
  const b = computeIngredientMacros({ itemKey: 'k', multiplier: 1 }, { k: item2 });
  assert.equal(a.kcal, 100);
  assert.equal(b.kcal, 10);
});

test('supplement multiplier with single-variant default works', () => {
  const items = {
    cap: {
      name: 'Cap', category: 'supplements', defaultMeasuredIn: 'units',
      kcal: 5,
      displayUnits: [{ label: 'AM', multiplier: 1, default: true }],
    },
  };
  const out = computeIngredientMacros({ itemKey: 'cap', multiplier: 3 }, items);
  assert.equal(out.kcal, 15);
});
