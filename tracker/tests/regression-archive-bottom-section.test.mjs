import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Luis's rules: the Archive bar sits at the very bottom of the page, after
// the Weight & BMI and Mood sections, and nothing on the page is nested -
// the "Archive · N items" group is itself the top-level bar, with no parent
// section wrapped around it.

function seedWithArchived() {
  const items = mkCatalog();
  items.string_cheese = Object.assign({}, items.string_cheese, { archived: true, prevCategory: 'items' });
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

test('Archive bar is a top-level bar: not nested inside any collapsible section or group', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    const archiveGroup = h.doc.querySelector('.checkout-group.archive-group');
    assert.ok(archiveGroup, 'archive group rendered');
    assert.equal(archiveGroup.closest('section[data-collapsible]'), null,
      'the archive bar must not sit inside a collapsible <section>');
    assert.equal(archiveGroup.parentElement.closest('.checkout-group, details'), null,
      'the archive bar must not sit inside another bar');
    assert.equal(h.doc.getElementById('archive-section'), null,
      'the old wrapping <section id="archive-section"> must be gone');
  } finally { h.teardown(); }
});

test('Archive bar comes AFTER the Weight & BMI and Mood sections in document order', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    const archiveGroup = h.doc.querySelector('.checkout-group.archive-group');
    for (const id of ['weight-tracker', 'mood-tracker']) {
      const section = h.doc.getElementById(id);
      assert.ok(section, id + ' must exist');
      const position = section.compareDocumentPosition(archiveGroup);
      assert.ok((position & h.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        'the archive bar must come AFTER #' + id);
    }
  } finally { h.teardown(); }
});

test('Archive bar does not live inside the catalog column (#checkout)', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    const archiveGroup = h.doc.querySelector('.checkout-group.archive-group');
    assert.equal(archiveGroup.closest('#checkout'), null, 'archive bar must not be inside #checkout');
    assert.equal(h.doc.getElementById('catalog-archive-container').hidden, false,
      'the archive host is visible while something is archived');
  } finally { h.teardown(); }
});

test('Archive host is hidden and empty when there are no archived items', async () => {
  const noArchived = { state: { days: {}, customs: [], profile: {}, userCatalog: { items: mkCatalog(), categories: [
    { key: 'items', label: 'Items' }, { key: 'liquids', label: 'Liquids' }, { key: 'supplements', label: 'Supplements' }, { key: 'recipes', label: 'Recipes' },
  ] }, toggles: {} } };
  const h = await loadTracker({ seedState: noArchived });
  try {
    const host = h.doc.getElementById('catalog-archive-container');
    assert.ok(host, 'archive host exists in static markup');
    assert.equal(host.hidden, true, 'archive host must be hidden when nothing is archived');
    assert.equal(host.querySelector('.archive-group'), null, 'no empty archive bar is rendered');
  } finally { h.teardown(); }
});
