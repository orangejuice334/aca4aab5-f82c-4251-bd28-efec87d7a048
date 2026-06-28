import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Luis's rule: the Archive section sits at the very bottom of the page,
// after the Weight & BMI section, NOT mixed inside the Catalog section.

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

test('Archive section exists as a top-level <section id="archive-section">', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    const archive = h.doc.getElementById('archive-section');
    assert.ok(archive, 'archive-section must exist');
    assert.equal(archive.tagName.toLowerCase(), 'section',
      'archive-section must be a <section> element');
  } finally { h.teardown(); }
});

test('Archive section is AFTER the Weight & BMI section in document order', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    const weight = h.doc.getElementById('weight-tracker');
    const archive = h.doc.getElementById('archive-section');
    assert.ok(weight && archive, 'both sections must exist');
    const pos = weight.compareDocumentPosition(archive);
    assert.ok((pos & h.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      'archive-section must come AFTER weight-tracker in document order');
  } finally { h.teardown(); }
});

test('Archive content lives inside archive-section, NOT inside #checkout', async () => {
  const h = await loadTracker({ seedState: seedWithArchived() });
  try {
    const archiveGroup = h.doc.querySelector('.checkout-group.archive-group');
    assert.ok(archiveGroup, 'archive group rendered');
    const inArchiveSection = !!archiveGroup.closest('#archive-section');
    const inCheckout = !!archiveGroup.closest('#checkout');
    assert.ok(inArchiveSection, 'archive group must live inside #archive-section');
    assert.ok(!inCheckout, 'archive group must NOT live inside #checkout');
  } finally { h.teardown(); }
});

test('Archive section is hidden when there are no archived items', async () => {
  const noArchived = { state: { days:{}, customs:[], profile:{}, userCatalog:{items:mkCatalog(), categories:[
    {key:'items',label:'Items'},{key:'liquids',label:'Liquids'},{key:'supplements',label:'Supplements'},{key:'recipes',label:'Recipes'}
  ]}, toggles:{} } };
  const h = await loadTracker({ seedState: noArchived });
  try {
    const section = h.doc.getElementById('archive-section');
    assert.ok(section, 'archive section element exists in static markup');
    assert.equal(section.hidden, true,
      'archive section must be hidden when there are no archived items');
  } finally { h.teardown(); }
});
