import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultMeasuredIn, isPer100, primaryUnit } from '../lib/tracker-core.mjs';

test('getDefaultMeasuredIn returns g when item is mass-measured', () => {
  assert.equal(getDefaultMeasuredIn({ defaultMeasuredIn: 'g' }), 'g');
});

test('getDefaultMeasuredIn returns ml when item is volume-measured', () => {
  assert.equal(getDefaultMeasuredIn({ defaultMeasuredIn: 'ml' }), 'ml');
});

test('getDefaultMeasuredIn returns units for explicit discrete items', () => {
  assert.equal(getDefaultMeasuredIn({ defaultMeasuredIn: 'units' }), 'units');
});

test('getDefaultMeasuredIn falls back to units for missing/null/empty fields', () => {
  assert.equal(getDefaultMeasuredIn(null), 'units');
  assert.equal(getDefaultMeasuredIn(undefined), 'units');
  assert.equal(getDefaultMeasuredIn({}), 'units');
  assert.equal(getDefaultMeasuredIn({ defaultMeasuredIn: null }), 'units');
  assert.equal(getDefaultMeasuredIn({ defaultMeasuredIn: 'oz' }), 'units');
});

test('isPer100 true only for g and ml', () => {
  assert.equal(isPer100({ defaultMeasuredIn: 'g' }), true);
  assert.equal(isPer100({ defaultMeasuredIn: 'ml' }), true);
  assert.equal(isPer100({ defaultMeasuredIn: 'units' }), false);
  assert.equal(isPer100({}), false);
  assert.equal(isPer100(null), false);
});

test('primaryUnit picks ml for ml items, g for everything else', () => {
  assert.equal(primaryUnit({ defaultMeasuredIn: 'ml' }), 'ml');
  assert.equal(primaryUnit({ defaultMeasuredIn: 'g' }), 'g');
  assert.equal(primaryUnit({ defaultMeasuredIn: 'units' }), 'g');
  assert.equal(primaryUnit({}), 'g');
  assert.equal(primaryUnit(null), 'g');
});
