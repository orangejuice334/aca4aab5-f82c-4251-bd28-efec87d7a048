import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayUnits, orderVariantsForCatalog, scaleByNative } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// User-flow: add a new variant ("1 jar") to an existing item; verify the
// linked-input math still works in every direction (typing in any variant
// updates native units identically).

function nativeFromVariantInput(item, variantLabel, typed) {
  const v = orderVariantsForCatalog(getDisplayUnits(item)).find(u => u.label === variantLabel);
  if (!v) throw new Error('variant not found: ' + variantLabel);
  return (v.multiplier || v.unitsPerServing) * typed;
}

test('add a new variant ("1 jar") to an existing g item; native math stays correct', () => {
  const items = mkCatalog();
  items.peanut_butter = {
    name: 'Peanut butter',
    category: 'items',
    defaultMeasuredIn: 'g',
    kcal: 5.88, p: 0.25, sf: 0.03,
    displayUnits: [
      { label: '1 tbsp', multiplier: 16, default: true },
      { label: '100 g', multiplier: 100 },
    ],
  };
  // Add a new variant
  items.peanut_butter.displayUnits.push({ label: '1 jar', multiplier: 454 });
  // Typing 1 in "1 jar" => 454 g native
  assert.equal(nativeFromVariantInput(items.peanut_butter, '1 jar', 1), 454);
  // Typing 2 in "1 tbsp" => 32 g
  assert.equal(nativeFromVariantInput(items.peanut_butter, '1 tbsp', 2), 32);
  // Typing 50 in "100 g" => 5000 g
  assert.equal(nativeFromVariantInput(items.peanut_butter, '100 g', 50), 5000);
});

test('modify a variant\'s size via .multiplier in place; downstream scaling reflects change', () => {
  const items = mkCatalog();
  items.cheese = {
    name: 'Cheese',
    category: 'items',
    defaultMeasuredIn: 'g',
    kcal: 4.0,
    displayUnits: [{ label: '1 slice', multiplier: 28, default: true }],
  };
  // 1 slice = 28g => 112 kcal
  assert.equal(scaleByNative(items.cheese, 28).kcal, 112);
  // User updates the slice size to 42g
  items.cheese.displayUnits[0].multiplier = 42;
  assert.equal(scaleByNative(items.cheese, 42).kcal, 168);
});

test('multiple variants of the same item; default flag drives "first" only in catalog view', () => {
  const items = mkCatalog();
  items.x = {
    name: 'X', category: 'items', defaultMeasuredIn: 'g',
    kcal: 1,
    displayUnits: [
      { label: 'A', multiplier: 10 },
      { label: 'B', multiplier: 20, default: true },
      { label: 'C', multiplier: 50 },
    ],
  };
  const got = orderVariantsForCatalog(getDisplayUnits(items.x));
  // B first, then C and A by descending size
  assert.deepEqual(got.map(v => v.label).slice(0, 3), ['B', 'C', 'A']);
});

test('flipping the default flag updates orderVariantsForCatalog output', () => {
  const items = mkCatalog();
  items.x = {
    name: 'X', category: 'items', defaultMeasuredIn: 'g',
    kcal: 1,
    displayUnits: [
      { label: 'A', multiplier: 10 },
      { label: 'B', multiplier: 20, default: true },
    ],
  };
  let got = orderVariantsForCatalog(getDisplayUnits(items.x));
  assert.equal(got[0].label, 'B');
  items.x.displayUnits[1].default = false;
  items.x.displayUnits[0].default = true;
  got = orderVariantsForCatalog(getDisplayUnits(items.x));
  assert.equal(got[0].label, 'A');
});

test('removing all variants leaves getDisplayUnits with the amount/synthesized fallback', () => {
  const items = mkCatalog();
  items.x = {
    name: 'X', category: 'items', defaultMeasuredIn: 'g',
    kcal: 1,
    amount: { value: 10, unit: 'g' },
  };
  const got = getDisplayUnits(items.x);
  assert.ok(got.length >= 1);
  assert.equal(got[0].unitsPerServing, 10);
});
