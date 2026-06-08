import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, typeInto, waitMs } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Luis's spec: each keystroke should ultimately push the change to the gist
// backend (debounced via the op queue, not blocked on FocusOut). These tests
// observe the harness's fetchLog and verify that POSTs to /ops fire after
// the FLUSH_DEBOUNCE_MS (700ms) window, carrying a catalog_edit op for the
// item being edited.

const FLUSH_GRACE_MS = 900; // 700ms debounce + 200ms safety margin

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
          { key: 'small_portions', label: 'Small portions' },
          { key: 'uncategorized',  label: 'Uncategorized' },
        ],
      },
      toggles: {},
    },
  };
}

function opsPostsFor(fetchLog, opType) {
  const types = Array.isArray(opType) ? opType : [opType];
  return fetchLog
    .filter(e => e.method === 'POST' && /\/ops/.test(e.url))
    .map(e => { try { return JSON.parse(e.body); } catch (_) { return null; } })
    .filter(Boolean)
    .flatMap(body => (body.ops || []).filter(op => types.includes(op.type)));
}

test('typing in profile field pushes profile_update op via /ops within debounce window', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const input = h.doc.querySelector('input[data-profile="displayName"]');
    typeInto(input, 'Luis');
    await waitMs(FLUSH_GRACE_MS);
    const ops = opsPostsFor(h.fetchLog, 'profile_update');
    assert.ok(ops.length > 0, 'expected at least one profile_update op POSTed within debounce');
  } finally { h.teardown(); }
});

test('editing catalog item name fires catalog_edit op for that item', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const row = h.doc.querySelector('.checkout-row[data-key="string_cheese"]');
    const group = row.closest('.variant-group');
    const panel = group.querySelector(':scope > [data-edit-panel]');
    panel.hidden = false;
    const nameInput = panel.querySelector('input[data-edit-field="name"]');
    typeInto(nameInput, 'TestBackendSave');
    await waitMs(FLUSH_GRACE_MS);
    // emitDiffOps emits catalog_add for any item delta (the Worker treats
    // catalog_add as upsert), so look for either type.
    const edits = opsPostsFor(h.fetchLog, ['catalog_edit', 'catalog_add']);
    const ourEdit = edits.find(op => op.key === 'string_cheese');
    assert.ok(ourEdit, 'expected catalog_edit/catalog_add op for string_cheese after name edit');
    if (ourEdit.item) {
      assert.equal(ourEdit.item.name, 'TestBackendSave',
        'backend op should carry the freshly-edited name');
    }
  } finally { h.teardown(); }
});
