import { test, expect } from '../support/fixtures.mjs';

// Recipe maker: build a recipe from catalog items, watch live totals, save it
// as a reusable catalog recipe ("Store for later") or as a one-off.

const optionLabels = row => row.locator('[data-recipe-ing-select] option').allTextContents();

function rgbaOf(cssColor) {
  const match = String(cssColor).match(/rgba?\(([^)]+)\)/);
  const [red, green, blue, alpha = '1'] = match ? match[1].split(',').map(part => part.trim()) : ['0', '0', '0', '0'];
  return { red: Number(red), green: Number(green), blue: Number(blue), alpha: Number(alpha) };
}

test.describe('Recipe maker: picking ingredients', () => {
  test('the picker offers catalog items and recipes, with brands in the labels', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient();
    const labels = await optionLabels(row);
    expect(labels[0]).toBe('— Pick item —');
    expect(labels).toEqual(expect.arrayContaining(['Chicken breast (Test Farms)', 'Chicken rice bowl', 'Egg', 'Olive oil', 'Meal prep slab']));
  });

  test('archived items and water are not offered as ingredients', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient();
    const labels = await optionLabels(row);
    expect(labels).not.toContain('Old granola');
    expect(labels).not.toContain('Water bottle');
  });

  test('picking a gram-measured ingredient pre-fills one default serving', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient('chicken_breast');
    await expect(row.locator('.recipe-ing-variant label')).toHaveText(['1 breast (200 g)', '100 g', '1 g']);
    const inputs = row.locator('[data-recipe-variant-input]');
    await expect(inputs.nth(0)).toHaveValue('1');
    await expect(inputs.nth(1)).toHaveValue('2');
    await expect(inputs.nth(2)).toHaveValue('200');
    await expect(row.locator('[data-recipe-ing-macros]')).toHaveText('→ 330 kcal · 62 P · 2 SF');
    await expect(tracker.recipeTotalsText()).toHaveText('330 kcal · 62 P · 2 SF · 130 ml · 0 caf');
    await expect(tracker.recipeRatioText()).toHaveText('5.32 kcal/p');
  });

  test('typing in one serving box updates the sibling boxes and the totals', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient('chicken_breast');
    await tracker.setRecipeServing(row, 1, 150);
    const inputs = row.locator('[data-recipe-variant-input]');
    await expect(inputs.nth(0)).toHaveValue('0.8');
    await expect(inputs.nth(1)).toHaveValue('1.5');
    await expect(tracker.recipeTotalsText()).toHaveText(/^247\.5 kcal · 46\.5 P · 1\.5 SF · 98 ml · 0 caf$/);
  });

  test('totals and ratio follow ingredients as they are added and removed', async ({ tracker }) => {
    await tracker.open();
    const chickenRow = await tracker.addRecipeIngredient('chicken_breast');
    await tracker.addRecipeIngredient('rice_cooked');
    await expect(tracker.recipeTotalsText()).toHaveText('538 kcal · 66 P · 2.2 SF · 239 ml · 0 caf');
    await expect(tracker.recipeRatioText()).toHaveText('8.15 kcal/p');
    await chickenRow.locator('[data-recipe-ing-delete]').click();
    await expect(tracker.recipeRows()).toHaveCount(1);
    await expect(tracker.recipeTotalsText()).toHaveText('208 kcal · 4 P · 0.2 SF · 109 ml · 0 caf');
    await expect(tracker.recipeRatioText()).toHaveText('52.00 kcal/p');
  });

  test('the totals turn green under the daily kcal/p target and orange-red over it', async ({ tracker }) => {
    await tracker.open();
    const chickenRow = await tracker.addRecipeIngredient('chicken_breast');
    const totals = tracker.recipeMaker().locator('[data-recipe-totals]');
    const lean = rgbaOf(await totals.evaluate(element => getComputedStyle(element).backgroundColor));
    expect(lean.green).toBeGreaterThan(lean.red);
    await chickenRow.locator('[data-recipe-ing-delete]').click();
    await tracker.addRecipeIngredient('rice_cooked');
    const starchy = rgbaOf(await totals.evaluate(element => getComputedStyle(element).backgroundColor));
    expect(starchy.red).toBeGreaterThan(starchy.green);
  });

  test('a discrete-unit ingredient starts at the item default serving', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient('egg_large');
    await expect(row.locator('.recipe-ing-variant label')).toHaveText(['2 eggs']);
    await expect(row.locator('[data-recipe-variant-input]')).toHaveValue('1');
    await expect(row.locator('[data-recipe-ing-macros]')).toHaveText('→ 140 kcal · 12 P · 3 SF');
  });

  test('removing every ingredient row resets the totals to zero', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient('chicken_breast');
    await row.locator('[data-recipe-ing-delete]').click();
    await expect(tracker.recipeTotalsText()).toHaveText('0 kcal · 0 P · 0 SF · 0 ml · 0 caf');
    await expect(tracker.recipeRatioText()).toHaveText('—');
  });
});

test.describe('Recipe maker: ingredient filter', () => {
  test('typing in the filter narrows the picker and opens it as a shrinking list', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient();
    const select = row.locator('[data-recipe-ing-select]');
    await row.locator('[data-recipe-ing-filter]').fill('egg');
    await expect(select.locator('option')).toHaveText(['— Pick item —', 'Egg', 'Egg scramble']);
    await expect(select).toHaveJSProperty('size', 3);
    await row.locator('[data-recipe-ing-filter]').fill('egg s');
    await expect(select.locator('option')).toHaveText(['— Pick item —', 'Egg scramble']);
    await expect(select).toHaveJSProperty('size', 2);
  });

  test('the filter also matches brand names', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient();
    await row.locator('[data-recipe-ing-filter]').fill('test farms');
    await expect(row.locator('[data-recipe-ing-select] option')).toHaveText(['— Pick item —', 'Chicken breast (Test Farms)']);
  });

  test('choosing from the filtered list closes it back to a dropdown and keeps the choice', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient();
    const select = row.locator('[data-recipe-ing-select]');
    await row.locator('[data-recipe-ing-filter]').fill('rice');
    await select.selectOption('rice_cooked');
    await expect(select).toHaveJSProperty('size', 1);
    await expect(select).toHaveValue('rice_cooked');
    await expect(row.locator('.recipe-ing-variant label').first()).toHaveText('1 cup (160 g)');
  });

  test('the filter never drops the ingredient already chosen', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient('chicken_breast');
    await row.locator('[data-recipe-ing-filter]').fill('zzz');
    const select = row.locator('[data-recipe-ing-select]');
    await expect(select).toHaveValue('chicken_breast');
    await expect(select.locator('option')).toHaveText(['— Pick item —', 'Chicken breast (Test Farms)']);
  });
});

test.describe('Recipe maker: saving', () => {
  test('a named recipe is saved to the catalog with a full-recipe size equal to the ingredient grams', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('chicken_breast');
    await tracker.addRecipeIngredient('rice_cooked');
    await maker.locator('[data-recipe-name]').fill('Test bowl');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').last().click();
    await expect.poll(() => tracker.dialogs.map(dialog => dialog.message)).toContain('Saved recipe "test_bowl" to your catalog.');
    await expect(tracker.categoryBar('recipes').locator('.checkout-item-name', { hasText: /^Test bowl / }).first()).toHaveText('Test bowl (full recipe / 360 g)');
    const saved = (await tracker.cloud()).userCatalog.items.test_bowl;
    expect(saved.category).toBe('recipes');
    expect(saved.ingredients).toEqual([{ itemKey: 'chicken_breast', amount: 200 }, { itemKey: 'rice_cooked', amount: 160 }]);
    expect(saved.displayUnits).toEqual([{ label: 'full recipe', multiplier: 360, amount: 360, unit: 'g', default: true, locked: true }]);
    expect(saved.preserve).toBeUndefined();
  });

  test('the key follows the name until it is edited by hand', async ({ tracker }) => {
    await tracker.open();
    const maker = await tracker.openRecipeMaker();
    await maker.locator('[data-recipe-name]').fill('My Lunch!');
    await expect(maker.locator('[data-recipe-key]')).toHaveValue('my_lunch');
    await maker.locator('[data-recipe-key]').fill('lunch_v2');
    await maker.locator('[data-recipe-name]').fill('Something else');
    await expect(maker.locator('[data-recipe-key]')).toHaveValue('lunch_v2');
  });

  test('a recipe saved without a name is named from its calories and protein', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('chicken_breast');
    await tracker.addRecipeIngredient('rice_cooked');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    const items = (await tracker.cloud()).userCatalog.items;
    expect(items.recipe_538_kcal_66g_protein).toBeTruthy();
    expect(items.recipe_538_kcal_66g_protein.name).toBe('Recipe (538 kcal, 66g protein)');
  });

  test('saving with no ingredients explains why and saves nothing', async ({ tracker }) => {
    await tracker.open();
    const maker = await tracker.openRecipeMaker();
    await maker.locator('[data-recipe-name]').fill('Empty');
    await maker.locator('[data-recipe-save]').first().click();
    await expect(maker.locator('[data-recipe-error]')).toBeVisible();
    await expect(maker.locator('[data-recipe-error]')).toHaveText('Add at least one ingredient.');
    expect(tracker.dialogs).toEqual([]);
    expect((await tracker.cloud()).userCatalog.items.empty).toBeUndefined();
  });

  test('saving over an existing recipe asks first, and cancelling keeps the original', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('egg_large');
    await maker.locator('[data-recipe-key]').fill('chicken_rice_bowl');
    await maker.locator('[data-recipe-store]').first().check();
    tracker.dialogResponse = 'dismiss';
    await maker.locator('[data-recipe-save]').first().click();
    await expect.poll(() => tracker.dialogs.map(dialog => dialog.message)).toContain('Item "chicken_rice_bowl" already exists. Overwrite?');
    const bowl = (await tracker.cloud()).userCatalog.items.chicken_rice_bowl;
    expect(bowl.ingredients).toHaveLength(3);
    expect(bowl.name).toBe('Chicken rice bowl');
  });

  test('confirming the overwrite replaces the recipe', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('egg_large');
    await maker.locator('[data-recipe-key]').fill('chicken_rice_bowl');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    const bowl = await tracker.waitForCloud(state => state.userCatalog.items.chicken_rice_bowl.ingredients.length === 1)
      .then(state => state.userCatalog.items.chicken_rice_bowl);
    expect(bowl.ingredients).toEqual([{ itemKey: 'egg_large', multiplier: 1 }]);
  });

  test('both Add buttons save, and both Store checkboxes stay in step', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    const stores = maker.locator('[data-recipe-store]');
    await tracker.openRecipeMaker();
    await stores.nth(0).check();
    await expect(stores.nth(1)).toBeChecked();
    await stores.nth(1).uncheck();
    await expect(stores.nth(0)).not.toBeChecked();
    await stores.nth(1).check();
    await tracker.addRecipeIngredient('chicken_breast');
    await maker.locator('[data-recipe-name]').fill('Top button bowl');
    await maker.locator('[data-recipe-save]').first().click();
    const saved = (await tracker.cloud()).userCatalog.items.top_button_bowl;
    expect(saved).toBeTruthy();
    expect(saved.preserve).toBeUndefined();
  });

  test('a saved recipe logs exactly its batch', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('chicken_breast');
    await tracker.addRecipeIngredient('rice_cooked');
    await maker.locator('[data-recipe-name]').fill('Test bowl');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    await tracker.plus('test_bowl', { servingSize: 360 });
    await tracker.expectTotal('kcal', 538);
    await tracker.expectTotal('p', 66);
  });

  test('a one-off recipe (Store for later left unchecked) can be logged the same day', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('chicken_breast');
    await tracker.addRecipeIngredient('rice_cooked');
    await maker.locator('[data-recipe-name]').fill('Quick lunch');
    await maker.locator('[data-recipe-save]').first().click();
    await expect.poll(() => tracker.dialogs.map(dialog => dialog.message)).toContain('Saved one-off recipe "quick_lunch" (shows on days you log it).');
    expect((await tracker.cloud()).userCatalog.items.quick_lunch.preserve).toBe(false);
    await expect(tracker.row('quick_lunch'), 'the new one-off recipe must be reachable today so it can be logged').toBeVisible();
  });

  test('the maker resets after saving', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('chicken_breast');
    await maker.locator('[data-recipe-name]').fill('Reset check');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    await expect(maker.locator('[data-recipe-name]')).toHaveValue('');
    await expect(maker.locator('[data-recipe-key]')).toHaveValue('');
    await expect(tracker.recipeRows()).toHaveCount(0);
    await expect(maker.locator('[data-recipe-store]').nth(0)).not.toBeChecked();
    await expect(maker.locator('[data-recipe-store]').nth(1)).not.toBeChecked();
    await expect(tracker.recipeTotalsText()).toHaveText('0 kcal · 0 P · 0 SF · 0 ml · 0 caf');
  });

  test('a recipe saved in this session is offered as an ingredient straight away', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('chicken_breast');
    await maker.locator('[data-recipe-name]').fill('Fresh base');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    const row = await tracker.addRecipeIngredient();
    expect(await optionLabels(row)).toContain('Fresh base');
  });

  test('building and saving a recipe works on a phone', { tag: '@mobile' }, async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('greek_yogurt');
    await maker.locator('[data-recipe-name]').fill('Phone yogurt bowl');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    await expect(tracker.row('phone_yogurt_bowl')).toBeVisible();
    await tracker.plus('phone_yogurt_bowl', { servingSize: 340 });
    await tracker.expectTotal('kcal', 204);
  });
});

test.describe('Recipe maker: recipes inside recipes', () => {
  test('one serving of another recipe counts as that serving, not the whole batch', async ({ tracker }) => {
    await tracker.open();
    const row = await tracker.addRecipeIngredient('meal_prep_slab');
    await expect(row.locator('.recipe-ing-variant label').first()).toHaveText('1 serving (360 g)');
    await expect(row.locator('[data-recipe-variant-input]').first()).toHaveValue('1');
    await expect(row.locator('[data-recipe-ing-macros]')).toHaveText('→ 538 kcal · 66 P · 2.2 SF');
  });

  test('the serving math holds when the serving is listed before the full recipe', async ({ tracker }) => {
    await tracker.open({ seed: state => {
      state.userCatalog.items.meal_prep_slab.displayUnits = [
        { label: '1 serving', multiplier: 360, amount: 360, unit: 'g', default: true },
        { label: 'full recipe', multiplier: 1440, amount: 1440, unit: 'g', locked: true },
      ];
    } });
    const row = await tracker.addRecipeIngredient('meal_prep_slab');
    await expect(row.locator('[data-recipe-ing-macros]')).toHaveText('→ 538 kcal · 66 P · 2.2 SF');
    await expect(tracker.recipeTotalsText()).toHaveText(/^538 kcal · 66 P/);
  });

  test('a saved recipe containing one serving of another recipe logs that serving', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('meal_prep_slab');
    await maker.locator('[data-recipe-name]').fill('Slab lunch');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    await tracker.plus('slab_lunch');
    await tracker.expectTotal('kcal', 538);
  });

  test('a saved recipe with a unit-counted ingredient logs exactly one batch', async ({ tracker }) => {
    await tracker.open();
    const maker = tracker.recipeMaker();
    await tracker.addRecipeIngredient('egg_large');
    await maker.locator('[data-recipe-name]').fill('Two eggs');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    const saved = (await tracker.cloud()).userCatalog.items.two_eggs;
    expect(saved.ingredients).toEqual([{ itemKey: 'egg_large', multiplier: 1 }]);
    await tracker.plus('two_eggs');
    await tracker.expectTotal('kcal', 140);
  });
});
