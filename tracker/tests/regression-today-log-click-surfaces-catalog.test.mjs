import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, waitMs } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Feature: clicking a today-log entry surfaces that catalog item in its
// group filter box (so the user can bump the amount — "ate half now, half
// later"), expands the catalog + group, and highlights the row.

const TODAY = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
})();

function seed() {
  return {
    state: {
      activeDate: TODAY,
      days: { [TODAY]: { counters: { string_cheese: 21 }, customs: [], toggles: {}, counterMeta: { string_cheese: new Date().toISOString() } } },
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

test('today-log row for a catalog item is clickable and carries data-log-key', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(100);
    const row = h.doc.querySelector('#today-log-rows .today-log-row-clickable[data-log-key="string_cheese"]');
    assert.ok(row, 'today-log row for string_cheese must be clickable with data-log-key');
  } finally { h.teardown(); }
});

test('clicking a today-log row fills the item group filter with the item name', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(100);
    const logRow = h.doc.querySelector('#today-log-rows .today-log-row-clickable[data-log-key="string_cheese"]');
    assert.ok(logRow, 'clickable log row exists');
    logRow.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    await waitMs(50);
    // The catalog row's group filter input should now hold the item name.
    const catRow = h.doc.querySelector('.checkout-row[data-key="string_cheese"]');
    assert.ok(catRow, 'catalog row exists');
    const group = catRow.closest('.checkout-group[data-group-key]');
    assert.ok(group, 'catalog row is inside a group');
    const filter = group.querySelector('input[data-group-filter]');
    assert.ok(filter, 'group has a filter input');
    assert.ok(filter.value.toLowerCase().includes('mozzarella') || filter.value.toLowerCase().includes('string'),
      'filter should contain the item name; got "' + filter.value + '"');
  } finally { h.teardown(); }
});

test('clicking a today-log row surfaces the catalog row (flash class applied, group expanded)', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(100);
    const logRow = h.doc.querySelector('#today-log-rows .today-log-row-clickable[data-log-key="string_cheese"]');
    logRow.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    await waitMs(50);
    const catRow = h.doc.querySelector('.checkout-row[data-key="string_cheese"]');
    assert.ok(catRow.classList.contains('catalog-row-surfaced'), 'catalog row should get the surfaced highlight class');
    const group = catRow.closest('.checkout-group[data-group-key]');
    assert.ok(!group.classList.contains('collapsed'), 'the item group must be expanded after surfacing');
  } finally { h.teardown(); }
});

test('custom-item log rows are NOT clickable (no catalog row to surface)', async () => {
  const s = seed();
  s.state.days[TODAY].customs = [{ id: 'c1', name: 'Mystery snack', count: 1, kcal: 200, p: 5, lastModified: new Date().toISOString() }];
  s.state.customs = s.state.days[TODAY].customs;
  const h = await loadTracker({ seedState: s });
  try {
    await waitMs(100);
    const rows = [...h.doc.querySelectorAll('#today-log-rows .today-log-row')];
    const customRow = rows.find(r => (r.textContent || '').includes('Mystery snack'));
    assert.ok(customRow, 'custom row rendered');
    assert.ok(!customRow.classList.contains('today-log-row-clickable'),
      'custom rows must not be clickable (no catalog item behind them)');
    assert.equal(customRow.getAttribute('data-log-key'), null);
  } finally { h.teardown(); }
});
