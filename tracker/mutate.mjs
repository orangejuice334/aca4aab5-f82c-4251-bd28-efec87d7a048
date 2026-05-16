#!/usr/bin/env node
// Direct catalog mutation via the tracker Worker's /ops endpoint.
// Usage:
//   node mutate.mjs <op> <json-payload>            (defaults to user=lg)
//   node mutate.mjs <user> <op> <json-payload>
//
// Ops map 1:1 onto Worker op types (atomic per-op, no full-state overwrite):
//   addItem     payload = full item: { key, name, category, kcal, ..., [ingredients] }
//                         → catalog_add { key, item }
//   editItem    payload = partial:   { key, ...fields-to-merge }
//                         → catalog_edit { key, fields }
//   deleteItem  payload = { key }
//                         → catalog_delete { key }
//   catalogPart payload = { items: { key: {...}, ... }, categories?: [...] }
//                         → catalog_add per key + catalog_categories_set if categories supplied
//
// Flow: build ops → POST /ops → Worker fetches gist + applies ops + writes back.
// mutate.mjs writes are immune to concurrent tracker-app overwrites of
// unrelated state because the Worker only mutates the keys named in the ops.

const WORKER_BASE = 'https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev';
const KNOWN_USERS = new Set(['lg', 'eg']);

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 2) usageExit();
  let user = 'lg', op, payloadStr;
  if (KNOWN_USERS.has(args[0])) {
    if (args.length < 3) usageExit();
    [user, op, payloadStr] = args;
  } else {
    [op, payloadStr] = args;
  }
  let payload;
  try { payload = JSON.parse(payloadStr); }
  catch (e) { die('payload is not valid JSON: ' + e.message); }
  return { user, op, payload };
}

function usageExit() {
  console.error('usage: node mutate.mjs [user] <op> <json-payload>');
  console.error('  ops: addItem | editItem | deleteItem | catalogPart');
  process.exit(2);
}

function die(msg) { console.error('error: ' + msg); process.exit(1); }

// Build the Worker op list for each high-level CLI op.
const OP_BUILDERS = {
  addItem(payload) {
    if (!payload.key || !payload.name || payload.category === undefined) {
      die('addItem requires key, name, category');
    }
    const { key, ...item } = payload;
    return {
      ops: [{ type: 'catalog_add', key, item }],
      summary: `Added/updated ${item.name} (${key})`,
    };
  },
  editItem(payload) {
    if (!payload.key) die('editItem requires key');
    const { key, ...fields } = payload;
    return {
      ops: [{ type: 'catalog_edit', key, fields }],
      summary: `Edited ${key} (${Object.keys(fields).join(', ') || 'no fields'})`,
    };
  },
  deleteItem(payload) {
    if (!payload.key) die('deleteItem requires key');
    return {
      ops: [{ type: 'catalog_delete', key: payload.key }],
      summary: `Removed ${payload.key}`,
    };
  },
  catalogPart(payload) {
    const ops = [];
    const items = payload.items || {};
    const keys = Object.keys(items);
    for (const k of keys) {
      ops.push({ type: 'catalog_add', key: k, item: items[k] });
    }
    if (Array.isArray(payload.categories)) {
      ops.push({ type: 'catalog_categories_set', categories: payload.categories });
    }
    if (!ops.length) die('catalogPart payload has neither items nor categories');
    const catsMsg = Array.isArray(payload.categories) ? `, ${payload.categories.length} categories set` : '';
    return {
      ops,
      summary: `Upserted ${keys.length} items (${keys.slice(0, 6).join(', ')}${keys.length > 6 ? '…' : ''})${catsMsg}`,
    };
  },
};

async function sendOps(user, ops) {
  const res = await fetch(`${WORKER_BASE}/ops?user=${encodeURIComponent(user)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops }),
  });
  const text = await res.text();
  if (!res.ok) die(`POST /ops failed: HTTP ${res.status} ${res.statusText}\n${text.slice(0, 500)}`);
  let body;
  try { body = JSON.parse(text); } catch (e) { die('non-JSON /ops response: ' + text.slice(0, 200)); }
  if (!body.ok) {
    die('ops applied with errors: ' + JSON.stringify(body.errors));
  }
  return body;
}

async function fetchItemCount(user) {
  const res = await fetch(`${WORKER_BASE}/state?user=${encodeURIComponent(user)}`);
  if (!res.ok) return null;
  try {
    const gist = await res.json();
    const file = gist.files && gist.files['tracker-state.json'];
    if (!file || typeof file.content !== 'string') return null;
    const wrapper = JSON.parse(file.content);
    return Object.keys((wrapper.state && wrapper.state.userCatalog && wrapper.state.userCatalog.items) || {}).length;
  } catch (e) { return null; }
}

async function main() {
  const { user, op, payload } = parseArgs(process.argv);
  const builder = OP_BUILDERS[op];
  if (!builder) die('unknown op: ' + op);

  const before = await fetchItemCount(user);
  const { ops, summary } = builder(payload);
  const result = await sendOps(user, ops);
  const after = await fetchItemCount(user);

  console.log(`OK ${user}: ${summary}`);
  console.log(`items: ${before ?? '?'} -> ${after ?? '?'}, _savedAt=${result._savedAt}`);
}

main().catch(e => die(e.stack || String(e)));
