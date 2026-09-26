import { test, expect } from '../support/fixtures.mjs';
import { YESTERDAY, logCounter } from '../support/seed.mjs';

// Editing recipes from their catalog row's edit panel. Luis's rule: the
// recipe's size ("full recipe", the sum of its ingredient grams) updates
// automatically whenever any ingredient changes.

const fullRecipeAmount = panel => panel.locator('[data-variant-row][data-variant-locked] [data-variant-field="amount"]');
const ingredientRow = (panel, itemKey) => panel.locator(`[data-ing-row][data-ing-itemkey="${itemKey}"]`);

test.describe('Recipe edit panel', () => {
  test('lists the ingredients with their portion and calories', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await expect(panel.locator('[data-ing-row]')).toHaveCount(3);
    await expect(panel.locator('.ing-linked-name')).toHaveText(['Chicken breast (Test Farms)', 'White rice', 'Olive oil']);
    await expect(ingredientRow(panel, 'chicken_breast').locator('[data-ing-computed]')).toHaveText('330 kcal · 62 P · 2 SF · 130 ml water');
    await expect(fullRecipeAmount(panel)).toHaveValue('375');
  });

  test('changing an ingredient amount updates the full-recipe size shown in the open panel', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await ingredientRow(panel, 'chicken_breast').locator('[data-ing-field="amount"]').fill('300');
    await expect(fullRecipeAmount(panel), 'the full recipe is the sum of the ingredient grams').toHaveValue('475');
  });

  test('changing an ingredient amount updates the recipe title in the catalog right away', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await ingredientRow(panel, 'chicken_breast').locator('[data-ing-field="amount"]').fill('300');
    await expect(tracker.rowTitle('chicken_rice_bowl')).toHaveText('Chicken rice bowl (full recipe / 475 g)');
    await expect(ingredientRow(panel, 'chicken_breast').locator('[data-ing-computed]')).toHaveText('495 kcal · 93 P · 3 SF · 195 ml water');
  });

  test('adding an ingredient from the picker grows the recipe right away', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await panel.locator('[data-ing-add-source]').selectOption('protein_shake');
    await expect(panel.locator('[data-ing-add-serving]')).toBeEnabled();
    await panel.locator('[data-ing-add-confirm]').click();
    await expect(tracker.editPanel('chicken_rice_bowl').locator('[data-ing-row]')).toHaveCount(4);
    await expect(tracker.rowTitle('chicken_rice_bowl')).toHaveText('Chicken rice bowl (full recipe / 705 g)');
    const bowl = (await tracker.cloud()).userCatalog.items.chicken_rice_bowl;
    expect(bowl.ingredients[3]).toEqual({ itemKey: 'protein_shake', amount: 330, label: '1 bottle' });
    expect(bowl.displayUnits.find(unit => unit.label === 'full recipe').multiplier).toBe(705);
  });

  test('removing an ingredient updates the recipe right away', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await ingredientRow(panel, 'olive_oil').locator('[data-ing-delete]').click();
    await expect(tracker.rowTitle('chicken_rice_bowl')).toHaveText('Chicken rice bowl (full recipe / 360 g)');
  });

  test('a removed ingredient is gone after closing the panel', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await ingredientRow(panel, 'olive_oil').locator('[data-ing-delete]').click();
    await tracker.closeEditPanel('chicken_rice_bowl');
    const bowl = (await tracker.cloud()).userCatalog.items.chicken_rice_bowl;
    expect(bowl.ingredients.map(ingredient => ingredient.itemKey)).toEqual(['chicken_breast', 'rice_cooked']);
    expect(bowl.displayUnits.find(unit => unit.label === 'full recipe').multiplier).toBe(360);
  });

  test('the 1/2 fraction button halves an ingredient and names the fraction', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    const chicken = ingredientRow(panel, 'chicken_breast');
    await chicken.locator('[data-ing-frac="2"]').click();
    await expect(chicken.locator('[data-ing-field="label"]')).toHaveValue('1/2 breast');
    await expect(chicken.locator('[data-ing-field="amount"]')).toHaveValue('100');
    await expect(chicken.locator('[data-ing-computed]')).toHaveText('165 kcal · 31 P · 1 SF · 65 ml water');
  });

  test('instructions are saved one step per line', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await panel.locator('[data-edit-field="instructions"]').fill('Cook rice\nGrill chicken\n\n  Serve  ');
    await tracker.closeEditPanel('chicken_rice_bowl');
    const bowl = (await tracker.cloud()).userCatalog.items.chicken_rice_bowl;
    expect(bowl.instructions).toEqual(['Cook rice', 'Grill chicken', 'Serve']);
  });

  test('a recipe brand shows in its title', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await panel.locator('[data-edit-field="brand"]').fill('Home');
    await expect(tracker.rowTitle('chicken_rice_bowl')).toHaveText('Chicken rice bowl (Home · full recipe / 375 g)');
  });
});

test.describe('Recipe preserve switch', () => {
  test('the recipe panel has a "Preserve across days" switch that matches the recipe', async ({ tracker }) => {
    await tracker.open({ seed: state => logCounter(state, 'one_off_lunch', 200) });
    const preserved = await tracker.openEditPanel('chicken_rice_bowl');
    await expect(preserved.locator('[data-edit-field="preserve"]')).toBeChecked();
    await tracker.closeEditPanel('chicken_rice_bowl');
    const oneOff = await tracker.openEditPanel('one_off_lunch');
    await expect(oneOff.locator('[data-edit-field="preserve"]')).not.toBeChecked();
  });

  test('switching "Preserve across days" off turns a recipe into a one-off', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await panel.locator('[data-edit-field="preserve"]').uncheck();
    await tracker.closeEditPanel('chicken_rice_bowl');
    expect((await tracker.cloud()).userCatalog.items.chicken_rice_bowl.preserve).toBe(false);
    await expect(tracker.row('chicken_rice_bowl'), 'a one-off not logged today is hidden').toBeHidden();
  });
});

test.describe('Editing must not corrupt what a recipe logs', () => {
  test('renaming a recipe made of inline ingredients keeps one plate at 250 kcal', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('inline_breakfast');
    await panel.locator('[data-edit-field="name"]').fill('Toast with butter');
    await tracker.closeEditPanel('inline_breakfast');
    await tracker.plus('inline_breakfast');
    await tracker.expectTotal('kcal', 250);
  });

  test('renaming a recipe with a unit-counted ingredient keeps its full recipe at exactly one batch', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('egg_scramble');
    await panel.locator('[data-edit-field="name"]').fill('Egg scramble v2');
    await tracker.closeEditPanel('egg_scramble');
    await tracker.plus('egg_scramble');
    await tracker.expectTotal('kcal', 180);
  });

  test('renaming a recipe that only has a per-serving size keeps that serving', async ({ tracker }) => {
    await tracker.open({ seed: state => {
      state.userCatalog.items.soup_pot = {
        name: 'Soup pot', category: 'recipes', defaultMeasuredIn: 'units',
        ingredients: [{ itemKey: 'chicken_breast', amount: 500 }, { itemKey: 'rice_cooked', amount: 500 }],
        displayUnits: [{ label: '1 bowl', multiplier: 250, amount: 250, unit: 'g', default: true }],
      };
    } });
    const panel = await tracker.openEditPanel('soup_pot');
    await panel.locator('[data-edit-field="name"]').fill('Soup pot v2');
    await tracker.closeEditPanel('soup_pot');
    const soup = (await tracker.cloud()).userCatalog.items.soup_pot;
    expect(soup.displayUnits.find(unit => unit.label === '1 bowl').multiplier).toBe(250);
    // A quarter of the 1000 g pot: (825 + 650) / 4 = 368.75 kcal.
    await tracker.plus('soup_pot');
    await tracker.expectTotal('kcal', 369);
  });

  test('opening and closing a recipe without changes keeps the logged batch identical', async ({ tracker }) => {
    await tracker.open();
    await tracker.openEditPanel('chicken_rice_bowl');
    await tracker.closeEditPanel('chicken_rice_bowl');
    await tracker.plus('chicken_rice_bowl', { servingSize: 375 });
    await tracker.expectTotal('kcal', 658);
  });

  test('a custom portion of a recipe in grams adds those grams', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await panel.locator('[data-track-portion-amount]').fill('187.5');
    await panel.locator('[data-track-portion-unit]').selectOption('g');
    await panel.locator('[data-track-portion-add]').click();
    await tracker.expectTotal('kcal', 329);
    expect((await tracker.cloudDay()).counters.chicken_rice_bowl).toBe(187.5);
  });

  test('a custom portion of a recipe in ounces is converted to grams', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    // 5 oz = 141.7475 g of a 375 g, 658 kcal batch = 248.7 kcal.
    await panel.locator('[data-track-portion-amount]').fill('5');
    await panel.locator('[data-track-portion-unit]').selectOption('oz');
    await panel.locator('[data-track-portion-add]').click();
    await tracker.expectTotal('kcal', 249);
  });
});

test.describe('Recipes built from other recipes', () => {
  test('editing an inner recipe updates the full-batch calories of the recipe that uses it', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('meal_prep_slab');
    await ingredientRow(panel, 'chicken_breast').locator('[data-ing-field="amount"]').fill('1000');
    await tracker.closeEditPanel('meal_prep_slab');
    // Slab batch is now 1650 + 832 = 2482 kcal; a quarter plus 5 ml oil = 660.5 kcal.
    await expect.poll(() => tracker.rowKcal(tracker.row('recipe_in_recipe'))).toBe(660.5);
  });

  test('a missing ingredient is shown as missing and counts as zero', async ({ tracker }) => {
    await tracker.open({ seed: state => { state.userCatalog.items.chicken_rice_bowl.ingredients.push({ itemKey: 'deleted_thing', amount: 50 }); } });
    const panel = await tracker.openEditPanel('chicken_rice_bowl');
    await expect(panel.locator('.ing-linked-name', { hasText: '(missing item: deleted_thing)' })).toBeVisible();
    await expect(panel.locator('.ing-linked-header.broken')).toHaveCount(1);
  });

  test('a recipe with a missing ingredient still logs the full batch of what remains', async ({ tracker }) => {
    await tracker.open({ seed: state => { state.userCatalog.items.chicken_rice_bowl.ingredients.push({ itemKey: 'deleted_thing', amount: 50 }); } });
    await tracker.plus('chicken_rice_bowl', { servingSize: 375 });
    await tracker.expectTotal('kcal', 658);
  });

  test('recipes that contain each other do not break the page', async ({ tracker }) => {
    await tracker.open({ seed: state => {
      state.userCatalog.items.loop_a = {
        name: 'Loop A', category: 'recipes', defaultMeasuredIn: 'units',
        ingredients: [{ itemKey: 'loop_b', multiplier: 1 }, { itemKey: 'chicken_breast', amount: 100 }],
        displayUnits: [{ label: 'full recipe', multiplier: 200, amount: 200, unit: 'g', default: true, locked: true }],
      };
      state.userCatalog.items.loop_b = {
        name: 'Loop B', category: 'recipes', defaultMeasuredIn: 'units',
        ingredients: [{ itemKey: 'loop_a', multiplier: 1 }, { itemKey: 'rice_cooked', amount: 100 }],
        displayUnits: [{ label: 'full recipe', multiplier: 200, amount: 200, unit: 'g', default: true, locked: true }],
      };
    } });
    await expect(tracker.row('loop_a')).toBeVisible();
    expect(Number.isFinite(await tracker.rowKcal(tracker.row('loop_a')))).toBe(true);
    expect(Number.isFinite(await tracker.rowKcal(tracker.row('loop_b')))).toBe(true);
    await tracker.plus('loop_a');
    expect(Number.isFinite(await tracker.total('kcal'))).toBe(true);
  });
});

test.describe('Deleting and one-off edits', () => {
  test('deleting an item used by recipes names those recipes in the warning', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('rice_cooked');
    await panel.locator('[data-item-delete]').click();
    await expect.poll(() => tracker.dialogs.map(dialog => dialog.message).join('\n'))
      .toContain('Referenced by 3 recipes: Chicken rice bowl, Meal prep slab, One-off lunch.');
    await expect(tracker.row('rice_cooked')).toHaveCount(0);
    expect((await tracker.cloud()).userCatalog.items.rice_cooked).toBeUndefined();
  });

  test('editing a one-off recipe on a day it was logged leaves earlier days untouched', async ({ tracker, page }) => {
    await tracker.open({ seed: state => logCounter(state, 'one_off_lunch', 200, { at: '12:30' }) });
    const panel = await tracker.openEditPanel('one_off_lunch');
    await ingredientRow(panel, 'chicken_breast').locator('[data-ing-field="amount"]').fill('300');
    await tracker.closeEditPanel('one_off_lunch');
    await page.locator('#checkout-date-prev').click();
    await expect(page.locator('#checkout-date')).toContainText(YESTERDAY);
    await tracker.expectTotal('kcal', 295);
  });
});
