// Shared fixtures and the TrackerPage page object for every scenario.
//
// Guarantees for each scenario:
//   - the test user's cloud state is reset to a known seed before the page loads;
//   - the page clock starts at a fixed moment (Mon 2026-06-15 12:00 EDT unless
//     the scenario says otherwise), so "today" never depends on the real date;
//   - any request the page makes for a user other than `test` is blocked and
//     fails the scenario (lg's data is never touched);
//   - any uncaught exception inside the page fails the scenario;
//   - in-flight sync finishes before teardown so nothing leaks into the next
//     scenario's seed.

import { test as base, expect } from '@playwright/test';
import { readTestUserState, waitForCloudState, writeTestUserState, TEST_USER } from './cloud.mjs';
import { baselineState, FIXED_NOON, TODAY } from './seed.mjs';

export { expect };

const STORAGE_PREFIX = '19ff6f4d-3d5b-40e6-88e2-573f647f903f';
export const QUEUE_KEY = `${STORAGE_PREFIX}-queue-${TEST_USER}`;
export const LOCAL_STATE_KEY = `${STORAGE_PREFIX}-state-${TEST_USER}`;

const isWorkerRequest = (url) => url.hostname.endsWith('.workers.dev');

async function guardOtherUsers(context, blockedRequests) {
  await context.route(isWorkerRequest, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('user') !== TEST_USER) {
      blockedRequests.push(route.request().method() + ' ' + url.toString());
      await route.abort();
      return;
    }
    await route.fallback();
  });
}

export class TrackerPage {
  constructor(page, testInfo) {
    this.page = page;
    this.testInfo = testInfo;
    this.dialogs = [];
    this.dialogResponse = 'accept';
    this.pageErrors = [];
    this.allowPageErrors = false;
    this.seededState = null;
    page.on('pageerror', error => this.pageErrors.push(error.message));
    page.on('dialog', async dialog => {
      this.dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (this.dialogResponse === 'dismiss') await dialog.dismiss();
      else await dialog.accept();
    });
  }

  // ---------- lifecycle ----------

  // seed: a function mutating the baseline state (its return value, when an
  // object, replaces the state), or a complete state object.
  async open({ seed, at = FIXED_NOON, hash = '', query = '', skipSeed = false, waitForLoad = true } = {}) {
    if (!skipSeed) {
      let state = baselineState();
      if (typeof seed === 'function') {
        const replaced = seed(state);
        if (replaced && typeof replaced === 'object') state = replaced;
      } else if (seed && typeof seed === 'object') {
        state = seed;
      }
      this.seededState = state;
      await writeTestUserState(state);
    }
    await this.page.clock.install({ time: at });
    await this.page.goto(`track.html?user=${TEST_USER}${query}${hash ? '#' + hash : ''}`);
    if (waitForLoad) await this.waitForLoaded();
  }

  async waitForLoaded() {
    const status = this.page.locator('#sync-status');
    await expect(status, 'first cloud load').toHaveAttribute('data-status', 'ok', { timeout: 30000 });
    await expect(status).toHaveText(/synced|saved/);
  }

  async reload() {
    await this.page.reload();
    await this.waitForLoaded();
  }

  // Resolves once every queued op has been accepted by the Worker.
  async waitForSyncIdle({ timeout = 20000 } = {}) {
    await expect.poll(async () => this.page.evaluate((queueKey) => {
      let pending = 0;
      try { pending = (JSON.parse(localStorage.getItem(queueKey) || '[]') || []).length; } catch (error) { pending = 0; }
      const statusElement = document.getElementById('sync-status');
      const status = statusElement ? statusElement.dataset.status : '';
      return pending === 0 && status !== 'saving' && status !== 'pending' && status !== 'loading';
    }, QUEUE_KEY), { timeout, message: 'the op queue never drained to the Worker' }).toBe(true);
  }

  async cloud() {
    await this.waitForSyncIdle();
    return (await readTestUserState()).state;
  }

  async cloudDay(dateKey = TODAY) {
    const state = await this.cloud();
    return (state.days && state.days[dateKey]) || {};
  }

  async waitForCloud(predicate, options) {
    await this.waitForSyncIdle();
    return waitForCloudState(predicate, options);
  }

  async pendingOpCount() {
    return this.page.evaluate((queueKey) => {
      try { return (JSON.parse(localStorage.getItem(queueKey) || '[]') || []).length; } catch (error) { return -1; }
    }, QUEUE_KEY);
  }

  // A second, independent browser (own storage) on the same test user, with
  // the same clock. Used for concurrent-device scenarios.
  async openSecondDevice(browser, { at = FIXED_NOON } = {}) {
    const use = this.testInfo.project.use;
    const context = await browser.newContext({
      baseURL: use.baseURL, timezoneId: use.timezoneId, locale: use.locale, viewport: use.viewport,
    });
    await guardOtherUsers(context, this.blockedRequests || []);
    const page = await context.newPage();
    const second = new TrackerPage(page, this.testInfo);
    await page.clock.install({ time: at });
    await page.goto(`track.html?user=${TEST_USER}`);
    await second.waitForLoaded();
    second.context = context;
    return second;
  }

  // ---------- catalog ----------
  // Row, counter and panel locators are scoped to the category bars
  // (#catalog-groups): the Supplements and liquids bar renders its own rows
  // and hidden edit panels for the same supplement keys.

  bar(groupKey) { return this.page.locator(`.checkout-group[data-group-key="${groupKey}"]`); }
  categoryBar(categoryKey) { return this.bar(`catalog-cat-${categoryKey}`); }
  barHeader(groupKey) { return this.bar(groupKey).locator('.checkout-group-header'); }
  barFilter(groupKey) { return this.bar(groupKey).locator('input[data-group-filter]'); }
  rows(key) { return this.page.locator(`#catalog-groups .checkout-row[data-key="${key}"]`); }
  row(key) { return this.rows(key).first(); }
  variantGroup(key) { return this.page.locator(`#catalog-groups .variant-group[data-item-key="${key}"]`); }
  rowForServing(key, servingSize) {
    return this.rows(key)
      .filter({ has: this.page.locator(`.counter-btn[data-action="inc"][data-serving-size="${servingSize}"]`) }).first();
  }

  incButton(key, servingSize) {
    const size = servingSize === undefined ? '' : `[data-serving-size="${servingSize}"]`;
    return this.page.locator(`#catalog-groups .counter-btn[data-action="inc"][data-key="${key}"]${size}`).first();
  }
  decButton(key, servingSize) {
    const size = servingSize === undefined ? '' : `[data-serving-size="${servingSize}"]`;
    return this.page.locator(`#catalog-groups .counter-btn[data-action="dec"][data-key="${key}"]${size}`).first();
  }
  counterInput(key, servingSize) {
    const size = servingSize === undefined ? '' : `[data-serving-size="${servingSize}"]`;
    return this.page.locator(`#catalog-groups input.counter-value[data-value="${key}"]${size}`).first();
  }

  // Expand a multi-serving item so its secondary serving rows are visible.
  async showServings(key) {
    const group = this.variantGroup(key);
    if (!(await group.count())) return;
    const shown = await group.evaluate(element => element.classList.contains('variants-shown'));
    if (!shown) await group.locator('.checkout-row').first().locator('.checkout-item-name').click();
    await expect(group).toHaveClass(/variants-shown/);
  }

  async ensureVisible(key, locator) {
    if (!(await locator.isVisible())) await this.showServings(key);
    await expect(locator).toBeVisible();
  }

  async plus(key, { servingSize, times = 1 } = {}) {
    const button = this.incButton(key, servingSize);
    await this.ensureVisible(key, button);
    for (let index = 0; index < times; index++) await button.click();
  }

  async minus(key, { servingSize, times = 1 } = {}) {
    const button = this.decButton(key, servingSize);
    await this.ensureVisible(key, button);
    for (let index = 0; index < times; index++) await button.click();
  }

  async typeCount(key, servingSize, value) {
    const input = this.counterInput(key, servingSize);
    await this.ensureVisible(key, input);
    await input.fill(String(value));
  }

  // Numeric value of a daily-totals cell (the number before the unit).
  async total(nutrientKey) {
    return this.page.locator(`[data-total="${nutrientKey}"]`).evaluate(element => {
      const text = element.firstChild ? element.firstChild.textContent : element.textContent;
      return parseFloat(String(text).trim());
    });
  }

  async expectTotal(nutrientKey, expectedDisplayed) {
    await expect.poll(() => this.total(nutrientKey), { message: `daily total for ${nutrientKey}` }).toBe(expectedDisplayed);
  }

  // kcal printed in a row's macro line ("658 kcal"), NaN when absent.
  async rowKcal(rowLocator) {
    return rowLocator.locator(':scope > div > .checkout-item-macros span').evaluateAll(spans => {
      const text = spans.map(span => span.textContent.trim()).find(value => /^-?[\d.]+ kcal$/.test(value));
      return text ? parseFloat(text) : NaN;
    });
  }

  rowTitle(key) { return this.row(key).locator(':scope > div > .checkout-item-name'); }

  // ---------- edit panel ----------

  editPanel(key) { return this.page.locator(`#catalog-groups [data-edit-panel-key="${key}"]`).first(); }

  async openEditPanel(key) {
    const panel = this.editPanel(key);
    if (await panel.isVisible()) return panel;
    const group = this.variantGroup(key);
    const target = (await group.count())
      ? group.locator('.checkout-row').first().locator(':scope > div > .checkout-item-name')
      : this.row(key).locator(':scope > div > .checkout-item-name');
    await target.click();
    await expect(panel).toBeVisible();
    return panel;
  }

  async closeEditPanel(key) {
    const panel = this.editPanel(key);
    if (!(await panel.isVisible())) return;
    const group = this.variantGroup(key);
    const target = (await group.count())
      ? group.locator('.checkout-row').first().locator(':scope > div > .checkout-item-name')
      : this.row(key).locator(':scope > div > .checkout-item-name');
    await target.click();
    await expect(this.editPanel(key)).toBeHidden();
  }

  // ---------- recipe maker ----------

  recipeMaker() { return this.page.locator('#recipe-maker'); }
  recipeRows() { return this.recipeMaker().locator('[data-recipe-ing-row]'); }
  recipeTotalsText() { return this.recipeMaker().locator('[data-recipe-totals-text]'); }
  recipeRatioText() { return this.recipeMaker().locator('[data-recipe-totals-ratio]'); }

  async openRecipeMaker() {
    const maker = this.recipeMaker();
    if (!(await maker.evaluate(element => element.open))) await maker.locator(':scope > summary').click();
    await expect(maker).toHaveJSProperty('open', true);
    return maker;
  }

  async addRecipeIngredient(itemKey) {
    await this.openRecipeMaker();
    await this.recipeMaker().locator('[data-recipe-ing-add]').click();
    const row = this.recipeRows().last();
    if (itemKey) await row.locator('[data-recipe-ing-select]').selectOption(itemKey);
    return row;
  }

  async setRecipeServing(row, servingSize, value) {
    await row.locator(`[data-recipe-variant-input][data-serving-size="${servingSize}"]`).fill(String(value));
  }

  // ---------- add new catalog item ----------

  addItemForm() { return this.page.locator('#add-new-item'); }

  async openAddItem() {
    const form = this.addItemForm();
    if (!(await form.evaluate(element => element.open))) await form.locator(':scope > summary').click();
    await expect(form).toHaveJSProperty('open', true);
    return form;
  }

  addItemField(name) { return this.addItemForm().locator(`[data-custom-input="${name}"]`).first(); }

  // ---------- today's log ----------

  todayLog() { return this.page.locator('#today-log-group'); }
  todayLogRows() { return this.page.locator('#today-log-rows .today-log-row'); }
}

export const test = base.extend({
  tracker: async ({ page, context }, use, testInfo) => {
    const blockedRequests = [];
    await guardOtherUsers(context, blockedRequests);
    const tracker = new TrackerPage(page, testInfo);
    tracker.blockedRequests = blockedRequests;
    await use(tracker);
    try { await tracker.waitForSyncIdle({ timeout: 8000 }); } catch (error) { /* scenario left ops pending on purpose */ }
    await context.route(isWorkerRequest, route => route.abort());
    if (!tracker.allowPageErrors) expect(tracker.pageErrors, 'uncaught exceptions thrown inside the page').toEqual([]);
    if (!tracker.allowOtherUsers) expect(blockedRequests, 'requests for a user other than test').toEqual([]);
  },
});
