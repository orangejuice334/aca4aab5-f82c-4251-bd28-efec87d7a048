import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../support/fixtures.mjs';

// Smoke tests against the REAL catalog and history, taken from the local
// daily backup tracker/backups/lg-state.json. The page runs as the test user
// but every Worker call is answered here: the backup is served as the cloud
// state and writes are acknowledged without leaving the machine, so neither
// lg's gist nor the test gist is touched and no real data is uploaded.

const BACKUP_PATH = fileURLToPath(new URL('../../backups/lg-state.json', import.meta.url));
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, If-Match', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'X-Gist-Version' };

function loadBackup() {
  const backup = JSON.parse(readFileSync(BACKUP_PATH, 'utf8'));
  const state = backup.state;
  state.collapsedGroups = {};
  state.sortMode = 'category';
  const displayed = state.profile && Array.isArray(state.profile.displayedNutrients) ? state.profile.displayedNutrients : [];
  if (state.profile && !displayed.includes('kcal')) state.profile.displayedNutrients = ['kcal', ...displayed];
  return { state, takenAt: new Date(backup._backupTakenAt || backup._gistSavedAt) };
}

async function openWithRealData(tracker, page) {
  const { state, takenAt } = loadBackup();
  await page.route(url => url.hostname.endsWith('.workers.dev'), async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.searchParams.get('user') !== 'test') {
      await route.abort();
      return;
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const headers = { ...CORS, 'X-Gist-Version': 'lg-backup' };
    if (request.method() === 'GET' && url.pathname === '/state') {
      const gist = {
        id: 'lg-backup-served-locally',
        history: [{ version: 'lg-backup', url: '' }],
        files: { 'tracker-state.json': { content: JSON.stringify({ state, _savedAt: takenAt.toISOString() }) } },
      };
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(gist) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ ok: true, errors: [] }) });
  });
  await page.clock.install({ time: takenAt });
  await page.goto('track.html?user=test');
  await tracker.waitForLoaded();
  return state;
}

// ---- independent calorie oracle, following the documented ingredient rules ----
// amount → native units × kcal per native unit; multiplier on an item → that
// many of its default serving; multiplier on a recipe → that fraction of its
// batch; amount on a recipe → grams over its full-recipe grams.
const servingsOf = item => (Array.isArray(item.displayUnits) ? item.displayUnits.filter(Boolean) : []);
const fullRecipeServing = recipe => servingsOf(recipe).find(unit => unit.locked || /full recipe/i.test(unit.label || '')) || null;
function defaultServingSize(item) {
  const servings = servingsOf(item);
  const chosen = servings.find(unit => unit.default) || servings[0];
  if (chosen && typeof chosen.multiplier === 'number') return chosen.multiplier;
  return (item.amount && typeof item.amount.value === 'number') ? item.amount.value : 1;
}
const isRecipe = item => item && item.category === 'recipes' && Array.isArray(item.ingredients) && item.ingredients.length > 0;

function batchKcal(recipe, items, visiting = new Set()) {
  let total = 0;
  for (const ingredient of recipe.ingredients || []) {
    if (!ingredient) continue;
    if (!ingredient.itemKey) {
      total += Number(ingredient.kcal) || 0;
      continue;
    }
    const source = items[ingredient.itemKey];
    if (!source) throw new Error(`missing ingredient ${ingredient.itemKey}`);
    if (isRecipe(source)) {
      if (visiting.has(ingredient.itemKey)) continue;
      visiting.add(ingredient.itemKey);
      const sourceBatch = batchKcal(source, items, visiting);
      visiting.delete(ingredient.itemKey);
      let fraction = 0;
      if (typeof ingredient.multiplier === 'number') fraction = ingredient.multiplier;
      else if (typeof ingredient.amount === 'number') {
        const full = fullRecipeServing(source) || servingsOf(source)[0];
        const grams = (full && full.multiplier) || 1;
        fraction = ingredient.amount / grams;
      }
      total += sourceBatch * fraction;
      continue;
    }
    const kcalPerNativeUnit = Number(source.kcal) || 0;
    if (typeof ingredient.amount === 'number') total += ingredient.amount * kcalPerNativeUnit;
    else if (typeof ingredient.multiplier === 'number') total += ingredient.multiplier * defaultServingSize(source) * kcalPerNativeUnit;
  }
  return total;
}

test.describe('Real data smoke (local lg backup, nothing uploaded)', () => {
  test('the real catalog and history render without NaN, undefined or Infinity', async ({ tracker, page }) => {
    await openWithRealData(tracker, page);
    const text = await page.locator('main').innerText();
    for (const junk of ['NaN', 'undefined', 'Infinity', '[object Object]']) {
      const index = text.indexOf(junk);
      expect(index, `"${junk}" appears on the page: …${text.slice(Math.max(0, index - 80), index + 40)}…`).toBe(-1);
    }
  });

  test('every active catalog item gets a row', async ({ tracker, page }) => {
    const state = await openWithRealData(tracker, page);
    const expected = Object.entries(state.userCatalog.items)
      .filter(([, item]) => item && !item.archived && item.category !== 'water')
      .filter(([, item]) => !(isRecipe(item) && item.preserve === false))
      .map(([key]) => key);
    const rendered = new Set(await page.locator('#catalog-groups .checkout-row[data-key]').evaluateAll(rows => rows.map(row => row.dataset.key)));
    const missing = expected.filter(key => !rendered.has(key)).map(key => `${key} (${state.userCatalog.items[key].name}, category ${state.userCatalog.items[key].category})`);
    expect(missing, 'catalog items with no row anywhere').toEqual([]);
  });

  test("every recipe's full-recipe row shows what its ingredients add up to", async ({ tracker, page }) => {
    test.setTimeout(120000);
    const state = await openWithRealData(tracker, page);
    const items = state.userCatalog.items;
    const mismatches = [];
    let checked = 0;
    for (const [key, recipe] of Object.entries(items)) {
      if (!isRecipe(recipe) || recipe.archived || recipe.preserve === false) continue;
      const full = fullRecipeServing(recipe);
      if (!full || typeof full.multiplier !== 'number') continue;
      let expectedKcal;
      try {
        expectedKcal = batchKcal(recipe, items);
      } catch (error) {
        mismatches.push(`${recipe.name} (${key}): ${error.message}`);
        continue;
      }
      const row = tracker.rowForServing(key, full.multiplier);
      if (!(await row.count())) {
        mismatches.push(`${recipe.name} (${key}): no row for its ${full.multiplier} g full recipe`);
        continue;
      }
      const shownKcal = await tracker.rowKcal(row);
      checked += 1;
      if (!(Math.abs(shownKcal - expectedKcal) <= 1)) {
        mismatches.push(`${recipe.name} (${key}): full-recipe row shows ${shownKcal} kcal, its ingredients add up to ${expectedKcal.toFixed(1)} kcal`);
      }
    }
    expect(checked, 'recipes with a full-recipe row were found in the backup').toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });

  test('tapping + on every item adds exactly what its row shows', async ({ tracker, page }) => {
    test.setTimeout(300000);
    await openWithRealData(tracker, page);
    const keys = [...new Set(await page.locator('#catalog-groups .checkout-row[data-key]').evaluateAll(rows => rows.map(row => row.dataset.key)))];
    const mismatches = [];
    for (const key of keys) {
      const row = tracker.row(key);
      const plus = row.locator('.counter-btn[data-action="inc"]');
      if (await plus.isDisabled()) continue;
      const shownKcal = await tracker.rowKcal(row);
      if (!Number.isFinite(shownKcal)) {
        mismatches.push(`${key}: its row shows no calories`);
        continue;
      }
      const before = await tracker.total('kcal');
      await plus.click();
      const after = await tracker.total('kcal');
      if (!(Math.abs(after - before - shownKcal) <= 1)) {
        mismatches.push(`${key}: row shows ${shownKcal} kcal but + added ${after - before} kcal`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test('sorting the real catalog alphabetically keeps every item', async ({ tracker, page }) => {
    await openWithRealData(tracker, page);
    const keysNow = async () => new Set(await page.locator('#catalog-groups .checkout-row[data-key]').evaluateAll(rows => rows.map(row => row.dataset.key)));
    const byCategory = await keysNow();
    await page.locator('#sort-toggle').click();
    await expect(page.locator('#sort-toggle')).toHaveText('Sort: A–Z');
    const alphabetical = await keysNow();
    expect([...byCategory].filter(key => !alphabetical.has(key))).toEqual([]);
    expect(alphabetical.size).toBe(byCategory.size);
  });
});
