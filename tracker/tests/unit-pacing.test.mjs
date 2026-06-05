import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pacingFraction, WINDOWS, DEFAULT_WINDOW } from '../lib/tracker-core.mjs';

test('DEFAULT_WINDOW covers 07:00 - 21:00', () => {
  assert.equal(DEFAULT_WINDOW.start, 7 * 60);
  assert.equal(DEFAULT_WINDOW.end, 21 * 60);
});

test('pacingFraction at start of window returns 0', () => {
  assert.equal(pacingFraction('kcal', 7 * 60), 0);
});

test('pacingFraction halfway through default window returns 0.5', () => {
  // midpoint between 7:00 and 21:00 is 14:00
  assert.equal(pacingFraction('kcal', 14 * 60), 0.5);
});

test('pacingFraction past end of window returns 1', () => {
  assert.equal(pacingFraction('kcal', 22 * 60), 1);
});

test('pacingFraction before window returns 0', () => {
  assert.equal(pacingFraction('kcal', 6 * 60), 0);
});

test('pacingFraction uses DEFAULT_WINDOW for unknown metrics', () => {
  // potassium isn't in WINDOWS but should fall back to default
  assert.equal(pacingFraction('potassium', 7 * 60), 0);
  assert.equal(pacingFraction('potassium', 21 * 60), 1);
  assert.equal(pacingFraction('potassium', 14 * 60), 0.5);
});

test('caffeine window ends earlier (noon cutoff)', () => {
  // caffeine: 07:00 - 12:00 (5h window)
  assert.equal(pacingFraction('caffeine', 12 * 60), 1);
  assert.equal(pacingFraction('caffeine', 9 * 60 + 30), 0.5);
});

test('water window stretches longer (07:00 - 23:00)', () => {
  // water: 07:00 - 23:00 (16h)
  assert.equal(pacingFraction('water', 15 * 60), 0.5);
  assert.equal(pacingFraction('water', 23 * 60), 1);
});

test('WINDOWS has explicit entries for all baseline metrics', () => {
  for (const k of ['kcal', 'p', 'carbs', 'fiber', 'sugar', 'fat', 'sf', 'water', 'caffeine', '_kcal_per_p']) {
    assert.ok(WINDOWS[k], 'missing window: ' + k);
  }
});
