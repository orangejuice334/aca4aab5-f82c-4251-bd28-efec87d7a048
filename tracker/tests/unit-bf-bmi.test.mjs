import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNavyBodyFat, bmiFor } from '../lib/tracker-core.mjs';

test('computeNavyBodyFat returns a sensible value for a typical adult male', () => {
  const bf = computeNavyBodyFat(43, 100, 175, 'M');
  assert.ok(bf > 15 && bf < 35, `bf ${bf} out of range`);
});

test('computeNavyBodyFat returns null when neck >= waist (invalid geometry)', () => {
  assert.equal(computeNavyBodyFat(100, 90, 175, 'M'), null);
});

test('computeNavyBodyFat returns null when any input is missing', () => {
  assert.equal(computeNavyBodyFat(0, 100, 175, 'M'), null);
  assert.equal(computeNavyBodyFat(43, 0, 175, 'M'), null);
  assert.equal(computeNavyBodyFat(43, 100, 0, 'M'), null);
});

test('computeNavyBodyFat female branch requires hips', () => {
  assert.equal(computeNavyBodyFat(35, 80, 165, 'F'), null);
  const bf = computeNavyBodyFat(35, 80, 165, 'F', 100);
  assert.ok(bf > 15 && bf < 45);
});

test('computeNavyBodyFat reduces with smaller waist (more muscle / less fat)', () => {
  const fat = computeNavyBodyFat(43, 100, 175, 'M');
  const lean = computeNavyBodyFat(43, 85, 175, 'M');
  assert.ok(lean < fat, 'leaner waist should yield lower bf%');
});

test('bmiFor: 70 kg at 175 cm gives ~22.86', () => {
  const bmi = bmiFor(70, 175);
  assert.ok(Math.abs(bmi - 22.857) < 0.01);
});

test('bmiFor: null/0 inputs return null', () => {
  assert.equal(bmiFor(0, 175), null);
  assert.equal(bmiFor(70, 0), null);
  assert.equal(bmiFor(null, 175), null);
});

test('bmiFor scales correctly with height', () => {
  const a = bmiFor(70, 175);
  const b = bmiFor(70, 200);
  assert.ok(b < a, 'taller at same weight = lower BMI');
});
