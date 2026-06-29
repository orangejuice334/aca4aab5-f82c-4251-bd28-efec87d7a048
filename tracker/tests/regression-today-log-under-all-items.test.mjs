import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Luis's rule: when sort mode is 'alpha' or 'ratio' (the "All items" views),
// the Today's Log group must be nested INSIDE the All items group so the
// user sees today's actions immediately under the catalog they pull from.
// In 'category' mode the log keeps its original position at the top of the
// .checkout container.

function seed(sortMode = 'alpha') {
  // Seed today's bucket with a counter so renderTodayLog has rows to show.
  const today = new Date().toISOString().slice(0, 10);
  return {
    state: {
      days: {
        [today]: { counters: { string_cheese: 21 }, customs: [], toggles: {}, counterMeta: { string_cheese: new Date().toISOString() } },
      },
      activeDate: today,
      counters: { string_cheese: 21 },
      customs: [],
      sortMode,
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

test('today-log-group element exists and is initially placed somewhere', async () => {
  const h = await loadTracker({ seedState: seed('alpha') });
  try {
    const today = h.doc.getElementById('today-log-group');
    assert.ok(today, '#today-log-group element must exist');
  } finally { h.teardown(); }
});

test('alpha sort mode: today-log-group sits as a SIBLING after the All items group', async () => {
  const h = await loadTracker({ seedState: seed('alpha') });
  try {
    const allItems = h.doc.querySelector('.checkout-group[data-group-key="catalog-alpha"]');
    assert.ok(allItems, 'all-items (alpha) group must render');
    const today = h.doc.getElementById('today-log-group');
    assert.ok(today, 'today-log-group must exist');
    // Must NOT be a descendant of the all-items group (would get collapsed
    // when the group is collapsed).
    assert.ok(!allItems.contains(today),
      'today-log-group must NOT be nested inside the all-items group');
    // Must be a direct sibling of the all-items group, immediately after.
    assert.equal(today.parentElement, allItems.parentElement,
      'today-log-group must share a parent with the all-items group');
    assert.equal(allItems.nextElementSibling, today,
      'today-log-group must come directly AFTER the all-items group');
  } finally { h.teardown(); }
});

test('ratio sort mode: today-log-group sits as a SIBLING after the All items group', async () => {
  const h = await loadTracker({ seedState: seed('ratio') });
  try {
    const allItems = h.doc.querySelector('.checkout-group[data-group-key="catalog-ratio"]');
    assert.ok(allItems, 'all-items (ratio) group must render');
    const today = h.doc.getElementById('today-log-group');
    assert.ok(today, 'today-log-group must exist');
    assert.ok(!allItems.contains(today),
      'today-log-group must NOT be nested inside the all-items group');
    assert.equal(today.parentElement, allItems.parentElement);
    assert.equal(allItems.nextElementSibling, today,
      'today-log-group must come directly AFTER the all-items group');
  } finally { h.teardown(); }
});

test('alpha mode: collapsing the All Items group does NOT hide today-log', async () => {
  const h = await loadTracker({ seedState: seed('alpha') });
  try {
    const allItems = h.doc.querySelector('.checkout-group[data-group-key="catalog-alpha"]');
    const today = h.doc.getElementById('today-log-group');
    assert.ok(allItems && today);
    // Simulate a user collapse on the All Items group.
    allItems.classList.add('collapsed');
    // Today log lives OUTSIDE that group, so it must not be affected.
    assert.ok(!allItems.contains(today),
      'after collapse, today-log must still live outside the all-items group');
    assert.ok(!today.classList.contains('collapsed'),
      'today-log must not inherit the .collapsed class');
  } finally { h.teardown(); }
});

test('category sort mode: today-log-group lives outside any catalog group (top of .checkout)', async () => {
  const h = await loadTracker({ seedState: seed('category') });
  try {
    const today = h.doc.getElementById('today-log-group');
    assert.ok(today, 'today-log-group must still exist in category mode');
    // today-log IS a .checkout-group itself, so check its PARENT chain only.
    const parentGroup = today.parentElement && today.parentElement.closest('.checkout-group');
    assert.equal(parentGroup, null,
      'in category mode the today-log must NOT be nested inside another catalog group');
  } finally { h.teardown(); }
});
