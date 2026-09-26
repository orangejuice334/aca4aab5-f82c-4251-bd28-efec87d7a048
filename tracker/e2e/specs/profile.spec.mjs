import { test, expect } from '../support/fixtures.mjs';
import { YESTERDAY, logCounter } from '../support/seed.mjs';

// Profile: identity, body, daily goals, display preferences, displayed
// nutrients. Every field saves as you type and re-renders what depends on it.
// Baseline: M, 42 y, 183 cm, light activity, latest weight 89.2 kg,
// goals 1650 kcal / 184 g protein.

const profileField = (page, path) => page.locator(`#profile-form [data-profile="${path}"]`);

test.describe('Profile: goals', () => {
  test('changing the calorie goal updates the totals strip right away', async ({ tracker, page }) => {
    await tracker.open({ seed: state => logCounter(state, 'chicken_breast', 200) });
    await profileField(page, 'goals.kcal').fill('2000');
    await expect(page.locator('[data-nutrient="kcal"] .checkout-total-goal')).toContainText('/ 2,000 kcal');
    await expect(page.locator('[data-pct="kcal"]')).toHaveText('(17% · -1670)');
    expect((await tracker.cloud()).profile.goals.kcal).toBe(2000);
  });

  test('changing the protein goal moves the kcal/p cutoff in the header and the catalog', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'goals.p').fill('100');
    await expect(page.locator('#ratio-cutoff')).toHaveText('16.5 kcal/p');
    await expect(tracker.categoryBar('items').locator('.protein-cutoff-label')).toHaveText('16.50 kcal/p — daily cutoff (1650/100)');
  });

  test('a negative goal is ignored', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'goals.kcal').fill('-5');
    await profileField(page, 'goals.kcal').blur();
    expect((await tracker.cloud()).profile.goals.kcal).toBe(1650);
  });

  test('goal edits survive a reload', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'goals.p').fill('200');
    await profileField(page, 'goals.water').fill('3500');
    await tracker.waitForSyncIdle();
    await tracker.reload();
    await expect(profileField(page, 'goals.p')).toHaveValue('200');
    await expect(profileField(page, 'goals.water')).toHaveValue('3500');
  });
});

test.describe('Profile: identity and body', () => {
  test('the display name renames the page', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'displayName').fill('Tester');
    await expect(page.locator('#page-h1')).toHaveText('Tester Tracker');
    await expect(page).toHaveTitle('Tester Tracker');
    await expect(page.locator('#profile-name')).toHaveText('Tester');
    expect((await tracker.cloud()).profile.displayName).toBe('Tester');
  });

  test('BMR and TDEE follow sex, age and activity', async ({ tracker, page }) => {
    await tracker.open();
    // Mifflin-St Jeor: 10 × 89.2 + 6.25 × 183 − 5 × 42 + 5 = 1830.75; light activity × 1.375.
    await expect(page.locator('#profile-bmr')).toHaveText('1,831');
    await expect(page.locator('#profile-tdee')).toHaveText('2,517');
    await profileField(page, 'sex').selectOption('F');
    await expect(page.locator('#profile-bmr')).toHaveText('1,665');
    await expect(page.locator('#profile-tdee')).toHaveText('2,289');
    await profileField(page, 'activityLevel').selectOption('active');
    await expect(page.locator('#profile-tdee')).toHaveText('2,872');
    await profileField(page, 'ageYears').fill('52');
    await expect(page.locator('#profile-bmr')).toHaveText('1,615');
  });

  test("BMR updates as soon as today's weight is logged", async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-weight').fill('88.4');
    // 10 × 88.4 + 6.25 × 183 − 5 × 42 + 5 = 1822.75
    await expect(page.locator('#profile-bmr')).toHaveText('1,823');
  });

  test('a new height updates the BMI subtitle and the weight summary', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'heightCm').fill('175');
    await expect(page.locator('#bmi-height-subtitle')).toHaveText('(height 1.75 m)');
    await expect(page.locator('#weight-summary')).toContainText('BMI: 29.1 (overweight)');
  });
});

test.describe('Profile: displayed nutrients', () => {
  test('checking a nutrient adds its daily total and unchecking one removes it', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#nutrients-checklist [data-nutrient-toggle="potassium"]').check();
    await expect(page.locator('[data-total="potassium"]')).toBeVisible();
    await page.locator('#nutrients-checklist [data-nutrient-toggle="sf"]').uncheck();
    await expect(page.locator('[data-total="sf"]')).toHaveCount(0);
    const displayed = (await tracker.cloud()).profile.displayedNutrients;
    expect(displayed).toContain('potassium');
    expect(displayed).not.toContain('sf');
  });

  test('catalog rows show the newly displayed nutrient', async ({ tracker, page }) => {
    // Few enough displayed nutrients that the new one is not cut off by the row's five-cell limit.
    await tracker.open({ seed: state => {
      state.userCatalog.items.greek_yogurt.potassium = 1.4;
      state.profile.displayedNutrients = ['kcal', 'p', '_kcal_per_p'];
    } });
    await page.locator('#nutrients-checklist [data-nutrient-toggle="potassium"]').check();
    // 340 g half tub × 1.4 mg/g
    await expect(tracker.row('greek_yogurt').locator('.checkout-item-macros')).toContainText('476mg potassium');
  });
});

test.describe('Profile: display preferences', () => {
  test('the date format applies to the date bar and the history table', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'display.dateFormat').selectOption('MM/DD/yyyy');
    await expect(page.locator('#checkout-date')).toContainText('06/15/2026');
    await expect(page.locator('#history-content tr.history-summary').first().locator('td').first()).toContainText('06/15/2026 (today)');
  });

  test('the date format also applies to the weight summary', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'display.dateFormat').selectOption('MM/DD/yyyy');
    await expect(page.locator('#weight-summary')).toContainText('Latest: 89.2 kg on 06/14/2026');
  });

  test("the 12-hour time format updates Today's log right away", async ({ tracker, page }) => {
    await tracker.open({ seed: state => logCounter(state, 'chicken_breast', 200, { at: '07:10' }) });
    await expect(tracker.todayLogRows().first().locator('.hd-time-inline')).toHaveText('07:10');
    await profileField(page, 'display.timeFormat').selectOption('12h');
    await expect(tracker.todayLogRows().first().locator('.hd-time-inline')).toHaveText('7:10 AM');
  });

  test('imperial units show pounds in the history table', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'display.unitDisplay').selectOption('imperial');
    // 89.2 kg × 2.20462 = 196.65 lb
    await expect(page.locator(`#history-content tr.history-summary[data-date="${YESTERDAY}"] td`).nth(7)).toContainText('196.7 lb');
  });

  test('imperial units also show pounds in the weight summary', async ({ tracker, page }) => {
    await tracker.open();
    await profileField(page, 'display.unitDisplay').selectOption('imperial');
    await expect(page.locator('#weight-summary')).toContainText('Latest: 196.7 lb');
  });
});
