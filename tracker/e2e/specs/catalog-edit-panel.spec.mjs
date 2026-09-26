import { test, expect } from '../support/fixtures.mjs';
import { baselineItems } from '../support/seed.mjs';

// The catalog edit panel: clicking an item's name opens an editor for its
// name, brand, servings, density, macros, notes, archive and delete.
// Edits save while typing; closing the panel commits and re-renders.

const field = (panel, name) => panel.locator(`[data-edit-field="${name}"]`);
const servingRows = panel => panel.locator('[data-variant-list] [data-variant-row]');
const servingRowLabelled = (panel, label) => servingRows(panel).filter({ has: panel.page().locator(`[data-variant-field="label"][value="${label}"]`) });
const pendingField = (panel, name) => panel.locator(`[data-variant-pending-row] [data-variant-field="${name}"]`);
const scaleButton = (panel, op, num, denom) => panel.locator(`[data-variant-op="${op}"][data-variant-num="${num}"][data-variant-denom="${denom}"]`);
const cloudItem = async (tracker, key) => (await tracker.cloud()).userCatalog.items[key];

test.describe('Catalog edit panel: opening and identity', () => {
  test("clicking an item's name opens its editor and clicking again closes it", async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await expect(panel).toBeVisible();
    await expect(tracker.variantGroup('chicken_breast')).toHaveClass(/variants-shown/);
    await tracker.closeEditPanel('chicken_breast');
    await expect(panel).toBeHidden();
  });

  test('renaming an item retitles its row while typing and saves the new name', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await field(panel, 'name').fill('Grilled chicken');
    await expect(tracker.rowTitle('chicken_breast')).toHaveText('Grilled chicken (Test Farms) · 1 breast (200 g)');
    await tracker.closeEditPanel('chicken_breast');
    await expect(tracker.rowTitle('chicken_breast')).toHaveText('Grilled chicken (Test Farms) · 1 breast (200 g)');
    expect((await cloudItem(tracker, 'chicken_breast')).name).toBe('Grilled chicken');
  });

  test('renaming an item with one saved serving keeps that serving in the title while typing', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('rice_cooked');
    await field(panel, 'name').fill('Jasmine rice');
    await expect(tracker.rowTitle('rice_cooked')).toHaveText('Jasmine rice · 1 cup (160 g)');
  });

  test('a brand shows in the title without changing the item name', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await field(panel, 'brand').fill('Kirkland');
    await tracker.closeEditPanel('chicken_breast');
    await expect(tracker.rowTitle('chicken_breast')).toHaveText('Chicken breast (Kirkland) · 1 breast (200 g)');
    const item = await cloudItem(tracker, 'chicken_breast');
    expect(item.name).toBe('Chicken breast');
    expect(item.brand).toBe('Kirkland');
  });

  test('clearing the brand removes it from the title and from the item', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await field(panel, 'brand').fill('');
    await tracker.closeEditPanel('chicken_breast');
    await expect(tracker.rowTitle('chicken_breast')).toHaveText('Chicken breast · 1 breast (200 g)');
    expect(await cloudItem(tracker, 'chicken_breast')).not.toHaveProperty('brand');
  });

  test('focused edit-panel fields never show a red outline', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('olive_oil');
    for (const name of ['name', 'brand', 'density', 'density_mlpg', 'kcal', 'notes']) {
      await field(panel, name).focus();
      const outline = await field(panel, name).evaluate(element => {
        const style = getComputedStyle(element);
        const [red, green, blue] = (style.outlineColor.match(/\d+/g) || ['0', '0', '0']).map(Number);
        return { style: style.outlineStyle, width: style.outlineWidth, redDominant: red > 150 && green < 110 && blue < 110 };
      });
      expect(outline.style === 'none' || !outline.redDominant, `${name} focus outline ${JSON.stringify(outline)}`).toBe(true);
    }
  });
});

test.describe('Catalog edit panel: macros and servings', () => {
  test('changing calories per gram updates the serving rows and the cloud', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await field(panel, 'kcal').fill('2');
    await expect.poll(() => tracker.rowKcal(tracker.rowForServing('chicken_breast', 200))).toBe(400);
    await expect.poll(() => tracker.rowKcal(tracker.rowForServing('chicken_breast', 100))).toBe(200);
    expect((await cloudItem(tracker, 'chicken_breast')).kcal).toBe(2);
  });

  test('the ×2 button proposes a doubled serving and Add saves it as a new row', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await scaleButton(panel, 'mult', 2, 1).click();
    await expect(pendingField(panel, 'amount')).toHaveValue('400');
    await expect(pendingField(panel, 'label')).toHaveValue('2 breast');
    await panel.locator('[data-variant-pending-add]').click();
    await expect(servingRows(panel)).toHaveCount(3);
    await tracker.closeEditPanel('chicken_breast');
    await expect(tracker.rowForServing('chicken_breast', 400).locator(':scope > div > .checkout-item-name'))
      .toHaveText('Chicken breast (Test Farms) · 2 breast (400 g)');
    const units = (await cloudItem(tracker, 'chicken_breast')).displayUnits;
    expect(units.map(unit => [unit.label, unit.multiplier])).toEqual(expect.arrayContaining([['2 breast', 400]]));
  });

  test('a newly added serving is saved right away, without closing the panel', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await scaleButton(panel, 'mult', 2, 1).click();
    await panel.locator('[data-variant-pending-add]').click();
    await tracker.waitForCloud(
      state => state.userCatalog.items.chicken_breast.displayUnits.some(unit => unit.multiplier === 400),
      { timeout: 10000, message: 'the added 400 g serving never reached the cloud while the panel stayed open' },
    );
  });

  test('+1/2 on a half-tub default proposes one whole tub', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('greek_yogurt');
    await scaleButton(panel, 'add', 1, 2).click();
    await expect(pendingField(panel, 'amount')).toHaveValue('680');
    await expect(pendingField(panel, 'label')).toHaveValue('1 tub');
  });

  test('a serving that already exists is refused with a message', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await scaleButton(panel, 'mult', 1, 2).click();
    await expect(pendingField(panel, 'amount')).toHaveValue('100');
    await panel.locator('[data-variant-pending-add]').click();
    await expect(panel.locator('[data-variant-add-error]')).toHaveText('That serving already exists (100 g).');
    await expect(servingRows(panel)).toHaveCount(2);
  });

  test('adding a serving with no amount is refused with a message', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await panel.locator('[data-variant-pending-add]').click();
    await expect(panel.locator('[data-variant-add-error]')).toHaveText('Set an amount greater than zero before adding.');
  });

  test('removing a serving deletes its row and saves immediately', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await servingRowLabelled(panel, '100 g').locator('[data-variant-delete]').click();
    await expect(tracker.rowForServing('chicken_breast', 100)).toHaveCount(0);
    await expect(tracker.rowForServing('chicken_breast', 200)).toHaveCount(1);
    await expect(tracker.editPanel('chicken_breast'), 'the editor stays open after removing a serving').toBeVisible();
    const units = (await cloudItem(tracker, 'chicken_breast')).displayUnits;
    expect(units.map(unit => unit.label)).toEqual(['1 breast']);
  });

  test('choosing another default serving makes it the row shown when collapsed', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await servingRowLabelled(panel, '100 g').locator('[data-variant-default-radio]').check();
    await tracker.closeEditPanel('chicken_breast');
    await expect(tracker.rowTitle('chicken_breast')).toHaveText('Chicken breast (Test Farms) · 100 g');
    const units = (await cloudItem(tracker, 'chicken_breast')).displayUnits;
    expect(units.filter(unit => unit.default).map(unit => unit.label)).toEqual(['100 g']);
  });

  test('the two density boxes stay reciprocal and the density is saved', async ({ tracker }) => {
    await tracker.open();
    let panel = await tracker.openEditPanel('olive_oil');
    await expect(field(panel, 'density')).toHaveValue('0.9');
    await expect(field(panel, 'density_mlpg')).toHaveValue('1.11111');
    await field(panel, 'density').fill('1.05');
    await expect(field(panel, 'density_mlpg')).toHaveValue('0.95238');
    await tracker.closeEditPanel('olive_oil');
    expect((await cloudItem(tracker, 'olive_oil')).density_g_per_ml).toBe(1.05);
    panel = await tracker.openEditPanel('olive_oil');
    await field(panel, 'density_mlpg').fill('1.25');
    await expect(field(panel, 'density')).toHaveValue('0.8');
    await tracker.closeEditPanel('olive_oil');
    expect((await cloudItem(tracker, 'olive_oil')).density_g_per_ml).toBe(0.8);
  });

  test('notes are saved with the item', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await field(panel, 'notes').fill('Buy the family pack');
    await tracker.closeEditPanel('chicken_breast');
    expect((await cloudItem(tracker, 'chicken_breast')).notes).toBe('Buy the family pack');
  });

  test('edits survive a reload', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await field(panel, 'name').fill('Grilled chicken');
    await field(panel, 'brand').fill('Kirkland');
    await field(panel, 'kcal').fill('2');
    await tracker.closeEditPanel('chicken_breast');
    await tracker.waitForSyncIdle();
    await tracker.reload();
    await expect(tracker.rowTitle('chicken_breast')).toHaveText('Grilled chicken (Kirkland) · 1 breast (200 g)');
    expect(await tracker.rowKcal(tracker.rowForServing('chicken_breast', 200))).toBe(400);
  });

  test('an item measured in 30 g servings shows its per-serving and per-100 g values correctly', async ({ tracker }) => {
    await tracker.open({ seed: state => {
      state.userCatalog.items.whey_scoop = {
        name: 'Whey scoop', category: 'items', defaultMeasuredIn: 'g', amount: { value: 30, unit: 'g' },
        kcal: 4, p: 0.8,
        displayUnits: [{ label: '1 scoop', multiplier: 30, default: true }],
      };
    } });
    // The catalog row is the reference: one 30 g scoop at 4 kcal per gram is 120 kcal.
    expect(await tracker.rowKcal(tracker.row('whey_scoop'))).toBe(120);
    const panel = await tracker.openEditPanel('whey_scoop');
    await expect(panel.locator('[data-macro-twin="serving"][data-macro-key="kcal"]')).toHaveValue('120');
    await expect(panel.locator('[data-macro-twin="per100"][data-macro-key="kcal"]')).toHaveValue('400');
  });
});

test.describe('Catalog edit panel: writes only what changed', () => {
  test('opening and closing an item without editing sends nothing to the cloud', async ({ tracker, page }) => {
    await tracker.open();
    const writes = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).hostname.endsWith('.workers.dev')) writes.push(request.url());
    });
    await tracker.openEditPanel('protein_shake');
    await tracker.closeEditPanel('protein_shake');
    await page.waitForTimeout(2500);
    expect(writes, 'writes caused by merely opening and closing the editor').toEqual([]);
  });

  test('opening and closing an item without editing leaves it exactly as stored', async ({ tracker }) => {
    await tracker.open();
    await tracker.openEditPanel('egg_large');
    await tracker.closeEditPanel('egg_large');
    expect(await cloudItem(tracker, 'egg_large')).toEqual(baselineItems().egg_large);
  });
});

test.describe('Catalog edit panel: archive and delete', () => {
  test('archiving moves the item to the Archive bar and out of its category', async ({ tracker, page }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await panel.locator('[data-item-archive]').click();
    await expect(tracker.categoryBar('items').locator('.checkout-row[data-key="chicken_breast"]')).toHaveCount(0);
    const archive = page.locator('.checkout-group.archive-group');
    await expect(archive.locator('.checkout-group-header')).toHaveText('Archive · 2 items');
    await expect(archive.locator('.archive-row .checkout-item-name')).toHaveText(['Chicken breast (Test Farms)', 'Old granola']);
    await expect(archive.locator('.archive-row').first().locator('.archive-meta')).toHaveText('was in items');
    const item = await cloudItem(tracker, 'chicken_breast');
    expect(item).toMatchObject({ archived: true, prevCategory: 'items' });
  });

  test('unarchiving restores the item to its category', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('[data-item-unarchive="old_granola"]').click();
    await expect(tracker.categoryBar('items').locator('.checkout-row[data-key="old_granola"]')).toHaveCount(1);
    await expect(page.locator('#catalog-archive-container')).toBeHidden();
    const item = await cloudItem(tracker, 'old_granola');
    expect(item.category).toBe('items');
    expect(item).not.toHaveProperty('archived');
    expect(item).not.toHaveProperty('prevCategory');
  });

  test('deleting asks first and keeps the item when cancelled', async ({ tracker }) => {
    await tracker.open();
    tracker.dialogResponse = 'dismiss';
    const panel = await tracker.openEditPanel('protein_bar');
    await panel.locator('[data-item-delete]').click();
    expect(tracker.dialogs.map(dialog => dialog.type)).toEqual(['confirm']);
    expect(tracker.dialogs[0].message).toMatch(/^Delete "Protein bar"\?/);
    await expect(tracker.row('protein_bar')).toBeVisible();
    expect(await cloudItem(tracker, 'protein_bar')).toBeTruthy();
  });

  test('deleting after confirming removes the item from the catalog and the cloud', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('protein_bar');
    await panel.locator('[data-item-delete]').click();
    await expect(tracker.rows('protein_bar')).toHaveCount(0);
    expect(await cloudItem(tracker, 'protein_bar')).toBeUndefined();
  });

  test('deleting an ingredient warns which recipes use it', async ({ tracker }) => {
    await tracker.open();
    tracker.dialogResponse = 'dismiss';
    const panel = await tracker.openEditPanel('olive_oil');
    await panel.locator('[data-item-delete]').click();
    expect(tracker.dialogs[0].message).toContain('Referenced by 3 recipes: Chicken rice bowl, Egg scramble, Slab bowl with oil.');
  });

  test('a locked supplement row in the catalog still opens its editor', async ({ tracker }) => {
    await tracker.open();
    const row = tracker.categoryBar('supplements').locator('.checkout-row[data-key="vitamin_d"]');
    await expect(row.locator('.counter-locked-hint')).toHaveText('↑ Toggle in the supplements section to log');
    await row.locator(':scope > div > .checkout-item-name').click();
    // Scoped to the catalog row: the Supplements and liquids rows carry their own panel for the same item.
    await expect(row.locator('[data-edit-panel-key="vitamin_d"]')).toBeVisible();
  });
});
