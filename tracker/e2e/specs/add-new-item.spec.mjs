import { test, expect } from '../support/fixtures.mjs';
import { TODAY, dayIn, isoAt } from '../support/seed.mjs';

// Add new catalog item: a one-off entry for today (default), or, with
// "Store for later", a reusable catalog item that also logs one serving
// today. The Store checkbox and the Add button exist at the top and bottom
// of the form and behave identically.

const customRows = page => page.locator('#today-customs-list .custom-row');

async function fillItem(tracker, fields) {
  await tracker.openAddItem();
  for (const [name, value] of Object.entries(fields)) {
    await tracker.addItemField(name).fill(String(value));
  }
}

const submitBottom = tracker => tracker.addItemForm().locator('[data-custom-submit]').last().click();
const submitTop = tracker => tracker.addItemForm().locator('[data-custom-submit]').first().click();

test.describe('Add new catalog item: one-off entries', () => {
  test("adding an item logs it under Today's Custom Items with a count of 1", { tag: '@mobile' }, async ({ tracker, page }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Pizza slice', kcal: 285, p: 12 });
    await submitBottom(tracker);
    await expect(customRows(page)).toHaveCount(1);
    await expect(customRows(page).first().locator('.checkout-item-name')).toHaveText('Pizza slice');
    await expect(customRows(page).first().locator('input.counter-value')).toHaveValue('1');
    await tracker.expectTotal('kcal', 285);
    await tracker.expectTotal('p', 12);
    const day = await tracker.cloudDay();
    expect(day.customs).toHaveLength(1);
    expect(day.customs[0]).toMatchObject({ name: 'Pizza slice', kcal: 285, p: 12, count: 1 });
  });

  test('the top Add button submits exactly like the bottom one', async ({ tracker, page }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Top-button snack', kcal: 120 });
    await submitTop(tracker);
    await expect(customRows(page)).toHaveCount(1);
    await tracker.expectTotal('kcal', 120);
  });

  test('a blank name is generated from calories and protein', async ({ tracker, page }) => {
    await tracker.open();
    await fillItem(tracker, { kcal: 250, p: 20 });
    await submitBottom(tracker);
    await expect(customRows(page).first().locator('.checkout-item-name')).toHaveText('250kcal 20p');
  });

  test('a blank name without protein uses calories alone', async ({ tracker, page }) => {
    await tracker.open();
    await fillItem(tracker, { kcal: 250 });
    await submitBottom(tracker);
    await expect(customRows(page).first().locator('.checkout-item-name')).toHaveText('250kcal');
  });

  test('calories left blank are stored as zero', async ({ tracker }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Diet soda' });
    await submitBottom(tracker);
    const day = await tracker.cloudDay();
    expect(day.customs[0]).toMatchObject({ name: 'Diet soda', kcal: 0 });
  });

  test('negative nutrient values are refused with a message and nothing is added', async ({ tracker, page }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Bad entry', kcal: 100, p: -5 });
    await submitBottom(tracker);
    const error = tracker.addItemForm().locator('[data-custom-error]');
    await expect(error).toBeVisible();
    await expect(error).toHaveText('All numeric fields must be ≥ 0.');
    await expect(customRows(page)).toHaveCount(0);
  });

  test('micronutrients typed into the form are stored on the entry', async ({ tracker }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Banana', kcal: 105, potassium: 422, fiber: 3.1 });
    await submitBottom(tracker);
    const day = await tracker.cloudDay();
    expect(day.customs[0]).toMatchObject({ name: 'Banana', kcal: 105, potassium: 422, fiber: 3.1 });
  });

  test('the form clears and closes after adding', async ({ tracker }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Clear me', kcal: 50 });
    await tracker.addItemField('store').check();
    await tracker.addItemField('store').uncheck();
    await submitBottom(tracker);
    await expect(tracker.addItemForm()).toHaveJSProperty('open', false);
    await tracker.openAddItem();
    await expect(tracker.addItemField('name')).toHaveValue('');
    await expect(tracker.addItemField('kcal')).toHaveValue('');
    await expect(tracker.addItemForm().locator('[data-custom-input="store"]').nth(0)).not.toBeChecked();
    await expect(tracker.addItemForm().locator('[data-custom-input="store"]').nth(1)).not.toBeChecked();
  });
});

test.describe("Today's custom items", () => {
  const withCustom = state => {
    dayIn(state, TODAY).customs.push({ id: 'custom-1', name: 'Pizza slice', kcal: 285, p: 12, count: 1, lastModified: isoAt('11:00') });
  };

  test('a one-off entry can be counted up, down and removed', async ({ tracker, page }) => {
    await tracker.open({ seed: withCustom });
    const row = customRows(page).first();
    await row.locator('[data-custom-action="inc"]').click();
    await expect(customRows(page).first().locator('input.counter-value')).toHaveValue('2');
    await tracker.expectTotal('kcal', 570);
    await customRows(page).first().locator('[data-custom-action="dec"]').click();
    await tracker.expectTotal('kcal', 285);
    await customRows(page).first().locator('[data-custom-delete]').click();
    await expect(customRows(page)).toHaveCount(0);
    await tracker.expectTotal('kcal', 0);
    const day = await tracker.cloudDay();
    expect(day.customs).toEqual([]);
  });

  test('a one-off count accepts decimals', async ({ tracker, page }) => {
    await tracker.open({ seed: withCustom });
    await customRows(page).first().locator('input.counter-value').fill('1.5');
    await tracker.expectTotal('kcal', 428);
    const day = await tracker.cloudDay();
    expect(day.customs[0].count).toBe(1.5);
  });
});

test.describe('Add new catalog item: Store for later', () => {
  test('the two Store-for-later checkboxes always mirror each other', async ({ tracker }) => {
    await tracker.open();
    await tracker.openAddItem();
    const boxes = tracker.addItemForm().locator('[data-custom-input="store"]');
    await boxes.nth(0).check();
    await expect(boxes.nth(1)).toBeChecked();
    await boxes.nth(1).uncheck();
    await expect(boxes.nth(0)).not.toBeChecked();
  });

  test('Store for later saves a reusable item in the chosen category and logs one serving today', async ({ tracker }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Homemade hummus', kcal: 180, p: 6 });
    await tracker.addItemField('category').selectOption('small_portions');
    await tracker.addItemField('store').check();
    await submitBottom(tracker);
    await expect(tracker.categoryBar('small_portions').locator('.checkout-item-name', { hasText: 'Homemade hummus' }).first()).toBeVisible();
    await tracker.expectTotal('kcal', 180);
    const state = await tracker.cloud();
    const entry = Object.entries(state.userCatalog.items).find(([, item]) => item.name === 'Homemade hummus');
    expect(entry, 'the stored item is in the catalog').toBeTruthy();
    expect(entry[1]).toMatchObject({ category: 'small_portions', kcal: 180, p: 6 });
    expect(state.days[TODAY].counters[entry[0]]).toBe(1);
  });

  test('a stored item keeps every nutrient typed into the form', async ({ tracker }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Lentil soup', kcal: 230, p: 18, sf: 0.4, fiber: 15.6, potassium: 731 });
    await tracker.addItemField('store').check();
    await submitTop(tracker);
    const state = await tracker.cloud();
    const soup = Object.values(state.userCatalog.items).find(item => item.name === 'Lentil soup');
    expect(soup).toMatchObject({ kcal: 230, p: 18, sf: 0.4, fiber: 15.6, potassium: 731 });
  });

  test('a new category can be created while storing an item', async ({ tracker }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Trail mix', kcal: 170, p: 5 });
    await tracker.addItemField('category').selectOption('__new__');
    const newCategory = tracker.addItemForm().locator('[data-new-cat-input]');
    await expect(newCategory).toBeVisible();
    await newCategory.fill('Snacks');
    await tracker.addItemField('store').check();
    await submitBottom(tracker);
    await expect(tracker.categoryBar('snacks').locator('.group-title')).toHaveText('Snacks');
    const state = await tracker.cloud();
    expect(state.userCatalog.categories).toEqual(expect.arrayContaining([{ key: 'snacks', label: 'Snacks' }]));
  });

  test('a category name that already exists is refused', async ({ tracker }) => {
    await tracker.open();
    await fillItem(tracker, { name: 'Dup test', kcal: 10 });
    await tracker.addItemField('category').selectOption('__new__');
    await tracker.addItemForm().locator('[data-new-cat-input]').fill('items');
    await submitBottom(tracker);
    await expect(tracker.addItemForm().locator('[data-custom-error]')).toHaveText('A category with that name already exists.');
  });
});
