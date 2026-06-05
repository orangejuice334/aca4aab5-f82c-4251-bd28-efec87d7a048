import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayUnits, orderVariantsForCatalog } from '../lib/tracker-core.mjs';

test('getDisplayUnits mirrors multiplier into unitsPerServing', () => {
  const out = getDisplayUnits({
    defaultMeasuredIn: 'g',
    displayUnits: [{ label: '1 cup', multiplier: 240 }],
  });
  assert.equal(out[0].unitsPerServing, 240);
  assert.equal(out[0].multiplier, 240);
});

test('getDisplayUnits appends synthetic 1 g for mass items missing a size-1 variant', () => {
  const out = getDisplayUnits({
    defaultMeasuredIn: 'g',
    displayUnits: [{ label: '1 stick', multiplier: 21 }],
  });
  assert.equal(out.length, 2);
  assert.equal(out[1].label, '1 g');
  assert.equal(out[1].multiplier, 1);
  assert.equal(out[1].synthetic, true);
});

test('getDisplayUnits appends synthetic 1 ml for ml items', () => {
  const out = getDisplayUnits({
    defaultMeasuredIn: 'ml',
    displayUnits: [{ label: '1 cup', multiplier: 240 }],
  });
  assert.equal(out[1].label, '1 ml');
  assert.equal(out[1].multiplier, 1);
});

test('getDisplayUnits does NOT append synthetic when a size-1 variant already exists', () => {
  const out = getDisplayUnits({
    defaultMeasuredIn: 'g',
    displayUnits: [
      { label: '1 cup', multiplier: 240 },
      { label: '1 g', multiplier: 1 },
    ],
  });
  assert.equal(out.length, 2);
  assert.ok(!out.some(v => v.synthetic));
});

test('getDisplayUnits skips synthetic for non-recipe units items', () => {
  const out = getDisplayUnits({
    defaultMeasuredIn: 'units',
    displayUnits: [{ label: '1 capsule', multiplier: 1 }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, '1 capsule');
});

test('getDisplayUnits adds 1 g synthetic to a recipe even when defaultMeasuredIn is units', () => {
  const out = getDisplayUnits({
    category: 'recipes',
    ingredients: [{ itemKey: 'whatever', amount: 100 }],
    displayUnits: [{ label: 'full recipe', multiplier: 500 }],
  });
  assert.equal(out.length, 2);
  assert.equal(out[1].label, '1 g');
});

test('getDisplayUnits falls back to amount when displayUnits is missing', () => {
  const out = getDisplayUnits({
    defaultMeasuredIn: 'g',
    amount: { value: 10, unit: 'g' },
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].unitsPerServing, 10);
  assert.equal(out[1].label, '1 g');
});

test('getDisplayUnits returns one variant if amount.value is already 1', () => {
  const out = getDisplayUnits({
    defaultMeasuredIn: 'g',
    amount: { value: 1, unit: 'g' },
  });
  assert.equal(out.length, 1);
});

test('getDisplayUnits handles null/undefined items defensively', () => {
  const a = getDisplayUnits(null);
  assert.ok(Array.isArray(a));
  assert.equal(a.length, 1);
});

test('orderVariantsForCatalog sorts by unitsPerServing descending', () => {
  const out = orderVariantsForCatalog([
    { label: 'small', unitsPerServing: 10 },
    { label: 'big', unitsPerServing: 100 },
    { label: 'medium', unitsPerServing: 50 },
  ]);
  assert.deepEqual(out.map(v => v.label), ['big', 'medium', 'small']);
});

test('orderVariantsForCatalog promotes the default variant to the front', () => {
  const out = orderVariantsForCatalog([
    { label: 'big', unitsPerServing: 100 },
    { label: 'medium', unitsPerServing: 50, default: true },
    { label: 'small', unitsPerServing: 10 },
  ]);
  assert.equal(out[0].label, 'medium');
  assert.deepEqual(out.slice(1).map(v => v.label), ['big', 'small']);
});

test('orderVariantsForCatalog handles empty input', () => {
  assert.deepEqual(orderVariantsForCatalog([]), []);
  assert.deepEqual(orderVariantsForCatalog(null), []);
});
