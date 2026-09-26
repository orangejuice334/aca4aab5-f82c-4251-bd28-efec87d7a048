// Local backend for the end-to-end suite (E2E_BACKEND=local, the default).
//
// The page's Worker calls are answered by the REAL Worker code
// (tracker/worker/src/index.js, imported from a verbatim copy because the
// tracker package is CommonJS) running in this Node process. Only the GitHub
// gist API behind it is simulated: one in-memory gist per Node process, with
// GitHub's version history (newest first), so the Worker's user routing,
// If-Match / 412 concurrency and op handlers all run unchanged.
//
// Nothing here talks to GitHub, so runs are fast, cannot hit GitHub's write
// limits (which lg's real tracker shares), and can run in parallel: every
// Playwright worker process has its own gist.

import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WORKER_SOURCE = resolve(here, '..', '..', 'worker', 'src', 'index.js');
const WORKER_COPY_DIRECTORY = resolve(here, '..', '.state');
const GIST_FILE = 'tracker-state.json';
const GIST_API_PREFIX = 'https://api.github.com/gists/';

// The only gist that exists locally is the test user's. Any other id (lg's)
// answers 404, so a routing mistake can never reach real data.
let localGistId = '';
const gists = new Map();

export function configureLocalGist(gistId) {
  localGistId = gistId;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function gistBody(id, gist) {
  return {
    id,
    public: false,
    owner: { login: 'orangejuice334' },
    updated_at: gist.updatedAt,
    files: { [GIST_FILE]: { filename: GIST_FILE, content: gist.content, truncated: false, size: gist.content.length } },
    history: gist.history.map(entry => ({ version: entry.version, committed_at: entry.committedAt, url: '' })),
  };
}

function newVersionEntry() {
  return { version: randomUUID().replace(/-/g, ''), committedAt: new Date().toISOString() };
}

function gistFor(id) {
  let gist = gists.get(id);
  if (!gist) {
    const created = newVersionEntry();
    gist = { content: JSON.stringify({ state: {}, _savedAt: created.committedAt }), history: [created], updatedAt: created.committedAt };
    gists.set(id, gist);
  }
  return gist;
}

async function simulatedGitHub(url, init = {}) {
  const id = url.slice(GIST_API_PREFIX.length).split(/[/?#]/)[0];
  if (!localGistId || id !== localGistId) return jsonResponse(404, { message: 'Not Found' });
  const gist = gistFor(id);
  const method = String(init.method || 'GET').toUpperCase();
  if (method === 'GET') return jsonResponse(200, gistBody(id, gist));
  if (method === 'PATCH') {
    const patch = JSON.parse(typeof init.body === 'string' ? init.body : Buffer.from(init.body).toString('utf8'));
    const file = patch.files && patch.files[GIST_FILE];
    if (file && typeof file.content === 'string') gist.content = file.content;
    const entry = newVersionEntry();
    gist.history.unshift(entry);
    gist.updatedAt = entry.committedAt;
    return jsonResponse(200, gistBody(id, gist));
  }
  return jsonResponse(405, { message: 'Method Not Allowed' });
}

// The Worker calls the global fetch for api.github.com; everything else
// (the suite's own calls to the deployed Worker, for example) goes out as usual.
const networkFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  if (url.startsWith(GIST_API_PREFIX)) return simulatedGitHub(url, init || {});
  return networkFetch(input, init);
};

let workerPromise = null;
function loadWorker() {
  if (!workerPromise) {
    const source = readFileSync(WORKER_SOURCE);
    const digest = createHash('sha256').update(source).digest('hex').slice(0, 16);
    const copyPath = resolve(WORKER_COPY_DIRECTORY, `worker-under-test-${digest}.mjs`);
    if (!existsSync(copyPath)) {
      mkdirSync(WORKER_COPY_DIRECTORY, { recursive: true });
      copyFileSync(WORKER_SOURCE, copyPath);
    }
    workerPromise = import(pathToFileURL(copyPath).href).then(module => module.default);
  }
  return workerPromise;
}

// Run one request through the real Worker code.
export async function localWorkerFetch(url, init = {}) {
  const worker = await loadWorker();
  return worker.fetch(new Request(url, init), { GIST_TOKEN: 'local-e2e-no-token' });
}

// Run a page request (a Playwright Request) through the local Worker.
export async function localWorkerResponseFor(request) {
  const init = { method: request.method(), headers: {} };
  for (const [name, value] of Object.entries(request.headers())) {
    if (['content-type', 'if-match', 'authorization'].includes(name.toLowerCase())) init.headers[name] = value;
  }
  const body = request.postDataBuffer();
  if (body && !['GET', 'HEAD'].includes(init.method)) init.body = body;
  return localWorkerFetch(request.url(), init);
}

// Playwright route handler: answer a page request from the local Worker.
export async function fulfillFromLocalWorker(route) {
  const response = await localWorkerResponseFor(route.request());
  const headers = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  const responseBody = Buffer.from(await response.arrayBuffer());
  try {
    await route.fulfill({ status: response.status, headers, body: responseBody });
  } catch (error) {
    // The page closed while the request was in flight (a beacon sent on
    // unload, for example). The Worker already applied it; nobody is left
    // to read the answer.
  }
}