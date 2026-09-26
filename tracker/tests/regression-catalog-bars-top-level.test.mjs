import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, waitMs } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Luis: "I don't want any nested items anymore". The parent "Catalog"
// section is gone; every bar that used to sit inside it (Today's log,
// Supplements and liquids, each category group, Today's custom items, Add
// new catalog item, Recipe maker) is a top-level bar that collapses on its
// own.

const TODAY = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
})();

function seed() {
  return {
    state: {
      activeDate: TODAY,
      days: { [TODAY]: { counters: { string_cheese: 21 }, customs: [{ id: 'c1', name: 'Mystery snack', count: 1, kcal: 200 }], toggles: {}, counterMeta: { string_cheese: new Date().toISOString() } } },
      counters: { string_cheese: 21 },
      customs: [],
      profile: { sex: 'M', ageYears: 35, heightCm: 175 },
      userCatalog: {
        items: mkCatalog(),
        categories: [
          { key: 'items', label: 'Items' },
          { key: 'liquids', label: 'Liquids' },
          { key: 'supplements', label: 'Supplements' },
          { key: 'recipes', label: 'Recipes' },
        ],
      },
      toggles: {},
    },
  };
}

function catalogBars(doc) {
  return [
    doc.getElementById('today-log-group'),
    doc.querySelector('.checkout-group[data-group-key="supplements-water"]'),
    ...doc.querySelectorAll('#catalog-groups > .checkout-group'),
    doc.getElementById('today-customs-group'),
    doc.getElementById('add-new-item'),
    doc.getElementById('recipe-maker'),
  ];
}

test('there is no "Catalog" parent section or heading any more', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const headings = [...h.doc.querySelectorAll('h2')].map(el => el.textContent.trim());
    assert.ok(!headings.includes('Catalog'), 'no h2 reads "Catalog"; got: ' + headings.join(' | '));
    const catalogColumn = h.doc.getElementById('checkout');
    assert.ok(catalogColumn, 'the catalog layout column keeps id="checkout" for the print stylesheet');
    assert.notEqual(catalogColumn.tagName.toLowerCase(), 'section', '#checkout is a plain layout div, not a section');
    assert.equal(catalogColumn.hasAttribute('data-collapsible'), false, '#checkout is not collapsible');
  } finally { h.teardown(); }
});

test('every catalog bar is top-level: not inside a collapsible section, another bar, or a details', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(60);
    const bars = catalogBars(h.doc);
    assert.ok(bars.every(Boolean), 'all catalog bars exist');
    assert.ok(h.doc.querySelectorAll('#catalog-groups > .checkout-group').length >= 2, 'category groups rendered');
    for (const bar of bars) {
      const label = bar.id || bar.dataset.groupKey;
      assert.equal(bar.closest('section[data-collapsible]'), null, label + ' must not be inside a collapsible section');
      assert.equal(bar.parentElement.closest('.checkout-group, details'), null, label + ' must not be inside another bar');
    }
  } finally { h.teardown(); }
});

test('collapsing one category bar leaves its sibling bars expanded', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(60);
    const groups = [...h.doc.querySelectorAll('#catalog-groups > .checkout-group')];
    const [first, second] = groups;
    first.querySelector('.checkout-group-header').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    assert.equal(first.classList.contains('collapsed'), true, 'the clicked bar collapses');
    assert.equal(second.classList.contains('collapsed'), false, 'a sibling bar stays expanded');
    assert.equal(h.doc.getElementById('add-new-item').closest('.collapsed'), null, 'Add new catalog item is unaffected');
  } finally { h.teardown(); }
});
