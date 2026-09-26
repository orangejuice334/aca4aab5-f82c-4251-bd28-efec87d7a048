import { test, expect } from '../support/fixtures.mjs';
import { TODAY, YESTERDAY, dayIn, isoAt } from '../support/seed.mjs';

// Supplements and liquids: one check-box row per scheduled serving, sorted by
// time. Checking a row logs that serving; overdue rows are flagged. The
// profile's Supplements and liquids picker adds and removes schedules.

const scheduleRows = page => page.locator('#supplements-water-rows .checkout-row');
const scheduleRow = (page, key) => page.locator(`#supplements-water-rows .checkout-row[data-key="${key}"]`);
const checkBox = (page, key) => scheduleRow(page, key).locator('input[data-check]');
const pastTimeFlag = (page, key) => scheduleRow(page, key).locator('.checkout-flag');

test.describe('Supplements and liquids list', () => {
  test('lists every scheduled supplement and water serving in time order', { tag: '@mobile' }, async ({ tracker, page }) => {
    await tracker.open();
    await expect(scheduleRows(page).locator(':scope > div > .checkout-item-name')).toHaveText([
      'Vitamin D3 · 1 capsule',
      'Magnesium · AM',
      'Water · Morning',
      'Water · Afternoon',
      'Magnesium · PM',
    ]);
  });

  test('unscheduled supplements stay out of the list and keep their catalog counter', async ({ tracker, page }) => {
    await tracker.open();
    await expect(scheduleRows(page).filter({ hasText: 'Caffeine pill' })).toHaveCount(0);
    await expect(tracker.incButton('caffeine_pill')).toBeEnabled();
  });

  test('checking water servings adds and removes their volume', async ({ tracker, page }) => {
    await tracker.open();
    await checkBox(page, 'water_bottle#10:00').check();
    await tracker.expectTotal('water', 500);
    await checkBox(page, 'water_bottle#15:00').check();
    await tracker.expectTotal('water', 1250);
    await checkBox(page, 'water_bottle#10:00').uncheck();
    await tracker.expectTotal('water', 750);
    const day = await tracker.cloudDay();
    expect(day.toggles).toMatchObject({ 'water_bottle#10:00': false, 'water_bottle#15:00': true });
  });

  test('check marks survive a reload', async ({ tracker, page }) => {
    await tracker.open();
    await checkBox(page, 'vitamin_d#08:00').check();
    await checkBox(page, 'water_bottle#10:00').check();
    await tracker.waitForSyncIdle();
    await tracker.reload();
    await expect(checkBox(page, 'vitamin_d#08:00')).toBeChecked();
    await expect(checkBox(page, 'water_bottle#10:00')).toBeChecked();
    await expect(checkBox(page, 'magnesium#08:00')).not.toBeChecked();
    await tracker.expectTotal('water', 500);
  });

  test('a checked supplement adds its nutrients to the totals', async ({ tracker, page }) => {
    await tracker.open({ seed: state => { state.userCatalog.items.caffeine_pill.displayUnits[0].time = '07:00'; } });
    await checkBox(page, 'caffeine_pill#07:00').check();
    await tracker.expectTotal('caffeine', 100);
  });

  test('an overdue serving is flagged and the flag clears once it is checked', async ({ tracker, page }) => {
    await tracker.open(); // 12:00: vitamin D (08:00) and morning water (10:00) are more than an hour late
    await expect(pastTimeFlag(page, 'vitamin_d#08:00')).toHaveText('⚠ past time');
    await expect(pastTimeFlag(page, 'water_bottle#10:00')).toHaveText('⚠ past time');
    await expect(pastTimeFlag(page, 'water_bottle#15:00')).toHaveCount(0);
    await expect(pastTimeFlag(page, 'magnesium#21:00')).toHaveCount(0);
    await checkBox(page, 'vitamin_d#08:00').check();
    await expect(pastTimeFlag(page, 'vitamin_d#08:00')).toHaveCount(0);
  });

  test('a serving becomes overdue an hour after its time without a reload', async ({ tracker, page }) => {
    await tracker.open(); // 12:00
    await expect(pastTimeFlag(page, 'water_bottle#15:00')).toHaveCount(0);
    // 16:05: the 15:00 serving is past its hour of grace; the page's minute timer re-checks flags.
    await page.clock.fastForward('04:05:00');
    await expect(pastTimeFlag(page, 'water_bottle#15:00')).toHaveText('⚠ past time');
  });

  test('an every-other-day supplement taken yesterday is not flagged today', async ({ tracker, page }) => {
    await tracker.open({ seed: state => {
      state.userCatalog.items.vitamin_d.displayUnits[0].frequency = 'alternate';
      const yesterday = dayIn(state, YESTERDAY);
      yesterday.toggles['vitamin_d#08:00'] = true;
      yesterday.toggleMeta['vitamin_d#08:00'] = isoAt('08:05', YESTERDAY);
    } });
    await expect(scheduleRow(page, 'vitamin_d#08:00').locator('.checkout-item-name')).toHaveText('Vitamin D3 · 1 capsule (every other day)');
    await expect(pastTimeFlag(page, 'vitamin_d#08:00'), 'today is the off day of an every-other-day supplement').toHaveCount(0);
  });

  test("a scheduled supplement's catalog row mirrors its check mark and stays read-only", async ({ tracker, page }) => {
    await tracker.open();
    await expect(tracker.counterInput('vitamin_d')).toHaveValue('0');
    await checkBox(page, 'vitamin_d#08:00').check();
    await expect(tracker.counterInput('vitamin_d')).toHaveValue('1');
    await expect(tracker.incButton('vitamin_d')).toBeDisabled();
    await expect(tracker.decButton('vitamin_d')).toBeDisabled();
  });

  test('checking a serving on a past day logs it on that day, not today', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-date-prev').click();
    await checkBox(page, 'vitamin_d#08:00').check();
    await page.locator('#checkout-date-next').click();
    await expect(checkBox(page, 'vitamin_d#08:00')).not.toBeChecked();
    const state = await tracker.cloud();
    expect(state.days[YESTERDAY].toggles['vitamin_d#08:00']).toBe(true);
    expect(((state.days[TODAY] || {}).toggles || {})['vitamin_d#08:00']).toBeFalsy();
  });

  test('clicking a supplement row opens its editor, and a rename retitles every serving', async ({ tracker, page }) => {
    await tracker.open();
    const row = scheduleRow(page, 'magnesium#08:00');
    await row.locator('.checkout-item-name').click();
    const panel = row.locator('[data-edit-panel]');
    await expect(panel).toBeVisible();
    await panel.locator('[data-edit-field="name"]').fill('Magnesium glycinate');
    await row.locator('.checkout-item-name').click();
    await expect(scheduleRows(page).filter({ hasText: 'Magnesium' }).locator(':scope > div > .checkout-item-name'))
      .toHaveText(['Magnesium glycinate · AM', 'Magnesium glycinate · PM']);
    expect((await tracker.cloud()).userCatalog.items.magnesium.name).toBe('Magnesium glycinate');
  });
});

test.describe('Profile: supplement schedules', () => {
  test('scheduling a supplement adds it to the list at its time', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#supp-new-item').selectOption('caffeine_pill|0');
    await page.locator('#supp-new-time').fill('07:30');
    await page.locator('#supps-add-btn').click();
    await expect(scheduleRows(page).first().locator(':scope > div > .checkout-item-name')).toHaveText('Caffeine pill · 1 pill');
    await expect(page.locator('#supps-list .supps-row').first().locator('.supp-time')).toHaveText('07:30');
    const units = (await tracker.cloud()).userCatalog.items.caffeine_pill.displayUnits;
    expect(units).toEqual(expect.arrayContaining([expect.objectContaining({ label: '1 pill', multiplier: 1, time: '07:30', frequency: 'daily' })]));
  });

  test('an every-other-day schedule is labelled in the list', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#supp-new-item').selectOption('caffeine_pill|0');
    await page.locator('#supp-new-time').fill('07:30');
    await page.locator('#supp-new-frequency').selectOption('alternate');
    await page.locator('#supps-add-btn').click();
    await expect(scheduleRow(page, 'caffeine_pill#07:30').locator('.checkout-item-name')).toHaveText('Caffeine pill · 1 pill (every other day)');
    await expect(page.locator('#supps-list .supps-row[data-key="caffeine_pill#07:30"] .supp-freq')).toHaveText('every other day');
  });

  test('a second schedule at the same time is refused with a message', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#supp-new-item').selectOption('vitamin_d|0');
    await page.locator('#supp-new-time').fill('08:00');
    await page.locator('#supps-add-btn').click();
    await expect(page.locator('#supps-add-error')).toHaveText('Vitamin D3 already has a scheduled serving at 08:00.');
    await expect(scheduleRows(page)).toHaveCount(5);
  });

  test('adding without picking a supplement is refused with a message', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#supps-add-btn').click();
    await expect(page.locator('#supps-add-error')).toHaveText('Pick a supplement from the dropdown first.');
  });

  test('removing a schedule takes it off the list but keeps the item', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#supps-list [data-supp-delete="magnesium"][data-supp-slot="21:00"]').click();
    await expect(scheduleRow(page, 'magnesium#21:00')).toHaveCount(0);
    await expect(scheduleRow(page, 'magnesium#08:00')).toHaveCount(1);
    const magnesium = (await tracker.cloud()).userCatalog.items.magnesium;
    expect(magnesium.displayUnits.map(unit => [unit.label, unit.time || null])).toEqual([['AM', '08:00'], ['PM', null]]);
  });

  test("removing a schedule clears that serving's check marks", async ({ tracker, page }) => {
    await tracker.open({ seed: state => {
      const today = dayIn(state, TODAY);
      today.toggles['magnesium#21:00'] = true;
      today.toggleMeta['magnesium#21:00'] = isoAt('11:00');
    } });
    await page.locator('#supps-list [data-supp-delete="magnesium"][data-supp-slot="21:00"]').click();
    const day = await tracker.cloudDay();
    expect(day.toggles).not.toHaveProperty('magnesium#21:00');
  });
});
