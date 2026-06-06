import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayUnits, servingPickerOptions } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// Contract: EVERY catalog item exposes a size-1 picker option, so the
// recipe-as-ingredient flow can always type the raw native amount.

test('every g item has a 1 g synthetic in the picker', () => {
  const items = mkCatalog();
  for (const [k, v] of Object.entries(items)) {
    if (v.defaultMeasuredIn !== 'g') continue;
    const opts = servingPickerOptions(v);
    assert.ok(opts.some(o => o.amount === 1), 'missing size-1 picker for ' + k);
  }
});

test('every ml item has a 1 ml synthetic in the picker', () => {
  const items = mkCatalog();
  const ml = items.soy_milk_unsw;
  const opts = servingPickerOptions(ml);
  assert.ok(opts.some(o => o.label === '1 ml'));
});

test('every recipe has a 1 g synthetic in the picker', () => {
  const items = mkCatalog();
  const opts = servingPickerOptions(items.scrambled_feggs);
  assert.ok(opts.some(o => o.label === '1 g' && o.synthetic));
});

test('every units item has a 1 unit synthetic when no size-1 variant exists', () => {
  const items = {
    big_pill: {
      name: 'Big pill', category: 'supplements', defaultMeasuredIn: 'units',
      kcal: 5,
      displayUnits: [{ label: '1 bottle', multiplier: 60, default: true }],
    },
  };
  const opts = servingPickerOptions(items.big_pill);
  const synth = opts.find(o => o.synthetic);
  assert.ok(synth, 'units item must get a synthetic size-1 picker entry');
  assert.equal(synth.label, '1 unit');
  assert.equal(synth.amount, 1);
});

test('units items that already have a size-1 variant get no duplicate synthetic', () => {
  const items = mkCatalog();
  // omega3_softgel: 3 variants, all multiplier=1 (AM/Lunch/PM)
  const opts = servingPickerOptions(items.omega3_softgel);
  const size1 = opts.filter(o => o.amount === 1);
  // Three real variants exist; NO synthetic should be appended
  assert.equal(size1.length, 3);
  assert.ok(!opts.some(o => o.synthetic));
});

test('caffeine_capsule (single size-1 variant) gets no synthetic', () => {
  const items = mkCatalog();
  const opts = servingPickerOptions(items.caffeine_capsule);
  assert.ok(!opts.some(o => o.synthetic));
});

test('getDisplayUnits returns a size-1 entry for ANY non-empty catalog item', () => {
  const items = mkCatalog();
  for (const [k, v] of Object.entries(items)) {
    if (v.archived) continue;
    const variants = getDisplayUnits(v);
    const hasSize1 = variants.some(x => (x.unitsPerServing || x.multiplier) === 1);
    assert.ok(hasSize1, 'no size-1 variant for ' + k);
  }
});
