import { test, expect } from '../support/fixtures.mjs';
import { waitForCloudState } from '../support/cloud.mjs';
import { TODAY, logCounter } from '../support/seed.mjs';

// Cloud sync: every change is queued as a small op and flushed to the
// Worker, which applies it to the test user's gist with optimistic
// concurrency (412 when another writer got there first). These scenarios
// cover reloads, lost connections, closing the tab, and two devices.

const isWorker = url => url.hostname.endsWith('.workers.dev');
const isWorkerWrite = url => isWorker(url) && url.pathname === '/ops';
const offlineBanner = page => page.locator('#readonly-banner');
const chickenCount = tracker => tracker.counterInput('chicken_breast', 200);
const cloudCounter = (state, key) => (((state.days || {})[TODAY] || {}).counters || {})[key];

test.describe('Persistence', () => {
  test('a fresh visit shows what the cloud holds', async ({ tracker }) => {
    await tracker.open({ seed: state => logCounter(state, 'chicken_breast', 400, { at: '11:00' }) });
    await expect(chickenCount(tracker)).toHaveValue('2');
    await tracker.expectTotal('kcal', 660);
  });

  test('every kind of change survives a reload', async ({ tracker, page }) => {
    await tracker.open();
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await page.locator('#supplements-water-rows input[data-check="water_bottle#10:00"]').check();
    await page.locator('#checkout-weight').fill('88.4');
    await page.locator('#checkout-mood').fill('7');
    await page.locator('#profile-form [data-profile="goals.p"]').fill('190');
    await tracker.waitForSyncIdle();
    await tracker.reload();
    await expect(chickenCount(tracker)).toHaveValue('1');
    await expect(page.locator('#supplements-water-rows input[data-check="water_bottle#10:00"]')).toBeChecked();
    await expect(page.locator('#checkout-weight')).toHaveValue('88.4');
    await expect(page.locator('#checkout-mood')).toHaveValue('7');
    await expect(page.locator('#profile-form [data-profile="goals.p"]')).toHaveValue('190');
  });

  test('a change made just before closing the tab is not lost', async ({ tracker, page }) => {
    const users = new Set();
    page.on('request', request => {
      const url = new URL(request.url());
      if (isWorker(url)) users.add(url.searchParams.get('user'));
    });
    await tracker.open();
    // Drop the request guard for this page only: an intercepted keep-alive
    // beacon can be cancelled when its page goes away, which would fake a
    // loss. The user check the guard did is repeated at the end instead.
    await page.context().unrouteAll({ behavior: 'ignoreErrors' });
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await page.close({ runBeforeUnload: true }); // inside the 700 ms flush debounce
    await waitForCloudState(state => cloudCounter(state, 'chicken_breast') === 200, {
      timeout: 15000, message: 'the tap made right before closing never reached the cloud',
    });
    expect([...users]).toEqual(['test']);
  });

  test('the page only ever talks to the Worker as the test user', async ({ tracker, page }) => {
    const users = new Set();
    page.on('request', request => {
      const url = new URL(request.url());
      if (isWorker(url)) users.add(url.searchParams.get('user'));
    });
    await tracker.open();
    await tracker.plus('rice_cooked', { servingSize: 160 });
    await tracker.waitForSyncIdle();
    expect([...users]).toEqual(['test']);
  });
});

test.describe('Lost connection', () => {
  test('a change made while offline reaches the cloud by itself once the connection is back', async ({ tracker, page }) => {
    await tracker.open();
    await page.route(isWorkerWrite, route => route.abort());
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await expect(offlineBanner(page)).toBeVisible();
    await page.unroute(isWorkerWrite);
    await waitForCloudState(state => cloudCounter(state, 'chicken_breast') === 200, {
      timeout: 20000, message: 'nothing retried the queued change after the connection came back',
    });
  });

  test('the Offline banner goes away once saving works again', async ({ tracker, page }) => {
    await tracker.open();
    await page.route(isWorkerWrite, route => route.abort());
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await expect(offlineBanner(page)).toBeVisible();
    await page.unroute(isWorkerWrite);
    await tracker.plus('rice_cooked', { servingSize: 160 }); // triggers a flush that now succeeds
    await tracker.waitForSyncIdle();
    await expect(page.locator('#sync-status')).toHaveText('saved');
    await expect(offlineBanner(page), 'saving works again, so the page is not offline').toBeHidden();
  });

  test('reloading while the cloud is unreachable shows the cached day and the Offline banner', async ({ tracker, page }) => {
    await tracker.open();
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await tracker.waitForSyncIdle();
    await page.route(isWorker, route => route.abort());
    await page.reload();
    await expect(offlineBanner(page)).toBeVisible();
    await expect(page.locator('#readonly-banner-title')).toHaveText('Offline mode');
    await expect(chickenCount(tracker)).toHaveValue('1');
  });

  test('Retry reconnects and keeps what was logged while offline', async ({ tracker, page }) => {
    await tracker.open();
    await page.route(isWorker, route => route.abort());
    await page.reload();
    await expect(offlineBanner(page)).toBeVisible();
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await page.unroute(isWorker);
    await page.locator('#readonly-banner-retry').click();
    await expect(offlineBanner(page)).toBeHidden();
    await expect(chickenCount(tracker), 'the offline tap is still on screen after Retry').toHaveValue('1');
    await waitForCloudState(state => cloudCounter(state, 'chicken_breast') === 200, {
      timeout: 15000, message: 'the offline tap never reached the cloud after Retry',
    });
  });

  test('a change made while saving fails is still there after a reload and reaches the cloud', async ({ tracker, page }) => {
    await tracker.open();
    await page.route(isWorkerWrite, route => route.abort());
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await expect(offlineBanner(page)).toBeVisible();
    await page.reload();
    await tracker.waitForLoaded();
    await expect(chickenCount(tracker), 'the unsaved tap is still on screen after the reload').toHaveValue('1');
    await page.unroute(isWorkerWrite);
    await waitForCloudState(state => cloudCounter(state, 'chicken_breast') === 200, {
      timeout: 20000, message: 'the unsaved tap was dropped instead of being sent later',
    });
  });
});

test.describe('Two devices', () => {
  // Device A taps first; device B, still holding the older gist version, taps
  // second, gets a 412, re-syncs and retries.
  async function tapOnBothDevices(tracker, browser) {
    await tracker.open();
    const second = await tracker.openSecondDevice(browser);
    await tracker.plus('chicken_breast', { servingSize: 200 });
    await tracker.waitForSyncIdle();
    await second.plus('rice_cooked', { servingSize: 160 });
    await second.waitForSyncIdle({ timeout: 30000 });
    return second;
  }

  test('changes from both devices end up in the cloud', async ({ tracker, browser }) => {
    const second = await tapOnBothDevices(tracker, browser);
    try {
      const state = await waitForCloudState(current => cloudCounter(current, 'chicken_breast') === 200 && cloudCounter(current, 'rice_cooked') === 160, {
        timeout: 15000, message: 'one device overwrote the other',
      });
      expect(cloudCounter(state, 'rice_cooked')).toBe(160);
      expect(second.pageErrors).toEqual([]);
    } finally {
      await second.context.close();
    }
  });

  test('the second device still shows its own change after the conflict', async ({ tracker, browser }) => {
    const second = await tapOnBothDevices(tracker, browser);
    try {
      await expect(second.counterInput('chicken_breast', 200), "device A's tap was pulled in").toHaveValue('1');
      await expect(second.counterInput('rice_cooked', 160), "device B's own tap is still on its screen").toHaveValue('1');
    } finally {
      await second.context.close();
    }
  });

  test("a later save on the second device does not wipe that device's earlier change", async ({ tracker, browser }) => {
    const second = await tapOnBothDevices(tracker, browser);
    try {
      await second.page.locator('#sort-toggle').click(); // any full-state save
      await second.waitForSyncIdle();
      const state = await waitForCloudState(current => current.sortMode === 'alpha', { timeout: 15000 });
      expect(cloudCounter(state, 'rice_cooked'), 'the rice tap survives the later save').toBe(160);
    } finally {
      await second.context.close();
    }
  });

  test("an idle device opening and closing an item does not undo another device's edit", async ({ tracker, browser }) => {
    await tracker.open();
    const second = await tracker.openSecondDevice(browser);
    try {
      const panel = await tracker.openEditPanel('chicken_breast');
      await panel.locator('[data-edit-field="brand"]').fill('Kirkland');
      await tracker.closeEditPanel('chicken_breast');
      await tracker.waitForSyncIdle();
      await second.openEditPanel('chicken_breast');
      await second.closeEditPanel('chicken_breast');
      await second.waitForSyncIdle({ timeout: 30000 });
      const state = await waitForCloudState(() => true, { timeout: 5000 });
      expect(state.userCatalog.items.chicken_breast.brand, "device A's brand edit survives").toBe('Kirkland');
    } finally {
      await second.context.close();
    }
  });
});
