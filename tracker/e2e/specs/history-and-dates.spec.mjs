import { test, expect } from '../support/fixtures.mjs';
import { TODAY, YESTERDAY, dayIn, dayOffset, isoAt, localTime, logCounter } from '../support/seed.mjs';

// History (one row per logged day), the date arrows, day rollover, and the
// Weekly Tracker ribbon. Baseline: 2026-06-08 has only a 90.0 kg weigh-in;
// 2026-06-14 has a one-off lunch (295 kcal) at 13:00 and 89.2 kg.

const WEEK_AGO = dayOffset(-7);
const historyRow = (page, date) => page.locator(`#history-content tr.history-summary[data-date="${date}"]`);
const historyCell = (page, date, column) => historyRow(page, date).locator('td').nth(column);
const KCAL_COLUMN = 1;
const WEIGHT_COLUMN = 7;
const weeklyTile = (page, label) => page.locator('#warnings-list .warning-tile')
  .filter({ has: page.locator('.warning-tile-label', { hasText: new RegExp(`^${label}$`) }) });

test.describe('History', () => {
  test('lists every logged day newest first, with today marked', async ({ tracker, page }) => {
    await tracker.open();
    const dates = await page.locator('#history-content tr.history-summary').evaluateAll(rows => rows.map(row => row.dataset.date));
    expect(dates).toEqual([TODAY, YESTERDAY, WEEK_AGO]);
    await expect(historyCell(page, TODAY, 0)).toContainText(`${TODAY} (today)`);
  });

  test("today's row has no delete button; past rows do", async ({ tracker, page }) => {
    await tracker.open();
    await expect(historyRow(page, TODAY).locator('.history-delete-btn')).toHaveCount(0);
    await expect(historyRow(page, YESTERDAY).locator('.history-delete-btn')).toHaveCount(1);
  });

  test("a day's row expands to show what was eaten and when", async ({ tracker, page }) => {
    await tracker.open();
    await historyRow(page, YESTERDAY).click();
    const detail = page.locator(`#history-content tr.history-detail[data-date="${YESTERDAY}"]`);
    await expect(detail).toBeVisible();
    await expect(detail.locator('.hd-name')).toHaveText(['One-off lunch · 200 g (≈ 1 × full recipe)']);
    await expect(detail.locator('.hd-time')).toHaveText(['13:00']);
    await historyRow(page, YESTERDAY).click();
    await expect(detail).toBeHidden();
  });

  test("history totals match each day's log and follow new entries", async ({ tracker, page }) => {
    await tracker.open();
    await expect(historyCell(page, YESTERDAY, KCAL_COLUMN)).toHaveText('295');
    await expect(historyCell(page, TODAY, KCAL_COLUMN)).toHaveText('0');
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await expect(historyCell(page, TODAY, KCAL_COLUMN)).toHaveText('330');
  });

  test('a day with only a weigh-in still shows its weight', async ({ tracker, page }) => {
    await tracker.open();
    await expect(historyCell(page, WEEK_AGO, WEIGHT_COLUMN)).toContainText('90.0 kg');
    await expect(historyCell(page, WEEK_AGO, KCAL_COLUMN)).toHaveText('0');
  });

  test('deleting a past day removes it from history and the cloud', async ({ tracker, page }) => {
    await tracker.open();
    await historyRow(page, WEEK_AGO).locator('.history-delete-btn').click();
    await expect(historyRow(page, WEEK_AGO)).toHaveCount(0);
    expect((await tracker.cloud()).days).not.toHaveProperty(WEEK_AGO);
  });

  test('deleting a past day asks for confirmation first', async ({ tracker, page }) => {
    await tracker.open();
    tracker.dialogResponse = 'dismiss';
    await historyRow(page, YESTERDAY).locator('.history-delete-btn').click();
    expect(tracker.dialogs.map(dialog => dialog.type), 'a whole day of logs is one tap away from deletion').toEqual(['confirm']);
    await expect(historyRow(page, YESTERDAY)).toHaveCount(1);
  });

  test("archiving an item leaves past days' totals unchanged", async ({ tracker, page }) => {
    await tracker.open({ seed: state => logCounter(state, 'chicken_breast', 200, { dateKey: WEEK_AGO, at: '12:30' }) });
    await expect(historyCell(page, WEEK_AGO, KCAL_COLUMN)).toHaveText('330');
    const panel = await tracker.openEditPanel('chicken_breast');
    await panel.locator('[data-item-archive]').click();
    await expect(historyCell(page, WEEK_AGO, KCAL_COLUMN), 'what was eaten a week ago did not change').toHaveText('330');
  });
});

test.describe('Date navigation', () => {
  test('the arrows move between days and badge them past, today and future', async ({ tracker, page }) => {
    await tracker.open();
    const dateBar = page.locator('#checkout-date');
    await expect(dateBar).toContainText(TODAY);
    await expect(dateBar.locator('.date-badge')).toHaveText('today');
    await page.locator('#checkout-date-prev').click();
    await expect(dateBar).toContainText(YESTERDAY);
    await expect(dateBar.locator('.date-badge')).toHaveText('past');
    await page.locator('#checkout-date-next').click();
    await page.locator('#checkout-date-next').click();
    await expect(dateBar).toContainText(dayOffset(1));
    await expect(dateBar.locator('.date-badge')).toHaveText('future');
  });

  test("counters show the viewed day's amounts", async ({ tracker, page }) => {
    await tracker.open({ seed: state => logCounter(state, 'chicken_breast', 200, { dateKey: YESTERDAY, at: '12:00' }) });
    await expect(tracker.counterInput('chicken_breast', 200)).toHaveValue('0');
    await page.locator('#checkout-date-prev').click();
    await expect(tracker.counterInput('chicken_breast', 200)).toHaveValue('1');
    await tracker.expectTotal('kcal', 625);
    await page.locator('#checkout-date-next').click();
    await expect(tracker.counterInput('chicken_breast', 200)).toHaveValue('0');
  });

  test('logging while viewing a past day records it on that day', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-date-prev').click();
    await tracker.plus('rice_cooked', { servingSize: 160 });
    const state = await tracker.cloud();
    expect(state.days[YESTERDAY].counters.rice_cooked).toBe(160);
    expect(((state.days[TODAY] || {}).counters || {}).rice_cooked).toBeFalsy();
  });

  test('a reload always opens today', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-date-prev').click();
    await tracker.waitForSyncIdle();
    await tracker.reload();
    await expect(page.locator('#checkout-date')).toContainText(TODAY);
  });

  test('at midnight a page left open on today moves on to the new day', async ({ tracker, page }) => {
    await tracker.open({ at: localTime('23:59:30') });
    await expect(page.locator('#checkout-date .date-badge')).toHaveText('today');
    await page.clock.fastForward('02:00'); // 00:01:30 on Tue 2026-06-16; the page re-renders every minute
    const tomorrow = dayOffset(1);
    await expect(page.locator('#checkout-date')).toContainText(tomorrow);
    await expect(page.locator('#checkout-date .date-badge')).toHaveText('today');
    await tracker.plus('rice_cooked', { servingSize: 160 });
    const state = await tracker.cloud();
    expect(((state.days[tomorrow] || {}).counters || {}).rice_cooked, 'a snack after midnight belongs to the new day').toBe(160);
  });
});

test.describe('Weekly Tracker', () => {
  const coffeeEveryDay = state => {
    for (let offset = -6; offset <= 0; offset++) logCounter(state, 'black_coffee', 1000, { dateKey: dayOffset(offset), at: '08:00' });
  };

  test('seven days of 400 mg caffeine put the caffeine tile at its weekly limit', async ({ tracker, page }) => {
    await tracker.open({ seed: coffeeEveryDay });
    const tile = weeklyTile(page, 'Caffeine');
    await expect(tile).toHaveClass(/\bwarn\b/);
    await expect(tile.locator('.warning-tile-value')).toHaveText('2,800 mg');
    await expect(tile.locator('.warning-tile-bound')).toHaveText('≤ 2,800 mg / 7d');
  });

  test('caffeine logged eight days ago falls out of the weekly window', async ({ tracker, page }) => {
    await tracker.open({ seed: state => logCounter(state, 'black_coffee', 10000, { dateKey: dayOffset(-8), at: '08:00' }) });
    await expect(weeklyTile(page, 'Caffeine').locator('.warning-tile-value')).toHaveText('0 mg');
  });

  test('turning a weekly metric off in the profile hides its tile', async ({ tracker, page }) => {
    await tracker.open({ seed: coffeeEveryDay });
    await page.locator('#warnings-checklist [data-warning-toggle="caffeine"]').uncheck();
    await expect(weeklyTile(page, 'Caffeine')).toHaveCount(0);
    expect((await tracker.cloud()).profile.disabledWarnings).toEqual(['caffeine']);
  });

  test('the mercury limit scales with the latest body weight', async ({ tracker, page }) => {
    await tracker.open();
    // EPA reference dose 0.1 µg per kg per day: 0.1 × 89.2 kg × 7 days = 62.4, shown rounded.
    await expect(weeklyTile(page, 'Mercury').locator('.warning-tile-bound')).toContainText('≤ 62.0');
  });

  test('the weight-gain warning cites the calorie goal from the profile', async ({ tracker, page }) => {
    await tracker.open({ seed: state => {
      state.days[WEEK_AGO].weight = 88.0;
      state.days[YESTERDAY].weight = 89.0;
    } });
    await expect(weeklyTile(page, 'Weight Δ')).toHaveClass(/\bdanger\b/);
    const consequence = page.locator('#warnings-consequences .warning-consequence').filter({ hasText: 'Weight change' });
    await expect(consequence).toContainText('Gaining at 1.17 kg/wk');
    await expect(consequence, 'the profile goal is 1,650 kcal, not a hard-coded cut').toContainText('1,650 kcal');
  });

  test('the weight-loss warning explains the rule that actually fired', async ({ tracker, page }) => {
    await tracker.open(); // 90.0 → 89.2 kg over 6 days = 0.93 kg/week, inside the 0.5–1.0 window
    await expect(weeklyTile(page, 'Weight Δ').locator('.warning-tile-value')).toHaveText('-0.93 kg/wk');
    const consequence = page.locator('#warnings-consequences .warning-consequence').filter({ hasText: 'Weight change' });
    await expect(consequence).not.toContainText('is past the 0.5 to 1.0 kg/wk sustainable cut window');
  });

  test('checking a supplement counts toward the Supps column in history', async ({ tracker, page }) => {
    await tracker.open({ seed: state => {
      const today = dayIn(state, TODAY);
      today.toggles['vitamin_d#08:00'] = true;
      today.toggleMeta['vitamin_d#08:00'] = isoAt('08:02');
    } });
    // Three scheduled supplement servings exist: vitamin D 08:00, magnesium 08:00 and 21:00.
    await expect(historyCell(page, TODAY, 6)).toHaveText('1/3');
  });
});
