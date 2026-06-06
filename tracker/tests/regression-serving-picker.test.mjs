import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servingPickerOptions } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('servingPickerOptions returns every variant + synthetic 1 g for a g item', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.turkey_breast_smithfield);
  const labels = out.map(o => o.label);
  // default first, then descending by size, then synthetic
  assert.equal(labels[0], '1 slice');                // default
  assert.ok(labels.includes('1 pkg'));
  assert.ok(labels.includes('1 g'));
});

test('servingPickerOptions surfaces the synthetic 1 g for items with only one variant', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.string_cheese);
  assert.equal(out.length, 2);
  assert.equal(out[0].label, '1 stick');
  assert.equal(out[1].label, '1 g');
});

test('servingPickerOptions for a recipe includes synthetic 1 g', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.scrambled_feggs);
  assert.ok(out.some(o => o.label === '1 g'));
});

test('servingPickerOptions returns all three scheduled supplement servings (no synthetic 1 g)', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.omega3_softgel);
  assert.equal(out.length, 3);
  assert.ok(!out.some(o => o.synthetic), 'units items must not add synthetic');
});

test('servingPickerOptions: default flag surfaces on the right entry', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.turkey_breast_smithfield);
  assert.equal(out.find(o => o.default).label, '1 slice');
});

test('servingPickerOptions empty / null inputs return empty array', () => {
  assert.deepEqual(servingPickerOptions(null), []);
  assert.deepEqual(servingPickerOptions(undefined), []);
});

test('servingPickerOptions: ml liquid surfaces 1 ml synthetic', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.soy_milk_unsw);
  assert.ok(out.some(o => o.label === '1 ml'));
});

test('servingPickerOptions: every entry has amount, multiplier, label, index', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.turkey_breast_smithfield);
  for (const e of out) {
    assert.ok(typeof e.label === 'string');
    assert.ok(typeof e.amount === 'number');
    assert.ok(typeof e.multiplier === 'number');
    assert.ok(typeof e.index === 'number');
  }
});

test('servingPickerOptions: indexes are unique and contiguous', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.turkey_breast_smithfield);
  const idxs = out.map(o => o.index);
  assert.deepEqual(idxs, idxs.map((_, i) => i));
});

test('servingPickerOptions: index 0 is the default variant', () => {
  const items = mkCatalog();
  const out = servingPickerOptions(items.turkey_breast_smithfield);
  assert.equal(out[0].default, true);
});
