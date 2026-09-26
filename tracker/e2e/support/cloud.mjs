// Cloud access for the end-to-end suite. Every scenario runs against the
// real Cloudflare Worker with the disposable `test` user. This module is the
// ONLY place that writes cloud state, and it refuses to write anything but
// the test user's own gist.

import { createHash, randomUUID } from 'node:crypto';

export const WORKER_ORIGIN = 'https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev';
export const TEST_USER = 'test';
// The gist the Worker must map ?user=test to. Checked before the first write
// of every run so a mis-mapped Worker can never point the suite at lg's data.
export const TEST_GIST_ID = '4da0464ca688d5308e121cf1e8c0cace';
const GIST_FILE = 'tracker-state.json';

const sleep = (ms) => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

let verifiedGistIdentity = false;
let lastWrite = null; // { seedHash, fixtureId, savedAt }

async function fetchWithRetry(url, init, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      // GitHub secondary rate limits surface as 403/429 through the Worker.
      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        lastError = new Error(`${init && init.method || 'GET'} ${url} -> HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
        await sleep(5000 * Math.pow(2, attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      await sleep(2000 * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

async function readTestUserWrapper() {
  const response = await fetchWithRetry(`${WORKER_ORIGIN}/state?user=${TEST_USER}&e2e=${Date.now()}`, { method: 'GET' });
  if (!response.ok) throw new Error(`GET /state?user=test -> HTTP ${response.status}`);
  const gist = await response.json();
  const file = gist.files && gist.files[GIST_FILE];
  const wrapper = file && typeof file.content === 'string' && file.content.trim() ? JSON.parse(file.content) : null;
  return { gist, wrapper, version: response.headers.get('X-Gist-Version') };
}

async function assertTestGistIdentity() {
  if (verifiedGistIdentity) return;
  const { gist } = await readTestUserWrapper();
  if (gist.id !== TEST_GIST_ID) {
    throw new Error(`Refusing to write: the Worker maps ?user=test to gist ${gist.id}, expected ${TEST_GIST_ID}.`);
  }
  verifiedGistIdentity = true;
}

function hashOf(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Replace the test user's cloud state with `state` and wait until the Worker
// serves it back. Skips the write when the gist still holds exactly this
// seed untouched since the previous scenario wrote it (no ops landed), which
// keeps GitHub's content-creation rate limits out of reach on long runs.
export async function writeTestUserState(state) {
  await assertTestGistIdentity();
  const seedHash = hashOf(state);
  if (lastWrite && lastWrite.seedHash === seedHash) {
    const { wrapper } = await readTestUserWrapper();
    if (wrapper && wrapper._e2eFixture === lastWrite.fixtureId && wrapper._savedAt === lastWrite.savedAt) {
      return { skipped: true, fixtureId: lastWrite.fixtureId };
    }
  }
  const fixtureId = randomUUID();
  const savedAt = new Date().toISOString();
  const body = JSON.stringify({ state, _savedAt: savedAt, _e2eFixture: fixtureId });
  const response = await fetchWithRetry(`${WORKER_ORIGIN}/state?user=${TEST_USER}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok) throw new Error(`POST /state?user=test -> HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const { wrapper } = await readTestUserWrapper();
    if (wrapper && wrapper._e2eFixture === fixtureId) {
      lastWrite = { seedHash, fixtureId, savedAt };
      return { skipped: false, fixtureId };
    }
    await sleep(400);
  }
  throw new Error('The Worker did not serve the freshly written test-user state within 20 s.');
}

export async function readTestUserState() {
  const { wrapper, version } = await readTestUserWrapper();
  return { state: (wrapper && wrapper.state) || {}, savedAt: wrapper && wrapper._savedAt, version };
}

// Poll the cloud until `predicate(state)` holds. Returns the matching state.
export async function waitForCloudState(predicate, { timeout = 20000, message = 'cloud state never matched' } = {}) {
  const deadline = Date.now() + timeout;
  let lastState;
  while (Date.now() < deadline) {
    const { state } = await readTestUserState();
    lastState = state;
    try {
      if (predicate(state)) return state;
    } catch (error) {
      // predicate threw on a partial state; keep polling
    }
    await sleep(750);
  }
  const error = new Error(message);
  error.lastState = lastState;
  throw error;
}
