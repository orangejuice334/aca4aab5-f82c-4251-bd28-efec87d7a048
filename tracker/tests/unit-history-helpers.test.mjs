import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostRecentMetricUpTo } from '../lib/tracker-core.mjs';

test('mostRecentMetricUpTo finds the latest weight on or before the date', () => {
  const days = {
    '2026-06-01': { weight: 98.5 },
    '2026-06-03': { weight: 98.2 },
    '2026-06-05': { weight: 97.9 },
  };
  assert.equal(mostRecentMetricUpTo(days, 'weight', '2026-06-05'), 97.9);
  assert.equal(mostRecentMetricUpTo(days, 'weight', '2026-06-04'), 98.2);
  assert.equal(mostRecentMetricUpTo(days, 'weight', '2026-06-01'), 98.5);
});

test('mostRecentMetricUpTo returns null when no readings exist on or before', () => {
  const days = { '2026-06-10': { weight: 90 } };
  assert.equal(mostRecentMetricUpTo(days, 'weight', '2026-06-05'), null);
});

test('mostRecentMetricUpTo returns null on empty / null inputs', () => {
  assert.equal(mostRecentMetricUpTo(null, 'weight', '2026-06-05'), null);
  assert.equal(mostRecentMetricUpTo({}, 'weight', '2026-06-05'), null);
});

test('mostRecentMetricUpTo skips non-numeric or zero values', () => {
  const days = {
    '2026-06-01': { weight: 0 },
    '2026-06-02': { weight: 'oops' },
    '2026-06-03': { weight: 95 },
  };
  assert.equal(mostRecentMetricUpTo(days, 'weight', '2026-06-04'), 95);
});

test('mostRecentMetricUpTo works for neck, waist, fatPercent fields', () => {
  const days = {
    '2026-06-01': { neck: 43, waist: 95 },
    '2026-06-04': { neck: 42, waist: null },
  };
  assert.equal(mostRecentMetricUpTo(days, 'neck', '2026-06-04'), 42);
  assert.equal(mostRecentMetricUpTo(days, 'waist', '2026-06-04'), 95);
});

test('mostRecentMetricUpTo lexicographic date comparison handles 12-digit strings', () => {
  const days = {
    '2026-01-09': { weight: 100 },
    '2026-01-10': { weight: 99 },
  };
  assert.equal(mostRecentMetricUpTo(days, 'weight', '2026-01-10'), 99);
});
