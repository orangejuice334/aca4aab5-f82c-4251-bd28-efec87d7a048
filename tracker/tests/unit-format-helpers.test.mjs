import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt1, formatSize, dropTrailingZeros, roundStorage } from '../lib/tracker-core.mjs';

test('fmt1 strips trailing zero on whole numbers', () => {
  assert.equal(fmt1(5), '5');
  assert.equal(fmt1(5.0), '5');
});

test('fmt1 rounds to one decimal', () => {
  assert.equal(fmt1(3.27), '3.3');
  assert.equal(fmt1(0.55), '0.6');
});

test('fmt1 handles null / NaN / Infinity', () => {
  assert.equal(fmt1(null), '0');
  assert.equal(fmt1(undefined), '0');
  assert.equal(fmt1(NaN), '0');
  assert.equal(fmt1(Infinity), '0');
});

test('fmt1 handles negatives', () => {
  assert.equal(fmt1(-3.27), '-3.3');
  assert.equal(fmt1(-5), '-5');
});

test('formatSize returns whole numbers as integers', () => {
  assert.equal(formatSize(200), '200');
  assert.equal(formatSize(0), '0');
});

test('formatSize keeps one decimal when fractional', () => {
  assert.equal(formatSize(3.5), '3.5');
});

test('formatSize handles null / NaN', () => {
  assert.equal(formatSize(null), '0');
  assert.equal(formatSize(NaN), '0');
});

test('dropTrailingZeros leaves integer strings alone', () => {
  assert.equal(dropTrailingZeros('5'), '5');
});

test('dropTrailingZeros strips ".0", ".00", "5.50" trailing zeros', () => {
  assert.equal(dropTrailingZeros('5.0'), '5');
  assert.equal(dropTrailingZeros('5.00'), '5');
  assert.equal(dropTrailingZeros('5.50'), '5.5');
});

test('dropTrailingZeros preserves non-trailing zero', () => {
  assert.equal(dropTrailingZeros('5.55'), '5.55');
  assert.equal(dropTrailingZeros('0.005'), '0.005');
});

test('dropTrailingZeros coerces non-strings', () => {
  assert.equal(dropTrailingZeros(5.0), '5');
});

test('roundStorage rounds to 4 decimal places', () => {
  assert.equal(roundStorage(0.123456789), 0.1235);
  assert.equal(roundStorage(1.99999), 2);
});

test('roundStorage handles null / NaN as 0', () => {
  assert.equal(roundStorage(null), 0);
  assert.equal(roundStorage(NaN), 0);
});
