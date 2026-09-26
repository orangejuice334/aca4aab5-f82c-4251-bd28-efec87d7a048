// Cloud access for the end-to-end suite, always as the disposable `test`
// user. This module is the ONLY place that writes cloud state, and it refuses
// to write anything but the test user's own gist.
//
// Two backends (E2E_BACKEND):
//   local (default) - the real Worker code runs in this Node process against
//                     a simulated GitHub gist (support/local-backend.mjs).
//                     No GitHub traffic, so scenarios can run in parallel.
//   live            - the deployed Cloudflare Worker and the real test gist,
//                     one scenario at a time, inside the GitHub write budget.

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKER_ORIGIN = 'https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev';
export const BACKEND = String(process.env.E2E_BACKEND || 'local').toLowerCase() === 'live' ? 'live' : 'local';

// ---- GitHub write budget ----
// GitHub allows 500 content-creating requests per hour per account, and the
// test user shares the Worker's GitHub token with lg's real tracker. Every
// seed and every page save is one gist PATCH, so the suite keeps a rolling
// one-hour log of its own writes (in a file, because Playwright restarts its
// worker process after a failure) and pauses before it would eat lg's share.
export const GIST_WRITES_PER_HOUR = Number(process.env.E2E_GIST_WRITES_PER_HOUR || 330);
const WRITE_LOG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.state', 'gist-write-log.json');
const HOUR_MS = 3600000;

function readWriteLog() {
  try {
    const stamps = JSON.parse(readFileSync(WRITE_LOG_PATH, 'utf8'));
    return Array.isArray(stamps) ? stamps.filter(stamp => typeof stamp === 'number') : [];
  } catch (error) {
    return [];
  }
}

export function recordGistWrites(count = 1) {
  if (BACKEND !== 'live') return;
  const now = Date.now();
  const stamps = readWriteLog().filter(stamp => now - stamp < HOUR_MS);
  for (let index = 0; index < count; index++) stamps.push(now);
  mkdirSync(dirname(WRITE_LOG_PATH), { recursive: true });
  writeFileSync(WRITE_LOG_PATH, JSON.stringify(stamps));
}

// Milliseconds to wait until `needed` more writes fit inside the rolling hour.
export function gistWriteBudgetWait(needed = 4) {
  if (BACKEND !== 'live') return 0;
  const now = Date.now();
  const stamps = readWriteLog().filter(stamp => now - stamp < HOUR_MS).sort((first, second) => first - second);
  const excess = stamps.length + needed - GIST_WRITES_PER_HOUR;
  if (excess <= 0) return 0;
  return stamps[Math.min(excess, stamps.length) - 1] + HOUR_MS - now + 1000;
}
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

let localBackendPromise = null;
function localBackend() {
  if (!localBackendPromise) {
    localBackendPromise = import('./local-backend.mjs').then(module => {
      module.configureLocalGist(TEST_GIST_ID);
      return module;
    });
  }
  return localBackendPromise;
}

// Call the Worker: in-process under the local backend, over HTTP when live.
async function workerFetch(pathAndQuery, init) {
  if (BACKEND === 'local') return (await localBackend()).localWorkerFetch(`${WORKER_ORIGIN}${pathAndQuery}`, init);
  return fetchWithRetry(`${WORKER_ORIGIN}${pathAndQuery}`, init);
}

// Playwright route handler that answers the page's Worker calls locally.
export async function fulfillFromLocalWorker(route) {
  return (await localBackend()).fulfillFromLocalWorker(route);
}

async function readTestUserWrapper() {
  const response = await workerFetch(`/state?user=${TEST_USER}&e2e=${Date.now()}`, { method: 'GET' });
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
  const response = await workerFetch(`/state?user=${TEST_USER}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok) throw new Error(`POST /state?user=test -> HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  recordGistWrites(1);
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