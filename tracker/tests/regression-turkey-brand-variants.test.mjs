import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayUnits, orderVariantsForCatalog, resolveIngredient } from '../lib/tracker-core.mjs';

// Regression: an ingredient that's a branded g-item with multiple
// variants must expose the brand in resolveIngredient output AND
// surface every persisted variant (plus the synthetic 1 g) via
// getDisplayUnits / orderVariantsForCatalog.

test('branded multi-variant turkey item exposes brand suffix in resolveIngredient', () => {
  const items = {
    turkey_oven_classic: {
      name: 'Turkey breast oven classic',
      brand: 'Smithfield Safeway',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 1.0,
      displayUnits: [
        { label: '1 pkg', multiplier: 224 },
        { label: '2 slices', multiplier: 56, default: true },
        { label: '1 slice', multiplier: 28 },
      ],
    },
  };
  const r = resolveIngredient({ itemKey: 'turkey_oven_classic', amount: 28 }, items);
  assert.equal(r.name, 'Turkey breast oven classic (Smithfield Safeway)');
  assert.equal(r.kcal, 28);
});

test('branded multi-variant turkey item surfaces every variant in linked-input grid', () => {
  const item = {
    name: 'Turkey breast oven classic',
    brand: 'Smithfield Safeway',
    category: 'items',
    defaultMeasuredIn: 'g',
    displayUnits: [
      { label: '1 pkg', multiplier: 224 },
      { label: '2 slices', multiplier: 56, default: true },
      { label: '1 slice', multiplier: 28 },
    ],
  };
  const ordered = orderVariantsForCatalog(getDisplayUnits(item));
  const labels = ordered.map(v => v.label);
  // Default first, then descending by size, then synthetic 1 g
  assert.equal(labels[0], '2 slices');
  assert.ok(labels.includes('1 pkg'));
  assert.ok(labels.includes('1 slice'));
  assert.ok(labels.includes('1 g'));
});

test('synthetic 1 g lives at the end of getDisplayUnits for this item', () => {
  const item = {
    defaultMeasuredIn: 'g',
    displayUnits: [
      { label: '1 pkg', multiplier: 224 },
      { label: '2 slices', multiplier: 56, default: true },
      { label: '1 slice', multiplier: 28 },
    ],
  };
  const all = getDisplayUnits(item);
  const synth = all.find(v => v.synthetic);
  assert.ok(synth, 'expected a synthetic variant');
  assert.equal(synth.label, '1 g');
  assert.equal(synth.unitsPerServing, 1);
});

test('item missing brand renders ingredient name without parens', () => {
  const items = {
    no_brand_turkey: {
      name: 'Turkey breast',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 1.0,
      displayUnits: [{ label: '1 slice', multiplier: 28, default: true }],
    },
  };
  const r = resolveIngredient({ itemKey: 'no_brand_turkey', amount: 28 }, items);
  assert.equal(r.name, 'Turkey breast');
});

test('item with whitespace-only brand falls back to no-brand display', () => {
  const items = {
    s: { name: 'Item', brand: '   ', category: 'items', defaultMeasuredIn: 'g', kcal: 1,
         displayUnits: [{ label: '1 g', multiplier: 1, default: true }] },
  };
  const r = resolveIngredient({ itemKey: 's', amount: 1 }, items);
  assert.equal(r.name, 'Item');
});
