import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, typeInto, changeTo, waitMs } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// Recipe Maker + Add New Item enhancements (ported from leanledger):
//  - each recipe ingredient row has a filter box that narrows its pick-item
//    dropdown (between the select and the X);
//  - both forms have a "Store for later" checkbox + Add button at TOP and
//    BOTTOM, kept in sync (tick one -> the other ticks), either Add works;
//  - recipe "Store for later" checked = reusable catalog recipe, unchecked
//    (default) = non-preserve one-off; neither auto-logs.

const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();

function seed() {
  return {
    state: {
      activeDate: TODAY,
      days: { [TODAY]: { counters: {}, customs: [], toggles: {}, counterMeta: {} } },
      counters: {}, customs: [],
      profile: { sex: 'M', ageYears: 35, heightCm: 175 },
      userCatalog: {
        items: mkCatalog(),
        categories: [
          { key: 'items', label: 'Items' }, { key: 'liquids', label: 'Liquids' },
          { key: 'supplements', label: 'Supplements' }, { key: 'recipes', label: 'Recipes' },
        ],
      },
      toggles: {},
    },
  };
}

function openDetails(doc, id) { const d = doc.getElementById(id); if (d) d.open = true; return d; }

// state/ITEMS are IIFE-scoped, not on window; read the persisted snapshot.
function readStore(h) {
  const raw = h.window.localStorage.getItem('19ff6f4d-3d5b-40e6-88e2-573f647f903f-state-lg');
  return raw ? JSON.parse(raw) : null;
}

// ---------- Add New Item: dual synced actions ----------
test('Add New Item has a store checkbox + Add button at top AND bottom', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const form = h.doc.getElementById('add-new-item');
    assert.equal(form.querySelectorAll('[data-custom-submit]').length, 2, 'two Add buttons');
    assert.equal(form.querySelectorAll('[data-custom-input="store"]').length, 2, 'two store checkboxes');
  } finally { h.teardown(); }
});

test('Add New Item store checkboxes stay in sync', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const form = h.doc.getElementById('add-new-item');
    const boxes = [...form.querySelectorAll('[data-custom-input="store"]')];
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new h.window.Event('change', { bubbles: true }));
    assert.equal(boxes[1].checked, true, 'bottom follows top');
    boxes[1].checked = false;
    boxes[1].dispatchEvent(new h.window.Event('change', { bubbles: true }));
    assert.equal(boxes[0].checked, false, 'top follows bottom');
  } finally { h.teardown(); }
});

test('Add New Item: the TOP Add button submits (creates a today custom)', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const form = openDetails(h.doc, 'add-new-item');
    typeInto(form.querySelector('[data-custom-input="name"]'), 'Test snack');
    typeInto(form.querySelector('[data-custom-input="kcal"]'), '250');
    const topBtn = form.querySelectorAll('[data-custom-submit]')[0];
    topBtn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    await waitMs(30);
    const customs = (readStore(h).days[TODAY] || {}).customs || [];
    assert.ok(customs.some(c => c.name === 'Test snack' && c.kcal === 250), 'top Add created the custom');
  } finally { h.teardown(); }
});

// ---------- Recipe Maker: filter ----------
test('recipe ingredient row has a filter box between the select and the X', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    openDetails(h.doc, 'recipe-maker');
    h.doc.querySelector('[data-recipe-ing-add]').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    await waitMs(20);
    const row = h.doc.querySelector('[data-recipe-ing-row]');
    assert.ok(row, 'a row was added');
    const top = row.querySelector('.recipe-ing-top');
    const kids = [...top.children].map(c => c.tagName.toLowerCase() + (c.matches('[data-recipe-ing-filter]') ? '.filter' : c.matches('[data-recipe-ing-select]') ? '.select' : c.matches('[data-recipe-ing-delete]') ? '.x' : ''));
    assert.deepEqual(kids, ['select.select', 'input.filter', 'button.x'], 'order: select, filter, X');
  } finally { h.teardown(); }
});

test('typing in the filter narrows the dropdown options', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    openDetails(h.doc, 'recipe-maker');
    h.doc.querySelector('[data-recipe-ing-add]').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    await waitMs(20);
    const row = h.doc.querySelector('[data-recipe-ing-row]');
    const select = row.querySelector('[data-recipe-ing-select]');
    const filter = row.querySelector('[data-recipe-ing-filter]');
    const before = select.querySelectorAll('option').length;
    assert.ok(before > 3, 'starts with many options');
    typeInto(filter, 'salmon');
    const labels = [...select.querySelectorAll('option')].map(o => o.textContent.toLowerCase());
    // placeholder + only salmon-matching options remain
    assert.ok(labels.length < before, 'filtered down');
    assert.ok(labels.every(l => l.includes('salmon') || l.includes('pick item')), 'only matches + placeholder: ' + labels.join('|'));
  } finally { h.teardown(); }
});

test('filter keeps the currently-selected option even if it does not match', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    openDetails(h.doc, 'recipe-maker');
    h.doc.querySelector('[data-recipe-ing-add]').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    await waitMs(20);
    const row = h.doc.querySelector('[data-recipe-ing-row]');
    const select = row.querySelector('[data-recipe-ing-select]');
    changeTo(select, 'salmon_atlantic_cooked');
    typeInto(row.querySelector('[data-recipe-ing-filter]'), 'zzz-no-match');
    assert.equal(select.value, 'salmon_atlantic_cooked', 'selection preserved');
    assert.ok([...select.options].some(o => o.value === 'salmon_atlantic_cooked'), 'selected option kept in list');
  } finally { h.teardown(); }
});

// ---------- Recipe Maker: store checkbox + dual actions ----------
test('recipe maker has store checkbox + Add at top AND bottom, synced, default unchecked', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const rm = h.doc.getElementById('recipe-maker');
    assert.equal(rm.querySelectorAll('[data-recipe-save]').length, 2, 'two Add buttons');
    const boxes = [...rm.querySelectorAll('[data-recipe-store]')];
    assert.equal(boxes.length, 2, 'two store checkboxes');
    assert.ok(boxes.every(b => !b.checked), 'default unchecked');
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new h.window.Event('change', { bubbles: true }));
    assert.equal(boxes[1].checked, true, 'synced');
  } finally { h.teardown(); }
});

async function buildRecipe(h, { store }) {
  openDetails(h.doc, 'recipe-maker');
  h.doc.querySelector('[data-recipe-ing-add]').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
  await waitMs(20);
  const row = h.doc.querySelector('[data-recipe-ing-row]');
  const select = row.querySelector('[data-recipe-ing-select]');
  changeTo(select, 'salmon_atlantic_cooked');
  await waitMs(20);
  const vinput = row.querySelector('[data-recipe-variant-input]');
  assert.ok(vinput, 'a variant input rendered');
  typeInto(vinput, '100');
  await waitMs(20);
  typeInto(h.doc.querySelector('[data-recipe-name]'), 'Test recipe');
  if (store) {
    const b = h.doc.querySelector('[data-recipe-store]');
    b.checked = true; b.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  }
}

test('saving with store UNCHECKED creates a non-preserve recipe (both Add buttons work)', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await buildRecipe(h, { store: false });
    // use the TOP Add button
    h.doc.querySelectorAll('[data-recipe-save]')[0].dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    await waitMs(30);
    const rec = readStore(h).userCatalog.items['test_recipe'];
    assert.ok(rec, 'recipe created');
    assert.equal(rec.category, 'recipes');
    assert.equal(rec.preserve, false, 'unchecked -> non-preserve one-off');
  } finally { h.teardown(); }
});

test('saving with store CHECKED creates a reusable (preserve) recipe', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await buildRecipe(h, { store: true });
    h.doc.querySelectorAll('[data-recipe-save]')[1].dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
    await waitMs(30);
    const rec = readStore(h).userCatalog.items['test_recipe'];
    assert.ok(rec, 'recipe created');
    assert.notEqual(rec.preserve, false, 'checked -> reusable (no preserve:false)');
  } finally { h.teardown(); }
});
