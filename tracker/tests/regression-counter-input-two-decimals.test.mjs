import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Luis's rule: catalog & custom counter inputs must accept 2 decimals
// (step=0.01), not 1.

function seed() {
  return {
    state: {
      days: {},
      customs: [],
      profile: { sex: 'M', ageYears: 35, heightCm: 175 },
      userCatalog: {
        items: mkCatalog(),
        categories: [
          { key: 'items',          label: 'Items' },
          { key: 'liquids',        label: 'Liquids' },
          { key: 'supplements',    label: 'Supplements' },
          { key: 'recipes',        label: 'Recipes' },
        ],
      },
      toggles: {},
    },
  };
}

test('catalog row counter-value inputs use step=0.01 (2 decimals)', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const inputs = h.doc.querySelectorAll('input.counter-value[data-value]');
    assert.ok(inputs.length > 0, 'at least one catalog counter input rendered');
    for (const i of inputs) {
      assert.equal(i.getAttribute('step'), '0.01',
        `counter input step must be 0.01 (got "${i.getAttribute('step')}") for ${i.dataset.value}`);
    }
  } finally { h.teardown(); }
});
