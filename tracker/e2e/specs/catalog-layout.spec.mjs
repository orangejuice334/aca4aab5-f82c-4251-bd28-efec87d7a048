import { test, expect } from '../support/fixtures.mjs';
import { logCounter } from '../support/seed.mjs';

// Luis: "I don't want any nested items anymore." The Catalog bar that used to
// wrap Today's log, Supplements and liquids, every category group, Today's
// custom items, Add new catalog item and Recipe maker is gone; each of those
// is a top-level bar, and so is the Archive bar at the bottom.

const withLoggedShake = state => { logCounter(state, 'protein_shake', 330, { at: '08:00' }); };

test.describe('Catalog bars are top-level', () => {
  test('there is no parent Catalog bar and no bar sits inside another', { tag: '@mobile' }, async ({ tracker, page }) => {
    await tracker.open({ seed: withLoggedShake });
    await expect(page.locator('h2', { hasText: /^Catalog$/ })).toHaveCount(0);
    const nesting = await page.evaluate(() => {
      const bars = [
        document.getElementById('today-log-group'),
        document.querySelector('.checkout-group[data-group-key="supplements-water"]'),
        ...document.querySelectorAll('#catalog-groups > .checkout-group'),
        document.getElementById('add-new-item'),
        document.getElementById('recipe-maker'),
        document.querySelector('.checkout-group.archive-group'),
      ];
      return bars.map(bar => bar
        ? {
            name: bar.id || bar.dataset.groupKey,
            insideCollapsibleSection: Boolean(bar.closest('section[data-collapsible]')),
            insideAnotherBar: Boolean(bar.parentElement.closest('.checkout-group, details')),
          }
        : { name: 'missing' });
    });
    for (const bar of nesting) {
      expect(bar.name, 'every bar exists').not.toBe('missing');
      expect(bar, `${bar.name} is a top-level bar`).toEqual({ name: bar.name, insideCollapsibleSection: false, insideAnotherBar: false });
    }
  });

  test('every catalog bar heading sits at the same left inset as a top-level section heading', async ({ tracker, page }) => {
    await tracker.open({ seed: withLoggedShake });
    const insets = await page.evaluate(() => {
      const inset = (container, heading) => Math.round(heading.getBoundingClientRect().left - container.getBoundingClientRect().left);
      const weightSection = document.getElementById('weight-tracker');
      const reference = inset(weightSection, weightSection.querySelector(':scope > h2'));
      const bars = [...document.querySelectorAll('#checkout .checkout-group, #catalog-archive-container .checkout-group')]
        .filter(bar => bar.offsetParent !== null)
        .map(bar => ({ name: bar.dataset.groupKey, inset: inset(bar, bar.querySelector(':scope > .checkout-group-header')) }));
      for (const id of ['add-new-item', 'recipe-maker']) {
        const details = document.getElementById(id);
        bars.push({ name: id, inset: inset(details, details.querySelector(':scope > summary')) });
      }
      return { reference, bars };
    });
    expect(insets.reference).toBeGreaterThan(0);
    expect(insets.bars.length).toBeGreaterThanOrEqual(8);
    for (const bar of insets.bars) expect(bar.inset, `${bar.name} heading inset`).toBe(insets.reference);
  });

  test('every catalog bar draws the same top rule as a top-level section', async ({ tracker, page }) => {
    await tracker.open({ seed: withLoggedShake });
    const rules = await page.evaluate(() => {
      const rule = element => {
        const style = getComputedStyle(element);
        return `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`;
      };
      const reference = rule(document.getElementById('weight-tracker'));
      const bars = [...document.querySelectorAll('#checkout .checkout-group, #catalog-archive-container .checkout-group, #add-new-item, #recipe-maker')]
        .filter(bar => bar.offsetParent !== null)
        .map(bar => ({ name: bar.id || bar.dataset.groupKey, rule: rule(bar) }));
      return { reference, bars };
    });
    for (const bar of rules.bars) expect(bar.rule, `${bar.name} top rule`).toBe(rules.reference);
  });

  test('collapsing one catalog bar hides only that bar', async ({ tracker }) => {
    await tracker.open();
    await tracker.barHeader('catalog-cat-items').click();
    await expect(tracker.categoryBar('items')).toHaveClass(/collapsed/);
    await expect(tracker.row('rice_cooked')).toBeHidden();
    await expect(tracker.categoryBar('liquids')).not.toHaveClass(/collapsed/);
    await expect(tracker.row('protein_shake')).toBeVisible();
    await expect(tracker.recipeMaker()).toHaveJSProperty('open', true);
    await expect(tracker.addItemForm()).toHaveJSProperty('open', true);
  });

  test('a collapsed catalog bar stays collapsed after a reload', async ({ tracker }) => {
    await tracker.open();
    await tracker.barHeader('catalog-cat-liquids').click();
    await tracker.waitForCloud(state => Boolean(state.collapsedGroups && state.collapsedGroups['catalog-cat-liquids']));
    await tracker.reload();
    await expect(tracker.categoryBar('liquids')).toHaveClass(/collapsed/);
    await expect(tracker.categoryBar('items')).not.toHaveClass(/collapsed/);
  });

  test('Recipe maker and Add new catalog item open and close independently and remember it', async ({ tracker }) => {
    await tracker.open();
    await tracker.recipeMaker().locator(':scope > summary').click();
    await expect(tracker.recipeMaker()).toHaveJSProperty('open', false);
    await expect(tracker.addItemForm()).toHaveJSProperty('open', true);
    await tracker.waitForCloud(state => Boolean(state.collapsedGroups && state.collapsedGroups['details-recipe-maker']));
    await tracker.reload();
    await expect(tracker.recipeMaker()).toHaveJSProperty('open', false);
    await expect(tracker.addItemForm()).toHaveJSProperty('open', true);
  });

  test('the Archive bar is a top-level bar at the very bottom of the page', async ({ tracker, page }) => {
    await tracker.open();
    const archive = page.locator('.checkout-group.archive-group');
    await expect(archive).toBeVisible();
    await expect(archive.locator('.checkout-group-header')).toHaveText('Archive · 1 item');
    await expect(archive.locator('.archive-row .checkout-item-name')).toHaveText(['Old granola']);
    const isLastBar = await page.evaluate(() => {
      const archiveBar = document.querySelector('.checkout-group.archive-group');
      const mood = document.getElementById('mood-tracker');
      return Boolean(mood.compareDocumentPosition(archiveBar) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(isLastBar, 'the Archive bar comes after the Mood section').toBe(true);
  });

  test('the Archive bar disappears completely when nothing is archived', async ({ tracker, page }) => {
    await tracker.open({ seed: state => { delete state.userCatalog.items.old_granola; } });
    await expect(page.locator('#catalog-archive-container')).toBeHidden();
    await expect(page.locator('.checkout-group.archive-group')).toHaveCount(0);
  });

  test('category bars follow the category order and skip Water and empty categories', async ({ tracker, page }) => {
    await tracker.open();
    await expect(page.locator('#catalog-groups > .checkout-group:not(#today-log-group) .group-title'))
      .toHaveText(['Items', 'Liquids', 'Small portions', 'Recipes and Meals', 'Supplements']);
  });

  test('the protein cutoff divider sits between items under and over the daily kcal/p target', async ({ tracker }) => {
    await tracker.open();
    const divider = tracker.categoryBar('items').locator('.protein-cutoff-divider');
    await expect(divider).toHaveText('8.97 kcal/p — daily cutoff (1650/184)');
    const order = await tracker.categoryBar('items').evaluate(bar => [...bar.children]
      .map(child => child.classList.contains('protein-cutoff-divider') ? 'DIVIDER' : (child.dataset.itemKey || child.dataset.key || null))
      .filter(Boolean));
    expect(order).toEqual(['chicken_breast', 'greek_yogurt', 'DIVIDER', 'egg_large', 'rice_cooked', 'olive_oil']);
  });
});

test.describe('Sorting', () => {
  test('the sort button cycles category, A–Z and kcal/p, and remembers the choice', async ({ tracker, page }) => {
    await tracker.open();
    const sort = page.locator('#sort-toggle');
    await expect(sort).toHaveText('Sort: by category');
    await sort.click();
    await expect(sort).toHaveText('Sort: A–Z');
    await expect(tracker.bar('catalog-alpha')).toBeVisible();
    await expect(page.locator('#catalog-groups > .checkout-group:not(#today-log-group)')).toHaveCount(1);
    await sort.click();
    await expect(sort).toHaveText('Sort: by kcal/p');
    await expect(tracker.bar('catalog-ratio')).toBeVisible();
    await tracker.waitForCloud(state => state.sortMode === 'ratio');
    await tracker.reload();
    await expect(sort).toHaveText('Sort: by kcal/p');
    await sort.click();
    await expect(sort).toHaveText('Sort: by category');
    await expect(tracker.categoryBar('items')).toBeVisible();
  });

  test('the A–Z view lists every visible item alphabetically with Today\'s log right below it', async ({ tracker, page }) => {
    await tracker.open({ seed: state => { state.sortMode = 'alpha'; withLoggedShake(state); } });
    const titles = await tracker.bar('catalog-alpha').evaluate(bar => [...bar.children]
      .map(child => child.matches('.variant-group') ? child.querySelector('.checkout-row .checkout-item-name') : child.querySelector(':scope > div > .checkout-item-name'))
      .filter(Boolean)
      .map(name => name.textContent));
    const expected = ['Black coffee', 'Caffeine pill', 'Chicken breast', 'Chicken rice bowl', 'Egg', 'Egg scramble',
      'Greek yogurt', 'Magnesium', 'Meal prep slab', 'Olive oil', 'Protein bar', 'Protein shake',
      'Slab bowl with oil', 'Toast and butter', 'Vitamin D3', 'White rice'];
    expect(titles).toHaveLength(expected.length);
    expected.forEach((name, index) => expect(titles[index], `position ${index + 1}`).toMatch(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( \\(| ·|$)')));
    const nextSibling = await tracker.bar('catalog-alpha').evaluate(bar => bar.nextElementSibling && bar.nextElementSibling.id);
    expect(nextSibling).toBe('today-log-group');
    await expect(tracker.todayLog()).toBeVisible();
  });

  test('the kcal/p view orders by protein density with zero-protein items last', async ({ tracker }) => {
    await tracker.open({ seed: state => { state.sortMode = 'ratio'; } });
    const keys = await tracker.bar('catalog-ratio').evaluate(bar => [...bar.children]
      .map(child => child.dataset.itemKey || child.dataset.key).filter(Boolean));
    expect(keys).toEqual([
      'protein_shake', 'chicken_breast', 'greek_yogurt', 'meal_prep_slab', 'recipe_in_recipe', 'chicken_rice_bowl',
      'protein_bar', 'egg_large', 'egg_scramble', 'inline_breakfast', 'rice_cooked',
      'black_coffee', 'caffeine_pill', 'magnesium', 'olive_oil', 'vitamin_d',
    ]);
  });
});

test.describe('Bar filters', () => {
  test('a bar filter narrows its rows by name, ignoring case, and leaves other bars alone', async ({ tracker }) => {
    await tracker.open();
    await tracker.barFilter('catalog-cat-items').fill('CHICK');
    await expect(tracker.row('chicken_breast')).toBeVisible();
    await expect(tracker.row('rice_cooked')).toBeHidden();
    await expect(tracker.row('greek_yogurt')).toBeHidden();
    await expect(tracker.row('protein_shake')).toBeVisible();
  });

  test('filtering a collapsed bar opens it while filtering and closes it again when cleared', async ({ tracker }) => {
    await tracker.open({ seed: state => { state.collapsedGroups = { 'catalog-cat-items': true }; } });
    await expect(tracker.categoryBar('items')).toHaveClass(/collapsed/);
    await tracker.barFilter('catalog-cat-items').fill('rice');
    await expect(tracker.categoryBar('items')).not.toHaveClass(/collapsed/);
    await expect(tracker.row('rice_cooked')).toBeVisible();
    await tracker.barFilter('catalog-cat-items').fill('');
    await expect(tracker.categoryBar('items'), 'clearing the filter restores the collapsed bar').toHaveClass(/collapsed/);
  });

  test('filter text survives a rebuild of the catalog', async ({ tracker, page }) => {
    await tracker.open();
    await tracker.barFilter('catalog-cat-items').fill('yogurt');
    // A protein-goal change rebuilds every catalog bar.
    await page.locator('[data-profile="goals.p"]').fill('150');
    await expect(tracker.barFilter('catalog-cat-items')).toHaveValue('yogurt');
    await expect(tracker.row('greek_yogurt')).toBeVisible();
    await expect(tracker.row('chicken_breast')).toBeHidden();
  });
});

test('the page fits the screen without sideways scrolling', { tag: '@mobile' }, async ({ tracker, page }) => {
  await tracker.open({ seed: withLoggedShake });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
