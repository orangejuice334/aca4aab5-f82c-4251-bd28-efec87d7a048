import { test, expect } from '../support/fixtures.mjs';
import { YESTERDAY, dayIn, dayOffset, isoAt } from '../support/seed.mjs';

// Weight & BMI, Navy body fat, and Mood. Every reading is per day, typed
// either in the top bar or in the section itself (the two stay mirrored).
// Baseline seed: 90.0 kg on 2026-06-08 and 89.2 kg on 2026-06-14; height 183 cm.

const navyBodyFatMale = (neckCm, waistCm, heightCm) =>
  495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;

const chartPoints = (page, chartId) => page.locator(`#${chartId} circle`);

function seedWeights(state, readings) {
  for (const [offsetDays, kilograms] of readings) {
    const date = dayOffset(offsetDays);
    const day = dayIn(state, date);
    day.weight = kilograms;
    day.weightMeta = isoAt('07:00', date);
  }
}

function seedMoods(state, readings) {
  for (const [offsetDays, mood] of readings) {
    dayIn(state, dayOffset(offsetDays)).mood = mood;
  }
}

test.describe('Weight', () => {
  test("typing today's weight saves it and mirrors it in the top bar", async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-weight').fill('88.4');
    await expect(page.locator('#context-bar-weight')).toHaveValue('88.4');
    expect((await tracker.cloudDay()).weight).toBe(88.4);
  });

  test('the top-bar weight box saves the same way', { tag: '@mobile' }, async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#context-bar-weight').fill('88.4');
    await expect(page.locator('#checkout-weight')).toHaveValue('88.4');
    expect((await tracker.cloudDay()).weight).toBe(88.4);
  });

  test('a weight is stored to one decimal', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-weight').fill('88.46');
    await page.locator('#checkout-weight').blur();
    expect((await tracker.cloudDay()).weight).toBe(88.5);
  });

  test('an impossible weight is not saved', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-weight').fill('600');
    await page.locator('#checkout-weight').blur();
    expect((await tracker.cloudDay()).weight).toBeUndefined();
  });

  test("clearing the box removes today's weight", async ({ tracker, page }) => {
    await tracker.open({ seed: state => seedWeights(state, [[0, 89.0]]) });
    await expect(page.locator('#checkout-weight')).toHaveValue('89');
    await page.locator('#checkout-weight').fill('');
    await page.locator('#checkout-weight').blur();
    expect((await tracker.cloudDay()).weight).toBeUndefined();
  });

  test('the summary shows the latest weigh-in, BMI and the change so far', async ({ tracker, page }) => {
    await tracker.open();
    const summary = page.locator('#weight-summary > div');
    await expect(summary).toHaveText([
      'Latest: 89.2 kg on 2026-06-14',
      'BMI: 26.6 (overweight)',
      'Change: -0.8 kg since 2026-06-08 (2 entries)',
    ]);
    await page.locator('#checkout-weight').fill('88.4');
    await expect(summary).toHaveText([
      'Latest: 88.4 kg on 2026-06-15',
      'BMI: 26.4 (overweight)',
      'Change: -1.6 kg since 2026-06-08 (3 entries)',
    ]);
  });

  test('with no weigh-ins the summary points to a weight box that exists', async ({ tracker, page }) => {
    await tracker.open({ seed: state => {
      delete state.days[YESTERDAY].weight;
      delete state.days[dayOffset(-7)].weight;
    } });
    const summary = page.locator('#weight-summary');
    await expect(summary).toContainText('No weight logged yet');
    await expect(summary, 'there is no "Checkout List header" on the page any more').not.toContainText('Checkout List');
  });

  test('the weight chart plots each weigh-in with its value and a weekly trend', async ({ tracker, page }) => {
    await tracker.open();
    await expect(chartPoints(page, 'weight-chart')).toHaveCount(2);
    const labels = await page.locator('#weight-chart text').allTextContents();
    expect(labels).toEqual(expect.arrayContaining(['90.0', '89.2', '-0.9 kg/week']));
  });

  test('the BMI subtitle shows the profile height', async ({ tracker, page }) => {
    await tracker.open();
    await expect(page.locator('#bmi-height-subtitle')).toHaveText('(height 1.83 m)');
  });
});

test.describe('Chart date range', () => {
  const longHistory = state => seedWeights(state, [[-60, 95.0], [-40, 93.0], [-20, 91.0]]);

  test('the range trims the weight, BMI and body-fat charts', async ({ tracker, page }) => {
    await tracker.open({ seed: longHistory });
    await expect(chartPoints(page, 'weight-chart')).toHaveCount(5);
    await page.locator('#chart-range').selectOption('30');
    await expect(chartPoints(page, 'weight-chart')).toHaveCount(3);
    await expect(chartPoints(page, 'bmi-chart')).toHaveCount(3);
    await page.locator('#chart-range').selectOption('15');
    await expect(chartPoints(page, 'weight-chart')).toHaveCount(2);
    await page.locator('#chart-range').selectOption('all');
    await expect(chartPoints(page, 'weight-chart')).toHaveCount(5);
  });

  test('the range does not trim the mood chart', async ({ tracker, page }) => {
    await tracker.open({ seed: state => { longHistory(state); seedMoods(state, [[-60, 5], [-1, 7]]); } });
    await page.locator('#chart-range').selectOption('15');
    await expect(chartPoints(page, 'mood-chart')).toHaveCount(2);
  });

  test('the chosen range is saved and restored', async ({ tracker, page }) => {
    await tracker.open({ seed: longHistory });
    await page.locator('#chart-range').selectOption('90');
    expect((await tracker.cloud()).chartRangeDays).toBe(90);
    await tracker.reload();
    await expect(page.locator('#chart-range')).toHaveValue('90');
  });

  test('a window with no readings shows "No data yet" instead of an empty scale', async ({ tracker, page }) => {
    await tracker.open({ seed: state => {
      delete state.days[YESTERDAY].weight;
      delete state.days[dayOffset(-7)].weight;
      seedWeights(state, [[-60, 95.0]]);
    } });
    await page.locator('#chart-range').selectOption('15');
    await expect(page.locator('#weight-chart text')).toHaveText(['No data yet']);
  });
});

test.describe('Body fat (Navy method)', () => {
  test('body fat is computed live from neck, waist and profile height', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-neck').fill('40');
    await page.locator('#checkout-waist').fill('95');
    const expected = navyBodyFatMale(40, 95, 183);
    await expect(page.locator('#bf-inline')).toHaveText(`${expected.toFixed(1)}% body fat`);
    const day = await tracker.cloudDay();
    expect(day).toMatchObject({ neck: 40, waist: 95 });
  });

  test('the neck measurement carries forward to later days', async ({ tracker, page }) => {
    await tracker.open({ seed: state => { dayIn(state, dayOffset(-7)).neck = 40; } });
    await expect(page.locator('#checkout-neck')).toHaveValue('40');
    await page.locator('#checkout-waist').fill('95');
    await expect(page.locator('#bf-inline')).toHaveText(`${navyBodyFatMale(40, 95, 183).toFixed(1)}% body fat`);
    await expect(page.locator('#fat-pct-subtitle')).toContainText(`latest ${navyBodyFatMale(40, 95, 183).toFixed(1)}%`);
    expect((await tracker.cloudDay()).neck, 'the carried value is display-only, not a new measurement').toBeUndefined();
  });

  test('a female profile never gets the male body-fat formula', async ({ tracker, page }) => {
    await tracker.open({ seed: state => { state.profile.sex = 'F'; } });
    await page.locator('#checkout-neck').fill('34');
    await page.locator('#checkout-waist').fill('80');
    // The female formula needs a hip measurement the tracker does not collect.
    await expect(page.locator('#bf-inline')).toHaveText('— body fat');
  });

  test('out-of-range tape measurements are not saved', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-neck').fill('5');
    await page.locator('#checkout-waist').fill('300');
    await page.locator('#checkout-waist').blur();
    const day = await tracker.cloudDay();
    expect(day.neck).toBeUndefined();
    expect(day.waist).toBeUndefined();
  });

  test('a waist smaller than the neck shows no body fat', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-neck').fill('45');
    await page.locator('#checkout-waist').fill('40');
    await expect(page.locator('#bf-inline')).toHaveText('— body fat');
  });
});

test.describe('Mood', () => {
  test('a mood of 0 is a real reading and is saved', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-mood').fill('0');
    await expect(page.locator('#context-bar-mood')).toHaveValue('0');
    expect((await tracker.cloudDay()).mood).toBe(0);
  });

  test('a mood above 10 is not saved', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-mood').fill('11');
    await page.locator('#checkout-mood').blur();
    expect((await tracker.cloudDay()).mood).toBeUndefined();
  });

  test('the mood chart plots every reading, including days without a weigh-in', async ({ tracker, page }) => {
    await tracker.open({ seed: state => seedMoods(state, [[-3, 7], [-2, 4], [-1, 8]]) });
    await expect(chartPoints(page, 'mood-chart')).toHaveCount(3);
    const labels = await page.locator('#mood-chart text').allTextContents();
    expect(labels).toEqual(expect.arrayContaining(['7.0', '4.0', '8.0']));
  });

  test("yesterday's mood is not carried into today", async ({ tracker, page }) => {
    await tracker.open({ seed: state => seedMoods(state, [[-1, 8]]) });
    await expect(page.locator('#checkout-mood')).toHaveValue('');
    await page.locator('#checkout-date-prev').click();
    await expect(page.locator('#checkout-mood')).toHaveValue('8');
  });
});
