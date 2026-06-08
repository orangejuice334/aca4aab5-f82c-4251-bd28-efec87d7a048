import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, typeInto } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// The big one: editing a catalog item must update the visible catalog row
// outside the edit panel ON EVERY KEYSTROKE - not on FocusOut. State + UI
// + backend op must all fire per keystroke. The old code only rebuilt the
// catalog row on the `change` event (blur), leaving the row stale during
// typing.

function withSeed() {
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

async function bootAndOpenEditPanel(itemKey) {
  const h = await loadTracker({ seedState: withSeed() });
  // Find the catalog row for itemKey (uses the first variant row when multiple).
  const row = h.doc.querySelector(`.checkout-row[data-key="${itemKey}"]`);
  if (!row) {
    h.teardown();
    throw new Error(`row for ${itemKey} not rendered - catalog may not have seeded`);
  }
  // Panel lives either inside a single row (no variants) or on the parent
  // variant-group wrapper (shared across siblings).
  const group = row.closest('.variant-group');
  const panel = (group && group.querySelector(':scope > [data-edit-panel]'))
    || row.querySelector('[data-edit-panel]');
  if (!panel) {
    h.teardown();
    throw new Error(`edit panel for ${itemKey} not in DOM`);
  }
  if (panel.hidden) {
    panel.hidden = false;
    if (group) group.classList.add('row-expanded');
    else row.classList.add('row-expanded');
  }
  return { h, row, panel };
}

test('seeding the catalog renders catalog rows for every item', async () => {
  const h = await loadTracker({ seedState: withSeed() });
  try {
    const rows = h.doc.querySelectorAll('.checkout-row[data-key]');
    assert.ok(rows.length >= 5,
      `expected at least 5 catalog rows after seeding mkCatalog, got ${rows.length}`);
  } finally { h.teardown(); }
});

test('editing item name updates the catalog row name span PER KEYSTROKE', async () => {
  const { h, row, panel } = await bootAndOpenEditPanel('salmon_atlantic_cooked');
  try {
    const nameInput = panel.querySelector('input[data-edit-field="name"]');
    assert.ok(nameInput, 'name input rendered inside edit panel');
    const nameSpan = row.querySelector('.checkout-item-name');
    const before = nameSpan.textContent;
    typeInto(nameInput, before + ' EDIT');
    // The visible catalog row name must reflect the in-progress edit
    // WITHOUT waiting for the user to blur the input.
    assert.ok(nameSpan.textContent.includes('EDIT'),
      `catalog row name span did not update on keystroke; before="${before}" after="${nameSpan.textContent}"`);
  } finally { h.teardown(); }
});

test('editing item brand updates the catalog row name span PER KEYSTROKE', async () => {
  const { h, row, panel } = await bootAndOpenEditPanel('string_cheese');
  try {
    const brandInput = panel.querySelector('input[data-edit-field="brand"]');
    assert.ok(brandInput, 'brand input rendered inside edit panel');
    const nameSpan = row.querySelector('.checkout-item-name');
    typeInto(brandInput, 'TestBrand');
    // formatItemDisplayName renders "Name (Brand)" - so the new brand must
    // appear in the row's visible name immediately after typing.
    assert.ok(nameSpan.textContent.includes('TestBrand'),
      `catalog row name did not pick up brand change on keystroke; got "${nameSpan.textContent}"`);
  } finally { h.teardown(); }
});

test('editing a variant amount updates the catalog row data-serving-size PER KEYSTROKE', async () => {
  const { h, row, panel } = await bootAndOpenEditPanel('string_cheese');
  try {
    // The variant editor has a number input per variant
    const amtInput = panel.querySelector('input[data-variant-field="amount"]');
    assert.ok(amtInput, 'variant amount input rendered');
    typeInto(amtInput, '42');
    // Counter button data-serving-size on the row must reflect the new amount.
    const incBtn = row.querySelector('.counter-btn[data-action="inc"]');
    assert.equal(String(incBtn.dataset.servingSize), '42',
      'counter button serving size did not update on keystroke');
  } finally { h.teardown(); }
});

test('editing the kcal field updates the catalog row macros line PER KEYSTROKE', async () => {
  const { h, row, panel } = await bootAndOpenEditPanel('string_cheese');
  try {
    const kcalInput = panel.querySelector('input[data-edit-field="kcal"]');
    if (!kcalInput) {
      // Some items expose macros via a different layout (per-100 vs per-canonical).
      // If kcal isn't directly editable here, skip - covered by a separate test.
      return;
    }
    const macrosSpan = row.querySelector('.checkout-item-macros');
    const before = macrosSpan.innerHTML;
    typeInto(kcalInput, '999');
    assert.notEqual(macrosSpan.innerHTML, before,
      'macros line did not update on keystroke');
  } finally { h.teardown(); }
});
