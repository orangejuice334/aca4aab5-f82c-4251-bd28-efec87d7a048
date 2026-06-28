import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Archive group keeps its filter input like every other catalog group
// (Luis reverted the no-filter choice).

function seedWithArchived() {
  const items = mkCatalog();
  // Archive a couple of items so renderArchiveGroup actually emits the group.
  items.string_cheese = Object.assign({}, items.string_cheese, { archived: true, prevCategory: 'items' });
  items.salmon_atlantic_cooked = Object.assign({}, items.salmon_atlantic_cooked, { archived: true, prevCategory: 'items' });
  return {
    state: {
      days: {},
      customs: [],
      profile: { sex: 'M', ageYears: 35, heightCm: 175 },
      userCatalog: {
        items,
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

test('Archive group is rendered when there are archived items', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    const archive = h.doc.querySelector('.checkout-group.archive-group[data-group-key="catalog-archive"]');
    assert.ok(archive, 'archive group must render when archived items exist');
  } finally { h.teardown(); }
});

test('Archive group has its filter input like every other group', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    const archive = h.doc.querySelector('.checkout-group.archive-group');
    assert.ok(archive, 'archive group rendered');
    const filter = archive.querySelector('input[data-group-filter]');
    assert.ok(filter, 'archive group must include a [data-group-filter] input');
  } finally { h.teardown(); }
});

test('Other catalog groups still have their filter input', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    // Pick a category catalog group (data-group-key starts with 'catalog-cat-')
    // and confirm it still has its filter. Today-log + supplements-water
    // groups are not filterable, so we have to scope past them.
    const categoryGroups = h.doc.querySelectorAll('.checkout-group[data-group-key^="catalog-cat-"]');
    assert.ok(categoryGroups.length > 0, 'at least one category catalog group rendered');
    const filter = categoryGroups[0].querySelector('input[data-group-filter]');
    assert.ok(filter, 'category catalog groups must still include a filter input');
  } finally { h.teardown(); }
});
