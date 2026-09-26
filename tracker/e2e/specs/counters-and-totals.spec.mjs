import { test, expect } from '../support/fixtures.mjs';
import { TODAY, YESTERDAY, logCounter } from '../support/seed.mjs';

test.describe('Logging with + and −', () => {
  test('tapping + logs one serving and updates the daily totals', { tag: '@mobile' }, async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('protein_shake', { servingSize: 330 });
    await expect(tracker.counterInput('protein_shake', 330)).toHaveValue('1');
    await tracker.expectTotal('kcal', 165);
    await tracker.expectTotal('p', 33);
    await tracker.expectTotal('water', 297);
  });

  test('tapping − brings the item back to zero and disables −', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('protein_shake', { servingSize: 330 });
    await tracker.minus('protein_shake', { servingSize: 330 });
    await expect(tracker.counterInput('protein_shake', 330)).toHaveValue('0');
    await tracker.expectTotal('kcal', 0);
    await expect(tracker.decButton('protein_shake', 330)).toBeDisabled();
  });

  test('− is disabled before anything is logged', async ({ tracker }) => {
    await tracker.open();
    await expect(tracker.decButton('chicken_breast', 200)).toBeDisabled();
    await expect(tracker.incButton('chicken_breast', 200)).toBeEnabled();
  });

  test('every serving row of an item reads from one shared amount', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('greek_yogurt', { servingSize: 340, times: 2 });
    await tracker.showServings('greek_yogurt');
    await expect(tracker.counterInput('greek_yogurt', 340)).toHaveValue('2');
    await expect(tracker.counterInput('greek_yogurt', 680)).toHaveValue('1');
    await expect(tracker.counterInput('greek_yogurt', 170)).toHaveValue('4');
    await expect(tracker.counterInput('greek_yogurt', 1)).toHaveValue('680');
    await tracker.expectTotal('kcal', 408);
  });

  test('rapid taps are all kept', { tag: '@mobile' }, async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('protein_shake', { servingSize: 330, times: 5 });
    await expect(tracker.counterInput('protein_shake', 330)).toHaveValue('5');
    const day = await tracker.cloudDay();
    expect(day.counters.protein_shake).toBe(1650);
  });

  test('a logged amount reaches the cloud', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('chicken_breast', { servingSize: 200 });
    const day = await tracker.cloudDay();
    expect(day.counters.chicken_breast).toBe(200);
    expect(typeof day.counterMeta.chicken_breast).toBe('string');
  });

  test('a logged amount survives a reload', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await tracker.waitForSyncIdle();
    await tracker.reload();
    await expect(tracker.counterInput('chicken_breast', 200)).toHaveValue('1');
    await tracker.expectTotal('kcal', 330);
  });

  test('logging while viewing yesterday writes to yesterday, not today', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-date-prev').click();
    await expect(page.locator('#checkout-date')).toContainText(YESTERDAY);
    await tracker.plus('protein_shake', { servingSize: 330 });
    const state = await tracker.cloud();
    expect(state.days[YESTERDAY].counters.protein_shake).toBe(330);
    expect(((state.days[TODAY] || {}).counters || {}).protein_shake || 0).toBe(0);
  });

  test('an unscheduled supplement is counted from its catalog row', async ({ tracker }) => {
    await tracker.open();
    await tracker.plus('caffeine_pill', { servingSize: 1 });
    await tracker.expectTotal('caffeine', 100);
  });

  test('a scheduled supplement row in the catalog cannot be tapped', async ({ tracker, page }) => {
    await tracker.open();
    const catalogRow = page.locator('#catalog-groups .checkout-row[data-key="vitamin_d"]');
    await expect(catalogRow.locator('.counter-btn[data-action="inc"]')).toBeDisabled();
    await expect(catalogRow.locator('input.counter-value')).toBeDisabled();
  });

  test('archived items never count toward the totals', async ({ tracker }) => {
    await tracker.open({ seed: state => logCounter(state, 'old_granola', 60) });
    await tracker.expectTotal('kcal', 0);
  });

  test('logging a timed item clears its "past time" flag right away', async ({ tracker }) => {
    await tracker.open(); // 12:00, the protein bar is due at 09:00
    const bar = tracker.row('protein_bar');
    await expect(bar).toHaveClass(/flagged/);
    await expect(bar.locator('.checkout-flag')).toHaveText('⚠ past time');
    await tracker.plus('protein_bar', { servingSize: 40 });
    await expect(bar, 'the flag clears as soon as the bar is logged').not.toHaveClass(/flagged/, { timeout: 3000 });
    await expect(bar.locator('.checkout-flag')).toHaveCount(0);
  });

  test('items counted in pieces never show a gram weight in their row title', async ({ tracker }) => {
    await tracker.open();
    await expect(tracker.row('egg_large').locator(':scope > div > .checkout-item-name')).toHaveText('Egg · 2 eggs');
    await expect(tracker.page.locator('#catalog-groups .checkout-row[data-key="caffeine_pill"] .checkout-item-name')).toHaveText('Caffeine pill · 1 pill');
  });
});

test.describe('Typing an amount', () => {
  test('an amount with two decimals is accepted', { tag: '@mobile' }, async ({ tracker }) => {
    await tracker.open();
    await tracker.typeCount('protein_shake', 330, '0.25');
    await tracker.expectTotal('kcal', 41);
    const day = await tracker.cloudDay();
    expect(day.counters.protein_shake).toBe(82.5);
  });

  test('totals follow each keystroke, before leaving the field', async ({ tracker }) => {
    await tracker.open();
    const input = tracker.counterInput('chicken_breast', 200);
    await input.click();
    await input.pressSequentially('1', { delay: 60 });
    await tracker.expectTotal('kcal', 330);
    await input.pressSequentially('.5', { delay: 60 });
    await tracker.expectTotal('kcal', 495);
    await expect(input).toBeFocused();
  });

  test('a negative amount counts as zero', async ({ tracker }) => {
    await tracker.open();
    await tracker.typeCount('chicken_breast', 200, '-2');
    await tracker.expectTotal('kcal', 0);
  });

  test('typing in one serving row updates the other rows of the same item', async ({ tracker }) => {
    await tracker.open();
    await tracker.showServings('greek_yogurt');
    await tracker.typeCount('greek_yogurt', 170, '3');
    await expect(tracker.counterInput('greek_yogurt', 340)).toHaveValue('1.5');
    await expect(tracker.counterInput('greek_yogurt', 680)).toHaveValue('0.75');
    await tracker.expectTotal('kcal', 306);
  });
});

test.describe('Daily totals strip', () => {
  test('shows percent of goal and what is left', async ({ tracker, page }) => {
    await tracker.open();
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await expect(page.locator('[data-pct="kcal"]')).toHaveText('(20% · -1320)');
    await expect(page.locator('[data-pct="p"]')).toHaveText('(34% · -122.0)');
    await expect(page.locator('[data-bar="kcal"]')).toHaveAttribute('style', /width: 20(\.\d+)?%/);
  });

  test("Today's kcal/p reads below goal after protein-dense food", async ({ tracker, page }) => {
    await tracker.open();
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await tracker.expectTotal('_kcal_per_p', 5.3);
    await expect(page.locator('[data-goal-line="_kcal_per_p"]')).toHaveText('below goal 9');
    await expect(page.locator('[data-bar="_kcal_per_p"]')).toHaveAttribute('style', /width: 100%/);
  });

  test("Today's kcal/p reads above goal after calorie-dense food", async ({ tracker, page }) => {
    await tracker.open();
    await tracker.plus('rice_cooked', { servingSize: 160 });
    await tracker.expectTotal('_kcal_per_p', 52);
    await expect(page.locator('[data-goal-line="_kcal_per_p"]')).toHaveText('above goal 9');
  });

  test('the Daily Tracker bar collapses and the choice survives a reload', async ({ tracker, page }) => {
    await tracker.open();
    await page.locator('#checkout-totals > h2').click();
    await expect(page.locator('#checkout-totals')).toHaveClass(/collapsed/);
    await tracker.waitForCloud(state => state.totalsMode === 'collapsed');
    await tracker.reload();
    await expect(page.locator('#checkout-totals')).toHaveClass(/collapsed/);
  });
});

test.describe('Custom portion from the edit panel', () => {
  test('grams are added exactly', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await panel.locator('[data-track-portion-amount]').fill('60');
    await panel.locator('[data-track-portion-unit]').selectOption('g');
    await panel.locator('[data-track-portion-add]').click();
    await tracker.expectTotal('kcal', 99);
    expect((await tracker.cloudDay()).counters.chicken_breast).toBe(60);
  });

  test('ounces are converted to grams', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await panel.locator('[data-track-portion-amount]').fill('2');
    await panel.locator('[data-track-portion-unit]').selectOption('oz');
    await panel.locator('[data-track-portion-add]').click();
    await tracker.expectTotal('kcal', 94);
    expect((await tracker.cloudDay()).counters.chicken_breast).toBeCloseTo(56.699, 3);
  });

  test("one of the item's own servings can be used as the unit", async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('chicken_breast');
    await panel.locator('[data-track-portion-amount]').fill('2');
    await panel.locator('[data-track-portion-unit]').selectOption({ label: '100 g (100 g)' });
    await panel.locator('[data-track-portion-add]').click();
    await tracker.expectTotal('kcal', 330);
  });

  test('a mass unit on a volume item converts through its density', async ({ tracker }) => {
    await tracker.open();
    const panel = await tracker.openEditPanel('olive_oil');
    // Olive oil is measured in ml; 10 g at 0.9 g/ml = 11.11 ml = 88.9 kcal.
    await panel.locator('[data-track-portion-amount]').fill('10');
    await panel.locator('[data-track-portion-unit]').selectOption('g');
    await panel.locator('[data-track-portion-add]').click();
    await tracker.expectTotal('kcal', 89);
  });
});
