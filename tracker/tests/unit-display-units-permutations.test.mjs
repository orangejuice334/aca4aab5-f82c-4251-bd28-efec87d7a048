import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayUnits, orderVariantsForCatalog } from '../lib/tracker-core.mjs';

// Cartesian permutations of {measure, has-displayUnits, default-flag, size-1-present}

const measures = ['g', 'ml', 'units'];
const variantSets = [
  [],
  [{ label: 'big', multiplier: 100 }],
  [{ label: 'big', multiplier: 100 }, { label: 'small', multiplier: 10 }],
  [{ label: 'native', multiplier: 1 }],
  [{ label: 'big', multiplier: 100, default: true }, { label: 'small', multiplier: 10 }],
];

for (const m of measures) {
  for (const dus of variantSets) {
    test(`getDisplayUnits permutation: measure=${m} variants=${dus.length}`, () => {
      const item = { defaultMeasuredIn: m, displayUnits: dus.length ? dus : undefined };
      const out = getDisplayUnits(item);
      assert.ok(Array.isArray(out));
      assert.ok(out.length >= 1, 'always returns at least one variant');
      // unitsPerServing mirrored from multiplier on every entry
      for (const v of out) {
        if (typeof v.multiplier === 'number' && v.multiplier > 0) {
          assert.equal(v.unitsPerServing, v.multiplier);
        }
      }
      // Every item gets a size-1 entry: either an explicit variant
      // (multiplier === 1) or a synthetic trailer appended at the end.
      const explicitSize1 = dus.some(v => (v.multiplier || 0) === 1);
      if (dus.length > 0 && !explicitSize1) {
        const synth = out.find(v => v.synthetic);
        const expectedLabel = (m === 'g' || m === 'ml') ? '1 ' + m : '1 unit';
        assert.ok(synth, 'expected synthetic ' + expectedLabel + ' variant');
        assert.equal(synth.unitsPerServing, 1);
        assert.equal(synth.label, expectedLabel);
      }
      if (dus.length > 0 && explicitSize1) {
        // No duplicate synthetic when a real size-1 variant already exists.
        assert.ok(!out.some(v => v.synthetic));
      }
    });
  }
}

test('orderVariantsForCatalog: default-first invariant holds for many permutations', () => {
  const variants = [
    { label: 'a', unitsPerServing: 1 },
    { label: 'b', unitsPerServing: 100 },
    { label: 'c', unitsPerServing: 50, default: true },
    { label: 'd', unitsPerServing: 25 },
  ];
  const out = orderVariantsForCatalog(variants);
  assert.equal(out[0].label, 'c'); // default first
  // The rest should be sorted desc by unitsPerServing
  const rest = out.slice(1).map(v => v.unitsPerServing);
  for (let i = 1; i < rest.length; i++) assert.ok(rest[i - 1] >= rest[i]);
});

test('orderVariantsForCatalog idempotent under repeated application', () => {
  const variants = [
    { label: 'a', unitsPerServing: 1 },
    { label: 'b', unitsPerServing: 100 },
    { label: 'c', unitsPerServing: 50, default: true },
  ];
  const once = orderVariantsForCatalog(variants);
  const twice = orderVariantsForCatalog(once.slice());
  assert.deepEqual(once.map(v => v.label), twice.map(v => v.label));
});
