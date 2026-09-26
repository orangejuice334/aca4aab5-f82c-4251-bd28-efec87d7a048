import { test, expect } from '../support/fixtures.mjs';
import { YESTERDAY, logCounter } from '../support/seed.mjs';

// Create a recipe in the recipe maker, then change it: edit one ingredient's
// amount, add an ingredient, or remove one. After every change, everything
// derived from the ingredients must be recalculated at once:
//   - the changed ingredient's linked serving boxes and its macro line,
//   - the read-only "full recipe" size (the sum of the ingredient grams),
//   - the "1 batch ≈ N g" hint of the Track custom portion block,
//   - the recipe's catalog row title, macros and + button size,
//   - what is saved to the cloud and what logging the full recipe adds,
//   - and a portion logged before the change keeps its share of the batch:
//     a logged full recipe stays one full recipe, so the day's total follows
//     the corrected recipe and the logged grams follow the new batch.
//
// Fixture macros (per gram or ml, see seed.mjs):
//   chicken breast 1.65 kcal, 0.31 P, 0.01 SF, 0.65 ml water; 1 breast = 200 g
//   white rice     1.3 kcal, 0.025 P, 0.001 SF, 0.68 ml water; 1 cup = 160 g
//   olive oil      8 kcal, 0.14 SF; 1 tbsp = 15 ml
// So "Chicken and rice" (1 breast + 1 cup) is 360 g, 538 kcal, 66 P.

const CHICKEN_AND_RICE = 'chicken_and_rice';
const CHICKEN_RICE_AND_OIL = 'chicken_rice_and_oil';

const ingredientRow = (panel, itemKey) => panel.locator(`[data-ing-row][data-ing-itemkey="${itemKey}"]`);
const servingBoxes = row => row.locator('[data-recipe-variant-input]');
const servingBox = (row, servingSize) => row.locator(`[data-recipe-variant-input][data-serving-size="${servingSize}"]`);
const servingLabels = row => row.locator('.recipe-ing-variant label');
const fullRecipeBox = panel => panel.locator('[data-variant-row][data-variant-locked] [data-variant-field="amount"]');
const batchHint = panel => panel.locator('.edit-panel-row:has([data-track-portion-row]) > label .edit-panel-hint');
// The macro line ends with an empty layout span and a "+ N more" hint; neither is a value.
const macroCells = (tracker, key) => tracker.row(key).locator(':scope > div > .checkout-item-macros span:not(.macro-more):not(:empty)');
const plusButton = (tracker, key) => tracker.row(key).locator('.counter-btn[data-action="inc"]');
const counterBox = (tracker, key) => tracker.row(key).locator('input.counter-value');
const fullRecipeOf = recipe => recipe.displayUnits.find(unit => unit.locked);

async function createRecipe(tracker, name, ingredientKeys) {
  const maker = tracker.recipeMaker();
  for (const itemKey of ingredientKeys) await tracker.addRecipeIngredient(itemKey);
  await maker.locator('[data-recipe-name]').fill(name);
  await maker.locator('[data-recipe-store]').first().check();
  await maker.locator('[data-recipe-save]').first().click();
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  await expect(tracker.row(key), `the new recipe "${name}" has a catalog row`).toBeVisible();
  return key;
}

async function expectBoxes(row, values) {
  await expect(servingBoxes(row)).toHaveCount(values.length);
  for (let index = 0; index < values.length; index++) {
    await expect(servingBoxes(row).nth(index), `serving box ${index + 1}`).toHaveValue(values[index]);
  }
}

// Everything the recipe's own edit panel and catalog row derive from its batch.
async function expectBatch(tracker, panel, key, { name, grams, cells }) {
  await expect(fullRecipeBox(panel), 'the full recipe is the sum of the ingredient grams').toHaveValue(String(grams));
  await expect(batchHint(panel), 'the custom-portion hint names the current batch').toHaveText(`1 batch ≈ ${grams} g — logging X g adds X/${grams} of a batch.`);
  await expect(tracker.rowTitle(key)).toHaveText(`${name} (full recipe / ${grams} g)`);
  await expect(macroCells(tracker, key)).toHaveText(cells);
  await expect(plusButton(tracker, key), 'the + button adds one current batch').toHaveAttribute('data-serving-size', String(grams));
}

// A portion logged before the change keeps its share of the batch: the
// full-recipe row's counter box keeps its value and the day's total becomes
// that share of the corrected recipe (the only thing logged in these scenarios).
async function expectLoggedPortion(tracker, key, { box, dailyKcal }, message) {
  await expect(counterBox(tracker, key).first(), `${message}: the logged portion`).toHaveValue(box);
  await expect.poll(() => tracker.total('kcal'), { message: `${message}: the day's calories` }).toBe(dailyKcal);
}

test.describe('New recipe, then one ingredient amount is edited', () => {
  test('the new recipe opens with every box showing what the maker saved', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    const panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    const chicken = ingredientRow(panel, 'chicken_breast');
    const rice = ingredientRow(panel, 'rice_cooked');
    await expect(servingLabels(chicken)).toHaveText(['1 breast (200 g)', '100 g', '1 g']);
    await expectBoxes(chicken, ['1', '2', '200']);
    await expect(chicken.locator('[data-ing-computed]')).toHaveText('330 kcal · 62 P · 2 SF · 130 ml water');
    await expect(servingLabels(rice)).toHaveText(['1 cup (160 g)', '1 g']);
    await expectBoxes(rice, ['1', '160']);
    await expect(rice.locator('[data-ing-computed]')).toHaveText('208 kcal · 4 P · 0.2 SF · 108.8 ml water');
    await expectBatch(tracker, panel, CHICKEN_AND_RICE, {
      name: 'Chicken and rice', grams: 360,
      cells: ['8.2 kcal/p', '538 kcal', '66g Protein', '2.2g Sat. Fat.', '238.8ml water'],
    });
  });

  test('typing a new serving count for one ingredient recalculates every box, the recipe row and what it logs', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    const panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    const chicken = ingredientRow(panel, 'chicken_breast');
    await servingBox(chicken, 200).fill('1.5');
    await expectBoxes(chicken, ['1.5', '3', '300']);
    await expect(chicken.locator('[data-ing-computed]')).toHaveText('495 kcal · 93 P · 3 SF · 195 ml water');
    await expectBoxes(ingredientRow(panel, 'rice_cooked'), ['1', '160']);
    await expectBatch(tracker, panel, CHICKEN_AND_RICE, {
      name: 'Chicken and rice', grams: 460,
      cells: ['7.2 kcal/p', '703 kcal', '97g Protein', '3.2g Sat. Fat.', '303.8ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients).toEqual([{ itemKey: 'chicken_breast', amount: 300 }, { itemKey: 'rice_cooked', amount: 160 }]);
    expect(fullRecipeOf(saved)).toMatchObject({ label: 'full recipe', multiplier: 460, amount: 460, unit: 'g' });
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 460 });
    await tracker.expectTotal('kcal', 703);
    await tracker.expectTotal('p', 97);
    expect((await tracker.cloudDay()).counters[CHICKEN_AND_RICE]).toBe(460);
  });

  test('typing new grams for one ingredient recalculates every box, the recipe row and what it logs', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    const panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    const chicken = ingredientRow(panel, 'chicken_breast');
    await servingBox(chicken, 1).fill('240');
    await expectBoxes(chicken, ['1.2', '2.4', '240']);
    await expect(chicken.locator('[data-ing-computed]')).toHaveText('396 kcal · 74.4 P · 2.4 SF · 156 ml water');
    await expectBatch(tracker, panel, CHICKEN_AND_RICE, {
      name: 'Chicken and rice', grams: 400,
      cells: ['7.7 kcal/p', '604 kcal', '78.4g Protein', '2.6g Sat. Fat.', '264.8ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients[0]).toEqual({ itemKey: 'chicken_breast', amount: 240 });
    expect(fullRecipeOf(saved).multiplier).toBe(400);
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 400 });
    await tracker.expectTotal('kcal', 604);
    await tracker.expectTotal('p', 78.4);
  });

  test('the 1/2 button on one ingredient recalculates every box and the recipe row', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    const panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    const chicken = ingredientRow(panel, 'chicken_breast');
    await chicken.locator('[data-ing-frac="2"]').click();
    await expect(chicken.locator('[data-ing-field="label"]')).toHaveValue('1/2 breast');
    await expectBoxes(chicken, ['0.5', '1', '100']);
    await expect(chicken.locator('[data-ing-computed]')).toHaveText('165 kcal · 31 P · 1 SF · 65 ml water');
    await expectBatch(tracker, panel, CHICKEN_AND_RICE, {
      name: 'Chicken and rice', grams: 260,
      cells: ['10.7 kcal/p', '373 kcal', '35g Protein', '1.2g Sat. Fat.', '173.8ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients[0]).toEqual({ itemKey: 'chicken_breast', amount: 100, label: '1/2 breast' });
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 260 });
    await tracker.expectTotal('kcal', 373);
  });

  test('the edited amount is what the panel shows after closing and reopening it, and after a reload', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    let panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await servingBox(ingredientRow(panel, 'chicken_breast'), 200).fill('1.5');
    await expect(fullRecipeBox(panel)).toHaveValue('460');
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await expectBoxes(ingredientRow(panel, 'chicken_breast'), ['1.5', '3', '300']);
    await expectBatch(tracker, panel, CHICKEN_AND_RICE, {
      name: 'Chicken and rice', grams: 460,
      cells: ['7.2 kcal/p', '703 kcal', '97g Protein', '3.2g Sat. Fat.', '303.8ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    await tracker.waitForSyncIdle();
    await tracker.reload();
    panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await expectBoxes(ingredientRow(panel, 'chicken_breast'), ['1.5', '3', '300']);
    await expect(fullRecipeBox(panel)).toHaveValue('460');
  });

  test('a full recipe logged before the edit stays one full recipe, so the day follows the corrected recipe', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 360 });
    await tracker.expectTotal('kcal', 538);
    const panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await servingBox(ingredientRow(panel, 'chicken_breast'), 200).fill('1.5');
    await expect(fullRecipeBox(panel)).toHaveValue('460');
    await expectLoggedPortion(tracker, CHICKEN_AND_RICE, { box: '1', dailyKcal: 703 }, 'while the panel is still open');
    await tracker.expectTotal('p', 97);
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    await expectLoggedPortion(tracker, CHICKEN_AND_RICE, { box: '1', dailyKcal: 703 }, 'after closing the panel');
    expect((await tracker.cloudDay()).counters[CHICKEN_AND_RICE], 'the logged grams follow the batch').toBe(460);
    await tracker.reload();
    await expectLoggedPortion(tracker, CHICKEN_AND_RICE, { box: '1', dailyKcal: 703 }, 'after a reload');
  });

  test('half a recipe logged before the edit stays half the recipe', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    await tracker.typeCount(CHICKEN_AND_RICE, 360, '0.5');
    await tracker.expectTotal('kcal', 269);
    const panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await servingBox(ingredientRow(panel, 'chicken_breast'), 200).fill('1.5');
    // Half of the corrected 703 kcal batch.
    await expectLoggedPortion(tracker, CHICKEN_AND_RICE, { box: '0.5', dailyKcal: 352 }, 'after the edit');
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    expect((await tracker.cloudDay()).counters[CHICKEN_AND_RICE]).toBe(230);
  });

  test('editing an amount in the recipe maker before saving saves the edited amount', async ({ tracker }) => {
    await tracker.open();
    const chickenRow = await tracker.addRecipeIngredient('chicken_breast');
    await tracker.addRecipeIngredient('rice_cooked');
    await tracker.setRecipeServing(chickenRow, 200, 1.5);
    await expectBoxes(chickenRow, ['1.5', '3', '300']);
    await expect(chickenRow.locator('[data-recipe-ing-macros]')).toHaveText('→ 495 kcal · 93 P · 3 SF');
    await expect(tracker.recipeTotalsText()).toHaveText('703 kcal · 97 P · 3.2 SF · 304 ml · 0 caf');
    await expect(tracker.recipeRatioText()).toHaveText('7.25 kcal/p');
    const maker = tracker.recipeMaker();
    await maker.locator('[data-recipe-name]').fill('Chicken and rice');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    await expect(tracker.rowTitle(CHICKEN_AND_RICE)).toHaveText('Chicken and rice (full recipe / 460 g)');
    await expect(macroCells(tracker, CHICKEN_AND_RICE)).toHaveText(['7.2 kcal/p', '703 kcal', '97g Protein', '3.2g Sat. Fat.', '303.8ml water']);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients).toEqual([{ itemKey: 'chicken_breast', amount: 300 }, { itemKey: 'rice_cooked', amount: 160 }]);
    expect(fullRecipeOf(saved).multiplier).toBe(460);
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 460 });
    await tracker.expectTotal('kcal', 703);
  });
});

test.describe('New recipe, then an ingredient is added', () => {
  test('adding an ingredient from the edit panel recalculates the boxes, the recipe row and what it logs', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    let panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await panel.locator('[data-ing-add-source]').selectOption('olive_oil');
    await expect(panel.locator('[data-ing-add-serving] option')).toHaveText(['1 tbsp (15 ml)', '1 ml (1 ml)']);
    await panel.locator('[data-ing-add-confirm]').click();
    panel = tracker.editPanel(CHICKEN_AND_RICE);
    await expect(panel, 'the panel stays open after adding').toBeVisible();
    await expect(panel.locator('[data-ing-row]')).toHaveCount(3);
    const oil = ingredientRow(panel, 'olive_oil');
    await expect(servingLabels(oil)).toHaveText(['1 tbsp (15 ml)', '1 ml']);
    await expectBoxes(oil, ['1', '15']);
    await expect(oil.locator('[data-ing-field="label"]')).toHaveValue('1 tbsp');
    await expect(oil.locator('[data-ing-computed]')).toHaveText('120 kcal · 0 P · 2.1 SF · 0 ml water');
    await expectBoxes(ingredientRow(panel, 'chicken_breast'), ['1', '2', '200']);
    await expectBoxes(ingredientRow(panel, 'rice_cooked'), ['1', '160']);
    await expect(panel.locator('[data-ing-add-source]'), 'the picker is ready for the next ingredient').toHaveValue('');
    await expectBatch(tracker, panel, CHICKEN_AND_RICE, {
      name: 'Chicken and rice', grams: 375,
      cells: ['10 kcal/p', '658 kcal', '66g Protein', '4.3g Sat. Fat.', '238.8ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients).toEqual([
      { itemKey: 'chicken_breast', amount: 200 },
      { itemKey: 'rice_cooked', amount: 160 },
      { itemKey: 'olive_oil', amount: 15, label: '1 tbsp' },
    ]);
    expect(fullRecipeOf(saved).multiplier).toBe(375);
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 375 });
    await tracker.expectTotal('kcal', 658);
    await tracker.expectTotal('p', 66);
  });

  test('an amount edited just before adding an ingredient is kept', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    let panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await servingBox(ingredientRow(panel, 'chicken_breast'), 200).fill('1.5');
    await panel.locator('[data-ing-add-source]').selectOption('olive_oil');
    await panel.locator('[data-ing-add-confirm]').click();
    panel = tracker.editPanel(CHICKEN_AND_RICE);
    await expect(panel.locator('[data-ing-row]')).toHaveCount(3);
    await expectBoxes(ingredientRow(panel, 'chicken_breast'), ['1.5', '3', '300']);
    await expectBatch(tracker, panel, CHICKEN_AND_RICE, {
      name: 'Chicken and rice', grams: 475,
      cells: ['8.5 kcal/p', '823 kcal', '97g Protein', '5.3g Sat. Fat.', '303.8ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients.map(ingredient => [ingredient.itemKey, ingredient.amount])).toEqual([['chicken_breast', 300], ['rice_cooked', 160], ['olive_oil', 15]]);
    expect(fullRecipeOf(saved).multiplier).toBe(475);
  });

  test('adding one serving of another recipe from the edit panel adds that serving, not its whole batch', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    let panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    // The slab is a 1440 g, 2152 kcal batch whose default serving is a 360 g quarter.
    await panel.locator('[data-ing-add-source]').selectOption('meal_prep_slab');
    await expect(panel.locator('[data-ing-add-serving] option').first()).toHaveText('1 serving (360 g)');
    await panel.locator('[data-ing-add-confirm]').click();
    panel = tracker.editPanel(CHICKEN_AND_RICE);
    const slab = ingredientRow(panel, 'meal_prep_slab');
    await expect(servingLabels(slab)).toHaveText(['1 serving (360 g)', 'full recipe (1440 g)', '1 g']);
    await expectBoxes(slab, ['1', '0.3', '360']);
    await expect(slab.locator('[data-ing-computed]')).toHaveText('538 kcal · 66 P · 2.2 SF · 238.8 ml water');
    await expectBatch(tracker, panel, CHICKEN_AND_RICE, {
      name: 'Chicken and rice', grams: 720,
      cells: ['8.2 kcal/p', '1076 kcal', '132g Protein', '4.3g Sat. Fat.', '477.6ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients[2]).toEqual({ itemKey: 'meal_prep_slab', multiplier: 0.25, label: '1 serving' });
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 720 });
    await tracker.expectTotal('kcal', 1076);
  });

  test('adding a counted item from the edit panel adds exactly its serving and labels its boxes in pieces', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    let panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await panel.locator('[data-ing-add-source]').selectOption('egg_large');
    await panel.locator('[data-ing-add-confirm]').click();
    panel = tracker.editPanel(CHICKEN_AND_RICE);
    const eggs = ingredientRow(panel, 'egg_large');
    await expect(servingLabels(eggs)).toHaveText(['2 eggs', '1 egg']);
    await expectBoxes(eggs, ['1', '2']);
    await expect(eggs.locator('[data-ing-computed]')).toHaveText('140 kcal · 12 P · 3 SF · 74 ml water');
    await expect.poll(() => tracker.rowKcal(tracker.row(CHICKEN_AND_RICE))).toBe(678);
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients[2]).toEqual({ itemKey: 'egg_large', multiplier: 1, label: '2 eggs' });
    await tracker.plus(CHICKEN_AND_RICE);
    await tracker.expectTotal('kcal', 678);
  });

  test('a full recipe logged before an ingredient is added stays one full recipe', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken and rice', ['chicken_breast', 'rice_cooked']);
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 360 });
    await tracker.expectTotal('kcal', 538);
    const panel = await tracker.openEditPanel(CHICKEN_AND_RICE);
    await panel.locator('[data-ing-add-source]').selectOption('olive_oil');
    await panel.locator('[data-ing-add-confirm]').click();
    await expect(fullRecipeBox(tracker.editPanel(CHICKEN_AND_RICE))).toHaveValue('375');
    await expectLoggedPortion(tracker, CHICKEN_AND_RICE, { box: '1', dailyKcal: 658 }, 'right after adding');
    await tracker.closeEditPanel(CHICKEN_AND_RICE);
    await expectLoggedPortion(tracker, CHICKEN_AND_RICE, { box: '1', dailyKcal: 658 }, 'after closing the panel');
    expect((await tracker.cloudDay()).counters[CHICKEN_AND_RICE]).toBe(375);
  });

  test('adding an ingredient in the recipe maker before saving saves it with the new batch', async ({ tracker }) => {
    await tracker.open();
    await tracker.addRecipeIngredient('chicken_breast');
    await tracker.addRecipeIngredient('rice_cooked');
    await expect(tracker.recipeTotalsText()).toHaveText('538 kcal · 66 P · 2.2 SF · 239 ml · 0 caf');
    const oilRow = await tracker.addRecipeIngredient('olive_oil');
    await expectBoxes(oilRow, ['1', '15']);
    await expect(tracker.recipeTotalsText()).toHaveText('658 kcal · 66 P · 4.3 SF · 239 ml · 0 caf');
    await expect(tracker.recipeRatioText()).toHaveText('9.97 kcal/p');
    const maker = tracker.recipeMaker();
    await maker.locator('[data-recipe-name]').fill('Chicken and rice');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    await expect(tracker.rowTitle(CHICKEN_AND_RICE)).toHaveText('Chicken and rice (full recipe / 375 g)');
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_AND_RICE];
    expect(saved.ingredients).toEqual([
      { itemKey: 'chicken_breast', amount: 200 },
      { itemKey: 'rice_cooked', amount: 160 },
      { itemKey: 'olive_oil', amount: 15 },
    ]);
    expect(fullRecipeOf(saved).multiplier).toBe(375);
    await tracker.plus(CHICKEN_AND_RICE, { servingSize: 375 });
    await tracker.expectTotal('kcal', 658);
  });
});

test.describe('New recipe, then an ingredient is removed', () => {
  test('removing an ingredient from the edit panel recalculates the boxes, the recipe row and what it logs', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken rice and oil', ['chicken_breast', 'rice_cooked', 'olive_oil']);
    let panel = await tracker.openEditPanel(CHICKEN_RICE_AND_OIL);
    await expectBatch(tracker, panel, CHICKEN_RICE_AND_OIL, {
      name: 'Chicken rice and oil', grams: 375,
      cells: ['10 kcal/p', '658 kcal', '66g Protein', '4.3g Sat. Fat.', '238.8ml water'],
    });
    await ingredientRow(panel, 'rice_cooked').locator('[data-ing-delete]').click();
    panel = tracker.editPanel(CHICKEN_RICE_AND_OIL);
    await expect(panel.locator('[data-ing-row]')).toHaveCount(2);
    await expect(panel.locator('.ing-linked-name')).toHaveText(['Chicken breast (Test Farms)', 'Olive oil']);
    await expectBoxes(ingredientRow(panel, 'chicken_breast'), ['1', '2', '200']);
    await expectBoxes(ingredientRow(panel, 'olive_oil'), ['1', '15']);
    await expectBatch(tracker, panel, CHICKEN_RICE_AND_OIL, {
      name: 'Chicken rice and oil', grams: 215,
      cells: ['7.3 kcal/p', '450 kcal', '62g Protein', '4.1g Sat. Fat.', '130ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_RICE_AND_OIL);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_RICE_AND_OIL];
    expect(saved.ingredients).toEqual([{ itemKey: 'chicken_breast', amount: 200 }, { itemKey: 'olive_oil', amount: 15 }]);
    expect(fullRecipeOf(saved).multiplier).toBe(215);
    await tracker.plus(CHICKEN_RICE_AND_OIL, { servingSize: 215 });
    await tracker.expectTotal('kcal', 450);
    await tracker.expectTotal('p', 62);
    panel = await tracker.openEditPanel(CHICKEN_RICE_AND_OIL);
    await expect(panel.locator('[data-ing-row]'), 'the removed ingredient stays removed after reopening').toHaveCount(2);
  });

  test('an amount edited just before removing another ingredient is kept', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken rice and oil', ['chicken_breast', 'rice_cooked', 'olive_oil']);
    let panel = await tracker.openEditPanel(CHICKEN_RICE_AND_OIL);
    await servingBox(ingredientRow(panel, 'chicken_breast'), 200).fill('1.5');
    await ingredientRow(panel, 'rice_cooked').locator('[data-ing-delete]').click();
    panel = tracker.editPanel(CHICKEN_RICE_AND_OIL);
    await expect(panel.locator('[data-ing-row]')).toHaveCount(2);
    await expectBoxes(ingredientRow(panel, 'chicken_breast'), ['1.5', '3', '300']);
    await expectBatch(tracker, panel, CHICKEN_RICE_AND_OIL, {
      name: 'Chicken rice and oil', grams: 315,
      cells: ['6.6 kcal/p', '615 kcal', '93g Protein', '5.1g Sat. Fat.', '195ml water'],
    });
    await tracker.closeEditPanel(CHICKEN_RICE_AND_OIL);
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_RICE_AND_OIL];
    expect(saved.ingredients).toEqual([{ itemKey: 'chicken_breast', amount: 300 }, { itemKey: 'olive_oil', amount: 15 }]);
    expect(fullRecipeOf(saved).multiplier).toBe(315);
  });

  test('a full recipe logged before an ingredient is removed stays one full recipe', async ({ tracker }) => {
    await tracker.open();
    await createRecipe(tracker, 'Chicken rice and oil', ['chicken_breast', 'rice_cooked', 'olive_oil']);
    await tracker.plus(CHICKEN_RICE_AND_OIL, { servingSize: 375 });
    await tracker.expectTotal('kcal', 658);
    const panel = await tracker.openEditPanel(CHICKEN_RICE_AND_OIL);
    await ingredientRow(panel, 'rice_cooked').locator('[data-ing-delete]').click();
    await expect(fullRecipeBox(tracker.editPanel(CHICKEN_RICE_AND_OIL))).toHaveValue('215');
    await expectLoggedPortion(tracker, CHICKEN_RICE_AND_OIL, { box: '1', dailyKcal: 450 }, 'while the panel is still open');
    await tracker.closeEditPanel(CHICKEN_RICE_AND_OIL);
    await expectLoggedPortion(tracker, CHICKEN_RICE_AND_OIL, { box: '1', dailyKcal: 450 }, 'after closing the panel');
    expect((await tracker.cloudDay()).counters[CHICKEN_RICE_AND_OIL]).toBe(215);
  });

  test('removing an ingredient in the recipe maker before saving saves the smaller batch', async ({ tracker }) => {
    await tracker.open();
    await tracker.addRecipeIngredient('chicken_breast');
    const riceRow = await tracker.addRecipeIngredient('rice_cooked');
    await tracker.addRecipeIngredient('olive_oil');
    await expect(tracker.recipeTotalsText()).toHaveText('658 kcal · 66 P · 4.3 SF · 239 ml · 0 caf');
    await riceRow.locator('[data-recipe-ing-delete]').click();
    await expect(tracker.recipeRows()).toHaveCount(2);
    await expect(tracker.recipeTotalsText()).toHaveText('450 kcal · 62 P · 4.1 SF · 130 ml · 0 caf');
    await expect(tracker.recipeRatioText()).toHaveText('7.26 kcal/p');
    const maker = tracker.recipeMaker();
    await maker.locator('[data-recipe-name]').fill('Chicken rice and oil');
    await maker.locator('[data-recipe-store]').first().check();
    await maker.locator('[data-recipe-save]').first().click();
    await expect(tracker.rowTitle(CHICKEN_RICE_AND_OIL)).toHaveText('Chicken rice and oil (full recipe / 215 g)');
    const saved = (await tracker.cloud()).userCatalog.items[CHICKEN_RICE_AND_OIL];
    expect(saved.ingredients).toEqual([{ itemKey: 'chicken_breast', amount: 200 }, { itemKey: 'olive_oil', amount: 15 }]);
    expect(fullRecipeOf(saved).multiplier).toBe(215);
    await tracker.plus(CHICKEN_RICE_AND_OIL, { servingSize: 215 });
    await tracker.expectTotal('kcal', 450);
  });
});

test.describe('Recipes that already contain another recipe', () => {
  test('opening a recipe that holds a quarter of another recipe shows that quarter in its boxes', async ({ tracker }) => {
    await tracker.open();
    // recipe_in_recipe = 0.25 × the 1440 g slab (one 360 g serving, 538 kcal) + 5 ml oil.
    const panel = await tracker.openEditPanel('recipe_in_recipe');
    const slab = ingredientRow(panel, 'meal_prep_slab');
    await expect(servingLabels(slab)).toHaveText(['1 serving (360 g)', 'full recipe (1440 g)', '1 g']);
    await expectBoxes(slab, ['1', '0.3', '360']);
    await expect(slab.locator('[data-ing-computed]')).toHaveText('538 kcal · 66 P · 2.2 SF · 238.8 ml water');
  });

  test('saving a recipe that holds a quarter of another recipe keeps the quarter exact', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('recipe_in_recipe');
    await panel.locator('[data-edit-field="name"]').fill('Slab bowl with oil v2');
    await tracker.closeEditPanel('recipe_in_recipe');
    const saved = (await tracker.cloud()).userCatalog.items.recipe_in_recipe;
    expect(saved.ingredients[0]).toEqual({ itemKey: 'meal_prep_slab', multiplier: 0.25 });
    await tracker.plus('recipe_in_recipe', { servingSize: 365 });
    await tracker.expectTotal('kcal', 578);
  });

  test('typing half a serving of the inner recipe halves what it adds', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('recipe_in_recipe');
    const slab = ingredientRow(panel, 'meal_prep_slab');
    await servingBox(slab, 360).fill('0.5');
    await expectBoxes(slab, ['0.5', '0.1', '180']);
    await expect(slab.locator('[data-ing-computed]')).toHaveText('269 kcal · 33 P · 1.1 SF · 119.4 ml water');
    await expect(fullRecipeBox(panel)).toHaveValue('185');
    await tracker.closeEditPanel('recipe_in_recipe');
    const saved = (await tracker.cloud()).userCatalog.items.recipe_in_recipe;
    expect(saved.ingredients[0]).toEqual({ itemKey: 'meal_prep_slab', multiplier: 0.125 });
    await tracker.plus('recipe_in_recipe', { servingSize: 185 });
    await tracker.expectTotal('kcal', 309);
  });

  test('a recipe logged whole stays whole when a recipe inside it changes', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('recipe_in_recipe', { servingSize: 365 });
    await tracker.expectTotal('kcal', 578);
    const panel = await tracker.openEditPanel('meal_prep_slab');
    await servingBox(ingredientRow(panel, 'chicken_breast'), 1).fill('1000');
    // The slab becomes 1640 g, 2482 kcal; a quarter of it plus 5 ml oil is
    // 415 g and 660.5 kcal, and the logged bowl is still one whole bowl.
    await expect(tracker.rowTitle('recipe_in_recipe')).toHaveText('Slab bowl with oil (full recipe / 415 g)');
    await expectLoggedPortion(tracker, 'recipe_in_recipe', { box: '1', dailyKcal: 661 }, 'while the slab panel is still open');
    await tracker.closeEditPanel('meal_prep_slab');
    await expectLoggedPortion(tracker, 'recipe_in_recipe', { box: '1', dailyKcal: 661 }, 'after closing the panel');
    expect((await tracker.cloudDay()).counters.recipe_in_recipe).toBe(415);
  });
});

test.describe('One-off recipes changed on the day they were logged', () => {
  test('a one-off recipe logged today stays one full recipe when edited, and yesterday is untouched', async ({ tracker, page }) => {
    await tracker.open({ seed: state => logCounter(state, 'one_off_lunch', 200, { at: '11:30' }) });
    await tracker.expectTotal('kcal', 295);
    const panel = await tracker.openEditPanel('one_off_lunch');
    await servingBox(ingredientRow(panel, 'chicken_breast'), 1).fill('150');
    // 150 g chicken (247.5) + 100 g rice (130) = 377.5 kcal in a 250 g batch.
    await expectLoggedPortion(tracker, 'one_off_lunch', { box: '1', dailyKcal: 378 }, 'after the edit');
    await tracker.closeEditPanel('one_off_lunch');
    const day = await tracker.cloudDay();
    expect(day.counters.one_off_lunch).toBe(250);
    expect(day.recipeSnapshots.one_off_lunch.ingredients[0]).toEqual({ itemKey: 'chicken_breast', amount: 150 });
    await page.locator('#checkout-date-prev').click();
    await expect(page.locator('#checkout-date')).toContainText(YESTERDAY);
    await tracker.expectTotal('kcal', 295);
  });
});