import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatItemDisplayName } from '../lib/tracker-core.mjs';

test('formatItemDisplayName: name only when no brand and no amount', () => {
  assert.equal(formatItemDisplayName({ name: 'Apple' }), 'Apple');
});

test('formatItemDisplayName: appends brand in parens', () => {
  assert.equal(formatItemDisplayName({ name: 'Yogurt', brand: 'Chobani' }), 'Yogurt (Chobani)');
});

test('formatItemDisplayName: brand + amount', () => {
  const item = { name: 'Yogurt', brand: 'Chobani', amount: { value: 150, unit: 'g', label: '1 tub' } };
  assert.equal(formatItemDisplayName(item), 'Yogurt (Chobani · 1 tub / 150 g)');
});

test('formatItemDisplayName: amount label only', () => {
  const item = { name: 'X', amount: { label: 'small' } };
  assert.equal(formatItemDisplayName(item), 'X (small)');
});

test('formatItemDisplayName: amount value+unit, no label', () => {
  const item = { name: 'X', amount: { value: 100, unit: 'g' } };
  assert.equal(formatItemDisplayName(item), 'X (100 g)');
});

test('formatItemDisplayName: empty/whitespace brand is ignored', () => {
  assert.equal(formatItemDisplayName({ name: 'X', brand: '  ' }), 'X');
});

test('formatItemDisplayName: trims brand', () => {
  assert.equal(formatItemDisplayName({ name: 'X', brand: '  Z  ' }), 'X (Z)');
});

test('formatItemDisplayName: recipe with default variant label and size', () => {
  const item = {
    name: 'Pancake batch',
    category: 'recipes',
    ingredients: [{ itemKey: 'foo', amount: 100 }],
    displayUnits: [{ label: 'full recipe', multiplier: 500, default: true, locked: true }],
  };
  assert.equal(formatItemDisplayName(item), 'Pancake batch (full recipe / 500 g)');
});

test('formatItemDisplayName: recipe with no displayUnits falls back to synthesized variant', () => {
  // No item.amount and no item.displayUnits = fallback synthesizes one
  // 1-unit variant; formatItemDisplayName surfaces it as "1 unit / 1 g".
  const item = {
    name: 'Mystery recipe',
    category: 'recipes',
    ingredients: [{ itemKey: 'foo', amount: 100 }],
  };
  assert.equal(formatItemDisplayName(item), 'Mystery recipe (1 unit / 1 g)');
});

test('formatItemDisplayName: null/undefined item returns empty string', () => {
  assert.equal(formatItemDisplayName(null), '');
  assert.equal(formatItemDisplayName(undefined), '');
});

test('formatItemDisplayName: no amount, no brand returns plain name', () => {
  assert.equal(formatItemDisplayName({ name: 'Just A Thing' }), 'Just A Thing');
});

test('formatItemDisplayName: zero-value amount falls through to no-amount branch', () => {
  assert.equal(formatItemDisplayName({ name: 'X', amount: { value: 0, unit: 'g' } }), 'X');
});

test('formatItemDisplayName: recipe with default labeled "full recipe" trims correctly', () => {
  const item = {
    name: 'Stew',
    category: 'recipes',
    ingredients: [{ itemKey: 'foo', amount: 50 }],
    displayUnits: [{ label: 'full recipe', multiplier: 1500, default: true }],
  };
  assert.equal(formatItemDisplayName(item), 'Stew (full recipe / 1500 g)');
});
