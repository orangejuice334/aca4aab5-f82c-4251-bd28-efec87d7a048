import { test, expect } from '../support/fixtures.mjs';
import { TEST_GIST_ID, WORKER_ORIGIN } from '../support/cloud.mjs';
import { baselineState, FIXED_NOON } from '../support/seed.mjs';

// Users: only `lg` (real data) and `test` (this suite's fixture data) exist.
// ?user=test selects the test user, a bare URL defaults to lg, and any other
// explicit user is refused before a single request is made. lg's real data
// is never contacted: the bare-URL scenario answers the page from a fake.

const STORAGE_PREFIX = '19ff6f4d-3d5b-40e6-88e2-573f647f903f';
const isWorker = url => url.hostname.endsWith('.workers.dev');

function recordWorkerRequests(page) {
  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (isWorker(url)) requests.push(`${request.method()} ${url.pathname}?user=${url.searchParams.get('user')}`);
  });
  return requests;
}

function fakeGistResponse(state) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: {
      'X-Gist-Version': 'fake-version-1',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-Gist-Version',
    },
    body: JSON.stringify({
      id: 'fake-lg-gist',
      history: [{ version: 'fake-version-1', url: '' }],
      files: { 'tracker-state.json': { content: JSON.stringify({ state, _savedAt: new Date(FIXED_NOON).toISOString() }) } },
    }),
  };
}

test.describe('Users and routing', () => {
  test('?user=test opens the test user', async ({ tracker, page }) => {
    await tracker.open();
    await expect(page).toHaveTitle('Test Tracker');
    await expect(page.locator('#page-h1')).toHaveText('Test Tracker');
    await expect(page.locator('#page-version')).toHaveText(/ · test$/);
  });

  for (const user of ['eg', 'nobody', 'LG', '']) {
    // `tracker` is requested only for its guard and page-error checks.
    test(`?user=${user || '(empty)'} is refused before anything loads`, async ({ tracker, page }) => {
      const requests = recordWorkerRequests(page);
      await page.goto(`track.html?user=${encodeURIComponent(user)}`);
      await expect(page.locator('h1')).toHaveText('Tracker requires a user');
      await expect(page.locator('#catalog-groups')).toHaveCount(0);
      expect(requests).toEqual([]);
    });
  }

  test('the Worker refuses the removed eg user', async () => {
    const response = await fetch(`${WORKER_ORIGIN}/state?user=eg`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unknown user: eg' });
  });

  test('the Worker maps the test user to its own gist', async () => {
    const response = await fetch(`${WORKER_ORIGIN}/state?user=test&e2e=${Date.now()}`);
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(TEST_GIST_ID);
  });

  test("a bare URL defaults to lg, answered here by a fake so lg's data is never touched", async ({ tracker, page }) => {
    const fakeState = baselineState();
    fakeState.profile.displayName = 'Fake LG';
    const writes = [];
    await page.route(isWorker, async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname === '/state' && url.searchParams.get('user') === 'lg') {
        await route.fulfill(fakeGistResponse(fakeState));
        return;
      }
      writes.push(`${request.method()} ${url.pathname}?${url.searchParams}`);
      await route.abort();
    });
    await page.clock.install({ time: FIXED_NOON });
    await page.goto('track.html');
    await tracker.waitForLoaded();
    await expect(page).toHaveTitle('Fake LG Tracker');
    await expect(page.locator('#page-version')).toHaveText(/ · lg$/);
    await expect(tracker.row('chicken_breast')).toBeVisible();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain(`${STORAGE_PREFIX}-state-lg`);
    expect(keys).not.toContain(`${STORAGE_PREFIX}-state-test`);
    expect(writes, 'a plain page load must not write anything').toEqual([]);
  });

  test('each user keeps its own local cache', async ({ tracker, page }) => {
    await tracker.open();
    await tracker.plus('rice_cooked', { servingSize: 160 });
    await tracker.waitForSyncIdle();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain(`${STORAGE_PREFIX}-state-test`);
    expect(keys.filter(key => key.endsWith('-lg'))).toEqual([]);
  });

  test('?demo=1 runs entirely offline', async ({ tracker, page }) => {
    const requests = recordWorkerRequests(page);
    await page.clock.install({ time: FIXED_NOON });
    await page.goto('track.html?demo=1');
    await expect(page.locator('#catalog-groups .checkout-row').first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(requests).toEqual([]);
  });
});
