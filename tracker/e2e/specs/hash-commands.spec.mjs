import { test, expect } from '../support/fixtures.mjs';

// Catalog links: #addItem=<base64url JSON>, #editItem=<base64url JSON>,
// #deleteItem=<key> and #catalogPart=<base64url JSON>. The page applies the
// command once after the first cloud load, shows a banner, saves, and strips
// the hash so a reload does not apply it again.

const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const banners = page => page.locator('#catalog-banner-host .catalog-banner');
const bannerText = page => banners(page).locator('.catalog-banner-text');

const granola = {
  key: 'hash_granola', name: 'Hash granola', category: 'items', defaultMeasuredIn: 'g',
  kcal: 4.5, p: 0.1, displayUnits: [{ label: '1 bowl', multiplier: 60, default: true }],
};

test.describe('Catalog links', () => {
  test('#addItem adds the item, confirms it, and clears the link from the address bar', async ({ tracker, page }) => {
    await tracker.open({ hash: 'addItem=' + encode(granola) });
    await expect(bannerText(page)).toHaveText(['Added: Hash granola (hash_granola)']);
    await expect(banners(page)).toHaveClass(/\bok\b/);
    expect(page.url()).not.toContain('#');
    await expect(tracker.row('hash_granola')).toBeVisible();
    const { key, ...stored } = granola;
    expect((await tracker.cloud()).userCatalog.items.hash_granola).toEqual(stored);
  });

  test('#addItem with an existing key replaces that item', async ({ tracker, page }) => {
    await tracker.open({ hash: 'addItem=' + encode({ ...granola, key: 'protein_bar', name: 'Protein bar v2' }) });
    await expect(bannerText(page)).toHaveText(['Updated: Protein bar v2 (protein_bar)']);
    expect((await tracker.cloud()).userCatalog.items.protein_bar.name).toBe('Protein bar v2');
  });

  test('#editItem changes only the fields it names', async ({ tracker, page }) => {
    await tracker.open({ hash: 'editItem=' + encode({ key: 'chicken_breast', brand: 'Hashed' }) });
    await expect(bannerText(page)).toHaveText(['Updated Chicken breast (brand Test Farms->Hashed)']);
    await expect(tracker.rowTitle('chicken_breast')).toHaveText('Chicken breast (Hashed) · 1 breast (200 g)');
    const chicken = (await tracker.cloud()).userCatalog.items.chicken_breast;
    expect(chicken).toMatchObject({ brand: 'Hashed', kcal: 1.65, p: 0.31, name: 'Chicken breast' });
  });

  test('#deleteItem removes the item', async ({ tracker, page }) => {
    await tracker.open({ hash: 'deleteItem=protein_bar' });
    await expect(bannerText(page)).toHaveText(['Removed: Protein bar (protein_bar)']);
    await expect(tracker.rows('protein_bar')).toHaveCount(0);
    expect((await tracker.cloud()).userCatalog.items).not.toHaveProperty('protein_bar');
  });

  test('#catalogPart adds and updates several items at once', async ({ tracker, page }) => {
    const { key, ...granolaItem } = granola;
    const part = {
      items: {
        hash_granola: granolaItem,
        rice_cooked: { name: 'White rice', category: 'items', defaultMeasuredIn: 'g', kcal: 1.3, p: 0.027, displayUnits: [{ label: '1 cup', multiplier: 160, default: true }] },
      },
    };
    await tracker.open({ hash: 'catalogPart=' + encode(part) });
    await expect(bannerText(page)).toHaveText(['Added 1: hash_granola · Updated 1: rice_cooked']);
    const items = (await tracker.cloud()).userCatalog.items;
    expect(items.hash_granola).toEqual(granolaItem);
    expect(items.rice_cooked.p).toBe(0.027);
  });

  test('accented names survive the link', async ({ tracker, page }) => {
    await tracker.open({ hash: 'addItem=' + encode({ ...granola, key: 'jamon_iberico', name: 'Jamón ibérico' }) });
    await expect(bannerText(page)).toHaveText(['Added: Jamón ibérico (jamon_iberico)']);
    await expect(tracker.rowTitle('jamon_iberico')).toHaveText('Jamón ibérico · 1 bowl (60 g)');
    expect((await tracker.cloud()).userCatalog.items.jamon_iberico.name).toBe('Jamón ibérico');
  });

  test('reloading after a link does not apply it again', async ({ tracker, page }) => {
    await tracker.open({ hash: 'deleteItem=protein_bar' });
    await expect(bannerText(page)).toHaveText(['Removed: Protein bar (protein_bar)']);
    await tracker.waitForSyncIdle();
    await tracker.reload();
    await expect(banners(page)).toHaveCount(0);
  });

  test('a link opened while the page is already open is applied too', async ({ tracker, page }) => {
    await tracker.open();
    await page.evaluate(() => { window.location.hash = 'deleteItem=protein_bar'; });
    await expect(bannerText(page), 'tapping a catalog link with the tracker tab already open').toHaveText(['Removed: Protein bar (protein_bar)']);
    await expect(tracker.rows('protein_bar')).toHaveCount(0);
  });

  test('an unknown command leaves the page and the address bar alone', async ({ tracker, page }) => {
    await tracker.open({ hash: 'frobnicate=1' });
    await expect(banners(page)).toHaveCount(0);
    expect(page.url()).toContain('#frobnicate=1');
  });
});

test.describe('Catalog link errors', () => {
  const expectError = async (page, message) => {
    await expect(bannerText(page)).toHaveText([`Catalog link error: ${message}`]);
    await expect(banners(page)).toHaveClass(/\berror\b/);
  };

  test('a payload that is not base64 is reported', async ({ tracker, page }) => {
    await tracker.open({ hash: 'addItem=@@@' });
    await expectError(page, 'malformed payload');
  });

  test('a payload that is not JSON is reported', async ({ tracker, page }) => {
    await tracker.open({ hash: 'addItem=' + encode('not json at all') });
    await expectError(page, 'invalid JSON');
  });

  test('an item without a category is refused', async ({ tracker, page }) => {
    await tracker.open({ hash: 'addItem=' + encode({ key: 'no_category', name: 'No category' }) });
    await expectError(page, 'missing key/name/category');
    expect((await tracker.cloud()).userCatalog.items).not.toHaveProperty('no_category');
  });

  test('editing an item that does not exist is reported', async ({ tracker, page }) => {
    await tracker.open({ hash: 'editItem=' + encode({ key: 'nope', brand: 'x' }) });
    await expectError(page, 'unknown key: nope');
  });

  test('deleting an item that does not exist is reported', async ({ tracker, page }) => {
    await tracker.open({ hash: 'deleteItem=nope' });
    await expectError(page, 'unknown key: nope');
  });
});
