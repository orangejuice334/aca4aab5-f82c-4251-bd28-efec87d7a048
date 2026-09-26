import { test, expect } from '../support/fixtures.mjs';
import { TODAY, YESTERDAY, dayIn, isoAt, logCounter } from '../support/seed.mjs';

// Today's log: everything logged on the viewed day, earliest first. Clicking
// an entry surfaces that catalog item in its bar filter ("ate half now, half
// later"). Recipe entries list each ingredient, a divider, then the totals.

const entryNames = tracker => tracker.todayLogRows().locator(':scope > div > .checkout-item-name');
const totalsLine = entry => entry.locator(':scope > div > .checkout-item-macros');

function seedMixedDay(state) {
  logCounter(state, 'rice_cooked', 160, { at: '08:35' });
  logCounter(state, 'chicken_breast', 200, { at: '07:10' });
  logCounter(state, 'protein_shake', 330, { at: '11:05' });
  const day = dayIn(state, TODAY);
  day.customs.push({ id: 'custom-pizza', name: 'Pizza slice', kcal: 285, p: 12, count: 1, lastModified: isoAt('09:00') });
  day.toggles.vitamin_d = true;
  day.toggleMeta.vitamin_d = isoAt('07:45');
}

test.describe("Today's log", () => {
  test('stays hidden until something is logged, then lists it with its amount', async ({ tracker }) => {
    await tracker.open();
    await expect(tracker.todayLog()).toBeHidden();
    await tracker.plus('protein_shake', { servingSize: 330 });
    await expect(tracker.todayLog()).toBeVisible();
    await expect(entryNames(tracker)).toHaveText(['Protein shake · 330 ml']);
    await expect(totalsLine(tracker.todayLogRows().first())).toContainText('165 kcal');
  });

  test('lists entries by the time they were logged, earliest first', async ({ tracker }) => {
    await tracker.open({ seed: seedMixedDay });
    await expect(entryNames(tracker)).toHaveText([
      'Chicken breast (Test Farms) · 200 g',
      'Vitamin D3 · 1 capsule',
      'White rice · 160 g',
      'Pizza slice (custom) ×1',
      'Protein shake · 330 ml',
    ]);
    await expect(tracker.todayLogRows().locator('.hd-time-inline')).toHaveText(['07:10', '07:45', '08:35', '09:00', '11:05']);
  });

  test('a newly logged item joins the bottom of the log', async ({ tracker }) => {
    await tracker.open({ seed: seedMixedDay });
    await tracker.plus('greek_yogurt', { servingSize: 340 });
    await expect(entryNames(tracker).last()).toHaveText('Greek yogurt · 340 g');
    await expect(tracker.todayLogRows().last().locator('.hd-time-inline')).toHaveText(/^12:0\d$/);
  });

  test('clicking an entry puts the item name in its bar filter and shows only that item', { tag: '@mobile' }, async ({ tracker }) => {
    await tracker.open({ seed: seedMixedDay });
    await tracker.todayLogRows().filter({ hasText: 'Chicken breast' }).click();
    await expect(tracker.barFilter('catalog-cat-items')).toHaveValue('Chicken breast (Test Farms)');
    await expect(tracker.row('chicken_breast')).toBeVisible();
    await expect(tracker.row('rice_cooked')).toBeHidden();
    await expect(tracker.row('chicken_breast')).toBeInViewport();
  });

  test('clicking an entry opens its collapsed bar', async ({ tracker }) => {
    await tracker.open({ seed: state => { seedMixedDay(state); state.collapsedGroups = { 'catalog-cat-items': true }; } });
    await tracker.todayLogRows().filter({ hasText: 'White rice' }).click();
    await expect(tracker.categoryBar('items')).not.toHaveClass(/collapsed/);
    await expect(tracker.row('rice_cooked')).toBeVisible();
  });

  test('one-off custom entries are not clickable', async ({ tracker }) => {
    await tracker.open({ seed: seedMixedDay });
    const custom = tracker.todayLogRows().filter({ hasText: 'Pizza slice' });
    await expect(custom).not.toHaveClass(/today-log-row-clickable/);
    await expect(custom).not.toHaveAttribute('data-log-key', /./);
  });

  test('a recipe entry lists each ingredient, then a divider, then the recipe totals', async ({ tracker }) => {
    await tracker.open({ seed: state => logCounter(state, 'chicken_rice_bowl', 375, { at: '12:00' }) });
    const entry = tracker.todayLogRows().filter({ hasText: 'Chicken rice bowl' });
    await expect(entry.locator(':scope > div > .checkout-item-name')).toHaveText('Chicken rice bowl (full recipe / 375 g) · 375 g');
    await expect(entry.locator('.today-log-ingredient-name')).toHaveText(['Chicken breast (Test Farms) · 200 g', 'White rice · 160 g', 'Olive oil · 15 ml']);
    await expect(entry.locator('.today-log-ingredients > hr.today-log-totals-sep')).toHaveCount(1);
    await expect(totalsLine(entry)).toContainText('658 kcal');
  });

  test('a half-bowl entry scales every ingredient to half', async ({ tracker }) => {
    await tracker.open({ seed: state => logCounter(state, 'chicken_rice_bowl', 187.5, { at: '12:00' }) });
    const entry = tracker.todayLogRows().filter({ hasText: 'Chicken rice bowl' });
    await expect(entry.locator('.today-log-ingredient-name')).toHaveText(['Chicken breast (Test Farms) · 100 g', 'White rice · 80 g', 'Olive oil · 7.5 ml']);
    await expect(entry.locator('.today-log-ingredient').first().locator('.checkout-item-macros')).toContainText('165 kcal');
    await expect(totalsLine(entry)).toContainText('329 kcal');
  });

  test('ingredient calories in a recipe entry add up to the recipe total', async ({ tracker }) => {
    await tracker.open({ seed: state => {
      logCounter(state, 'chicken_rice_bowl', 375, { at: '08:00' });
      logCounter(state, 'recipe_in_recipe', 365, { at: '09:00' });
      logCounter(state, 'inline_breakfast', 1, { at: '10:00' });
    } });
    const sums = await tracker.todayLogRows().evaluateAll(rows => rows.map(row => {
      const kcalOf = element => {
        const cell = [...element.querySelectorAll('span')].map(span => span.textContent.trim()).find(text => /^[\d.]+ kcal$/.test(text));
        return cell ? parseFloat(cell) : 0;
      };
      const ingredients = [...row.querySelectorAll('.today-log-ingredient .checkout-item-macros')].reduce((sum, element) => sum + kcalOf(element), 0);
      const total = kcalOf(row.querySelector(':scope > div > .checkout-item-macros'));
      return { name: row.querySelector('.checkout-item-name').textContent, ingredients, total };
    }));
    expect(sums).toHaveLength(3);
    for (const entry of sums) expect(Math.abs(entry.ingredients - entry.total), entry.name).toBeLessThanOrEqual(1);
  });

  test("a past day's one-off recipe entry shows the recipe as it was that day", async ({ tracker, page }) => {
    await tracker.open({ seed: state => {
      const frozen = JSON.parse(JSON.stringify(state.userCatalog.items.one_off_lunch));
      frozen.ingredients = [{ itemKey: 'chicken_breast', amount: 300 }, { itemKey: 'rice_cooked', amount: 100 }];
      frozen.displayUnits = [{ label: 'full recipe', multiplier: 400, amount: 400, unit: 'g', default: true, locked: true }];
      state.days[YESTERDAY].recipeSnapshots.one_off_lunch = frozen;
      state.days[YESTERDAY].counters.one_off_lunch = 400;
    } });
    await page.locator('#checkout-date-prev').click();
    await tracker.expectTotal('kcal', 625);
    const entry = tracker.todayLogRows().filter({ hasText: 'One-off lunch' });
    await expect(totalsLine(entry), 'the entry matches the day total, not the current recipe').toContainText('625 kcal');
    await expect(entry.locator('.today-log-ingredient-name').first()).toHaveText('Chicken breast (Test Farms) · 300 g');
  });

  test('supplement and water check marks appear at the time they were checked', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#supplements-water-rows .checkout-row[data-key="water_bottle#10:00"] input[data-check]').check();
    await expect(entryNames(tracker)).toHaveText(['Water · Morning · 500 ml']);
    await expect(tracker.todayLogRows().first().locator('.hd-time-inline')).toHaveText(/^12:0\d$/);
    await expect(totalsLine(tracker.todayLogRows().first())).toContainText('500ml water');
  });

  test('entry times follow the 12-hour preference', async ({ tracker }) => {
    await tracker.open({ seed: state => { seedMixedDay(state); state.profile.display.timeFormat = '12h'; } });
    await expect(tracker.todayLogRows().first().locator('.hd-time-inline')).toHaveText('7:10 AM');
    await expect(tracker.todayLogRows().last().locator('.hd-time-inline')).toHaveText('11:05 AM');
  });
});
