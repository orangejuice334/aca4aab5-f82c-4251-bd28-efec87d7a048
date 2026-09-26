import { test, expect } from '../support/fixtures.mjs';
import { TODAY, YESTERDAY, baselineItems, logCounter } from '../support/seed.mjs';

// Logging recipes: every serving row adds its exact share of the batch, and
// one-off (non-preserve) recipes live only on the days they were logged,
// frozen against later edits.

test.describe('Logging recipe servings', () => {
  test('logging the full recipe adds exactly one batch', { tag: '@mobile' }, async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('chicken_rice_bowl', { servingSize: 375 });
    await tracker.expectTotal('kcal', 658);
    await tracker.expectTotal('p', 66);
  });

  test('logging the half-bowl serving adds half the batch', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('chicken_rice_bowl', { servingSize: 187.5 });
    await tracker.expectTotal('kcal', 329);
    await tracker.expectTotal('p', 33);
  });

  test('all serving rows of a recipe stay in step', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('chicken_rice_bowl', { servingSize: 375 });
    await tracker.showServings('chicken_rice_bowl');
    await expect(tracker.counterInput('chicken_rice_bowl', 187.5)).toHaveValue('2');
    await expect(tracker.counterInput('chicken_rice_bowl', 1)).toHaveValue('375');
  });

  test('a recipe that contains a quarter of another recipe logs its full batch', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('recipe_in_recipe', { servingSize: 365 });
    await tracker.expectTotal('kcal', 578);
    await tracker.expectTotal('p', 66);
  });

  test('one serving of a recipe whose default is a serving adds a quarter batch', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('meal_prep_slab', { servingSize: 360 });
    await tracker.expectTotal('kcal', 538);
    await tracker.expectTotal('p', 66);
  });

  test('one plate of a recipe made of inline ingredients adds the whole plate', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('inline_breakfast');
    await tracker.expectTotal('kcal', 250);
    await tracker.expectTotal('p', 5);
  });

  test('the full recipe of a recipe with a unit-counted ingredient adds one batch', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('egg_scramble', { servingSize: 6 });
    await tracker.expectTotal('kcal', 180);
  });

  test("a recipe row's calories match what logging it adds", async ({ tracker }) => {
    await tracker.open();
    for (const [key, servingSize] of [['chicken_rice_bowl', 375], ['meal_prep_slab', 360], ['recipe_in_recipe', 365], ['egg_scramble', 6], ['inline_breakfast', 1]]) {
      const before = await tracker.total('kcal');
      const rowKcal = await tracker.rowKcal(tracker.rowForServing(key, servingSize));
      await tracker.plus(key, { servingSize });
      await expect.poll(async () => Math.abs((await tracker.total('kcal')) - before - rowKcal), { message: `${key} logs what its row shows` }).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('One-off recipes', () => {
  test('a one-off recipe is hidden on days it was not logged', async ({ tracker }) => {
    await tracker.open();
    await expect(tracker.row('one_off_lunch')).toHaveCount(0);
  });

  test('a one-off recipe appears in the catalog when viewing the day it was logged', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-date-prev').click();
    await expect(page.locator('#checkout-date')).toContainText(YESTERDAY);
    await expect(tracker.row('one_off_lunch')).toBeVisible();
    await expect(tracker.counterInput('one_off_lunch', 200)).toHaveValue('1');
  });

  test('a one-off recipe logged today disappears when viewing another day', async ({ tracker, page }) => {
    await tracker.open({ seed: state => logCounter(state, 'one_off_lunch', 200, { at: '11:30' }) });
    await expect(tracker.row('one_off_lunch')).toBeVisible();
    await page.locator('#checkout-date-prev').click();
    await page.locator('#checkout-date-prev').click();
    await expect(tracker.row('one_off_lunch')).toBeHidden();
  });

  test('logging a one-off recipe stores a frozen copy of it for that day', async ({ tracker }) => {
    await tracker.open({ seed: state => logCounter(state, 'one_off_lunch', 200, { at: '11:30' }) });
    await tracker.plus('one_off_lunch', { servingSize: 200 });
    const day = await tracker.cloudDay(TODAY);
    expect(day.counters.one_off_lunch).toBe(400);
    expect(day.recipeSnapshots && day.recipeSnapshots.one_off_lunch && day.recipeSnapshots.one_off_lunch.ingredients)
      .toEqual(baselineItems().one_off_lunch.ingredients);
  });

  test('history keeps a one-off recipe at the calories it had when it was logged', async ({ tracker, page }) => {
    await tracker.open({ seed: state => {
      const frozen = JSON.parse(JSON.stringify(state.userCatalog.items.one_off_lunch));
      frozen.ingredients = [{ itemKey: 'chicken_breast', amount: 300 }, { itemKey: 'rice_cooked', amount: 100 }];
      frozen.displayUnits = [{ label: 'full recipe', multiplier: 400, amount: 400, unit: 'g', default: true, locked: true }];
      state.days[YESTERDAY].recipeSnapshots.one_off_lunch = frozen;
      state.days[YESTERDAY].counters.one_off_lunch = 400;
    } });
    // Frozen copy: 300 g chicken (495) + 100 g rice (130) = 625 kcal, logged as the full 400 g.
    await expect(page.locator(`#history-content tr.history-summary[data-date="${YESTERDAY}"] td`).nth(1)).toHaveText('625');
    await page.locator('#checkout-date-prev').click();
    await tracker.expectTotal('kcal', 625);
  });
});
