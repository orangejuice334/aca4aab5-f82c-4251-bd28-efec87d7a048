import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleByNative, STORED_NUTRIENT_KEYS } from '../lib/tracker-core.mjs';

test('scaleByNative scales every nutrient by units', () => {
  const item = { kcal: 2, p: 0.2, sf: 0.05 };
  const out = scaleByNative(item, 100);
  assert.equal(out.kcal, 200);
  assert.equal(out.p, 20);
  assert.equal(out.sf, 5);
});

test('scaleByNative on null item returns zero nutrients', () => {
  const out = scaleByNative(null, 50);
  for (const k of STORED_NUTRIENT_KEYS) assert.equal(out[k], 0);
});

test('scaleByNative with zero units returns zero across the board', () => {
  const item = { kcal: 100, p: 50 };
  const out = scaleByNative(item, 0);
  for (const k of STORED_NUTRIENT_KEYS) assert.equal(out[k], 0);
});

test('scaleByNative handles missing nutrient fields as zero', () => {
  const item = { kcal: 2 };
  const out = scaleByNative(item, 10);
  assert.equal(out.kcal, 20);
  assert.equal(out.potassium, 0);
});

test('scaleByNative handles fractional units', () => {
  const item = { kcal: 100, p: 10 };
  const out = scaleByNative(item, 0.5);
  assert.equal(out.kcal, 50);
  assert.equal(out.p, 5);
});

test('scaleByNative handles negative units (still mathematically valid)', () => {
  const item = { kcal: 100 };
  const out = scaleByNative(item, -1);
  assert.equal(out.kcal, -100);
});

test('scaleByNative tolerates undefined units (treats as 0)', () => {
  const item = { kcal: 100 };
  const out = scaleByNative(item, undefined);
  assert.equal(out.kcal, 0);
});
