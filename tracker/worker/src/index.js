const USERS = {
  lg: {
    gistId: 'f4fa252abfc508ed57c7af26cd7399bb',
    requireAuth: false,
  },
  eg: {
    gistId: 'e6ba2e8a43359c092f0deff9a76582a0',
    requireAuth: false,
  },
};

const GIST_FILE = 'tracker-state.json';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-Match',
  'Access-Control-Expose-Headers': 'X-Gist-Version',
  'Access-Control-Max-Age': '86400',
};

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function userConfigFor(rawUser) {
  if (!rawUser) return { error: 'missing ?user= query param' };
  const cfg = USERS[rawUser];
  if (!cfg) return { error: 'unknown user: ' + rawUser };
  return { cfg, user: rawUser };
}

// ============ OP DISPATCH ============
// Each handler mutates `state` in place. Returns { ok: true } on success or
// { ok: false, error: '...' } on validation failure. Throwing is also caught.
// applyOps continues after individual failures and reports them per-index.

function ensureDay(state, date) {
  if (!date || typeof date !== 'string') throw new Error('op missing date');
  if (!state.days) state.days = {};
  let d = state.days[date];
  if (!d) {
    d = state.days[date] = { toggles: {}, counters: {}, customs: [], toggleMeta: {}, counterMeta: {} };
  } else {
    if (!d.toggles) d.toggles = {};
    if (!d.counters) d.counters = {};
    if (!d.customs) d.customs = [];
    if (!d.toggleMeta) d.toggleMeta = {};
    if (!d.counterMeta) d.counterMeta = {};
  }
  return d;
}

// Deep-merge plain object `src` into `dst` in place. Arrays + primitives
// overwrite; nested plain objects recurse. Used by profile_update so
// `{goals: {fatPercent: 15}}` doesn't clobber the rest of `goals`.
function deepMerge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
      deepMerge(dst[k], v);
    } else {
      dst[k] = v;
    }
  }
}

function maybeWriteRecipeSnapshot(day, op) {
  if (!op || !op.recipeSnapshot || !op.key) return;
  if (!day.recipeSnapshots) day.recipeSnapshots = {};
  day.recipeSnapshots[op.key] = op.recipeSnapshot;
}

const OPS = {
  counter_inc(state, op) {
    if (!op.key) return { ok: false, error: 'counter_inc requires key' };
    const day = ensureDay(state, op.date);
    // counters are stored in the item's native unit (g for mass items, ml for
    // volume); op.servingSize carries the variant's serving size in that unit
    // so one click adds the right amount (340 g for "1/2 tub" vs 170 g for
    // "1/4 tub"). Default to 1 when missing.
    const inc = (typeof op.servingSize === 'number' && op.servingSize > 0) ? op.servingSize : 1;
    day.counters[op.key] = Math.round(((day.counters[op.key] || 0) + inc) * 10000) / 10000;
    if (op.ts) day.counterMeta[op.key] = op.ts;
    maybeWriteRecipeSnapshot(day, op);
    return { ok: true };
  },
  counter_dec(state, op) {
    if (!op.key) return { ok: false, error: 'counter_dec requires key' };
    const day = ensureDay(state, op.date);
    const dec = (typeof op.servingSize === 'number' && op.servingSize > 0) ? op.servingSize : 1;
    day.counters[op.key] = Math.max(0, Math.round(((day.counters[op.key] || 0) - dec) * 10000) / 10000);
    if (op.ts) day.counterMeta[op.key] = op.ts;
    maybeWriteRecipeSnapshot(day, op);
    return { ok: true };
  },
  counter_set(state, op) {
    if (!op.key) return { ok: false, error: 'counter_set requires key' };
    if (typeof op.value !== 'number' || !Number.isFinite(op.value)) {
      return { ok: false, error: 'counter_set requires numeric value' };
    }
    const day = ensureDay(state, op.date);
    day.counters[op.key] = Math.max(0, op.value);
    if (op.ts) day.counterMeta[op.key] = op.ts;
    maybeWriteRecipeSnapshot(day, op);
    return { ok: true };
  },
  // Refresh a recipe snapshot for a specific day without changing the
  // counter. Used when the user edits a non-preserve recipe ON the day it
  // was logged — the snapshot tracks the latest definition for that day's
  // historical view. The client only emits this for the current activeDate;
  // past-day snapshots stay frozen.
  recipe_snapshot_set(state, op) {
    if (!op.key) return { ok: false, error: 'recipe_snapshot_set requires key' };
    if (!op.recipe || typeof op.recipe !== 'object') {
      return { ok: false, error: 'recipe_snapshot_set requires recipe object' };
    }
    const day = ensureDay(state, op.date);
    if (!day.recipeSnapshots) day.recipeSnapshots = {};
    day.recipeSnapshots[op.key] = op.recipe;
    return { ok: true };
  },
  recipe_snapshot_clear(state, op) {
    if (!op.key) return { ok: false, error: 'recipe_snapshot_clear requires key' };
    const day = ensureDay(state, op.date);
    if (day.recipeSnapshots) delete day.recipeSnapshots[op.key];
    return { ok: true };
  },
  toggle_set(state, op) {
    if (!op.key) return { ok: false, error: 'toggle_set requires key' };
    const day = ensureDay(state, op.date);
    day.toggles[op.key] = !!op.value;
    if (op.ts) day.toggleMeta[op.key] = op.ts;
    return { ok: true };
  },
  toggle_unset(state, op) {
    if (!op.key) return { ok: false, error: 'toggle_unset requires key' };
    const day = ensureDay(state, op.date);
    delete day.toggles[op.key];
    delete day.toggleMeta[op.key];
    return { ok: true };
  },
  custom_add(state, op) {
    if (!op.item || !op.item.id || !op.item.name) {
      return { ok: false, error: 'custom_add requires item with id and name' };
    }
    const day = ensureDay(state, op.date);
    if (day.customs.some(c => c.id === op.item.id)) return { ok: true }; // idempotent
    const c = { ...op.item };
    if (c.count === undefined) c.count = 1;
    if (!c.lastModified && op.ts) c.lastModified = op.ts;
    day.customs.push(c);
    return { ok: true };
  },
  custom_inc(state, op) {
    if (!op.id) return { ok: false, error: 'custom_inc requires id' };
    const day = ensureDay(state, op.date);
    const c = day.customs.find(x => x.id === op.id);
    if (!c) return { ok: false, error: 'custom_inc: unknown id ' + op.id };
    c.count = (c.count || 1) + 1;
    if (op.ts) c.lastModified = op.ts;
    return { ok: true };
  },
  custom_dec(state, op) {
    if (!op.id) return { ok: false, error: 'custom_dec requires id' };
    const day = ensureDay(state, op.date);
    const c = day.customs.find(x => x.id === op.id);
    if (!c) return { ok: false, error: 'custom_dec: unknown id ' + op.id };
    c.count = Math.max(0, (c.count || 1) - 1);
    if (op.ts) c.lastModified = op.ts;
    return { ok: true };
  },
  custom_remove(state, op) {
    if (!op.id) return { ok: false, error: 'custom_remove requires id' };
    const day = ensureDay(state, op.date);
    const i = day.customs.findIndex(x => x.id === op.id);
    if (i < 0) return { ok: true }; // idempotent
    day.customs.splice(i, 1);
    return { ok: true };
  },
  custom_set(state, op) {
    if (!op.id) return { ok: false, error: 'custom_set requires id' };
    if (typeof op.count !== 'number' || !Number.isFinite(op.count)) {
      return { ok: false, error: 'custom_set requires numeric count' };
    }
    const day = ensureDay(state, op.date);
    const c = day.customs.find(x => x.id === op.id);
    if (!c) return { ok: false, error: 'custom_set: unknown id ' + op.id };
    c.count = Math.max(0, op.count);
    if (op.ts) c.lastModified = op.ts;
    return { ok: true };
  },
  weight_set(state, op) {
    if (typeof op.value !== 'number' || !Number.isFinite(op.value)) {
      return { ok: false, error: 'weight_set requires numeric value' };
    }
    const day = ensureDay(state, op.date);
    day.weight = op.value;
    if (op.ts) day.weightMeta = op.ts;
    return { ok: true };
  },
  weight_clear(state, op) {
    if (!op.date) return { ok: false, error: 'weight_clear requires date' };
    const day = ensureDay(state, op.date);
    delete day.weight;
    delete day.weightMeta;
    return { ok: true };
  },
  neck_set(state, op) {
    if (typeof op.value !== 'number' || !Number.isFinite(op.value)) {
      return { ok: false, error: 'neck_set requires numeric value' };
    }
    const day = ensureDay(state, op.date);
    day.neck = op.value;
    if (op.ts) day.neckMeta = op.ts;
    return { ok: true };
  },
  neck_clear(state, op) {
    if (!op.date) return { ok: false, error: 'neck_clear requires date' };
    const day = ensureDay(state, op.date);
    delete day.neck;
    delete day.neckMeta;
    return { ok: true };
  },
  waist_set(state, op) {
    if (typeof op.value !== 'number' || !Number.isFinite(op.value)) {
      return { ok: false, error: 'waist_set requires numeric value' };
    }
    const day = ensureDay(state, op.date);
    day.waist = op.value;
    if (op.ts) day.waistMeta = op.ts;
    return { ok: true };
  },
  waist_clear(state, op) {
    if (!op.date) return { ok: false, error: 'waist_clear requires date' };
    const day = ensureDay(state, op.date);
    delete day.waist;
    delete day.waistMeta;
    return { ok: true };
  },
  mood_set(state, op) {
    if (typeof op.value !== 'number' || !Number.isFinite(op.value)) {
      return { ok: false, error: 'mood_set requires numeric value' };
    }
    const day = ensureDay(state, op.date);
    day.mood = op.value;
    if (op.ts) day.moodMeta = op.ts;
    return { ok: true };
  },
  mood_clear(state, op) {
    if (!op.date) return { ok: false, error: 'mood_clear requires date' };
    const day = ensureDay(state, op.date);
    delete day.mood;
    delete day.moodMeta;
    return { ok: true };
  },
  day_delete(state, op) {
    if (!op.date) return { ok: false, error: 'day_delete requires date' };
    if (state.days && state.days[op.date]) delete state.days[op.date];
    return { ok: true };
  },
  catalog_add(state, op) {
    if (!op.key || !op.item) return { ok: false, error: 'catalog_add requires key and item' };
    if (!state.userCatalog) state.userCatalog = { items: {}, categories: [] };
    if (!state.userCatalog.items) state.userCatalog.items = {};
    state.userCatalog.items[op.key] = op.item;
    return { ok: true };
  },
  catalog_edit(state, op) {
    if (!op.key) return { ok: false, error: 'catalog_edit requires key' };
    if (!state.userCatalog || !state.userCatalog.items || !state.userCatalog.items[op.key]) {
      return { ok: false, error: 'catalog_edit: unknown key ' + op.key };
    }
    Object.assign(state.userCatalog.items[op.key], op.fields || {});
    return { ok: true };
  },
  catalog_delete(state, op) {
    if (!op.key) return { ok: false, error: 'catalog_delete requires key' };
    if (!state.userCatalog || !state.userCatalog.items || !state.userCatalog.items[op.key]) {
      return { ok: true }; // idempotent
    }
    delete state.userCatalog.items[op.key];
    return { ok: true };
  },
  catalog_categories_set(state, op) {
    if (!Array.isArray(op.categories)) {
      return { ok: false, error: 'catalog_categories_set requires categories array' };
    }
    if (!state.userCatalog) state.userCatalog = { items: {}, categories: [] };
    state.userCatalog.categories = op.categories;
    return { ok: true };
  },
  saved_item_add(state, op) {
    if (!op.item || !op.item.key) return { ok: false, error: 'saved_item_add requires item with key' };
    if (!Array.isArray(state.savedItems)) state.savedItems = [];
    if (state.savedItems.some(s => s.key === op.item.key)) return { ok: true }; // idempotent
    state.savedItems.push(op.item);
    return { ok: true };
  },
  saved_item_remove(state, op) {
    if (!op.key) return { ok: false, error: 'saved_item_remove requires key' };
    if (!Array.isArray(state.savedItems)) return { ok: true };
    state.savedItems = state.savedItems.filter(s => s.key !== op.key);
    return { ok: true };
  },
  profile_update(state, op) {
    if (!op.fields || typeof op.fields !== 'object') {
      return { ok: false, error: 'profile_update requires fields object' };
    }
    if (!state.profile) state.profile = {};
    // Deep merge so nested objects (notably `goals`) aren't clobbered when
    // a partial update arrives.
    deepMerge(state.profile, op.fields);
    return { ok: true };
  },
  sort_mode_set(state, op) {
    if (typeof op.value !== 'string') return { ok: false, error: 'sort_mode_set requires string value' };
    state.sortMode = op.value;
    return { ok: true };
  },
  totals_mode_set(state, op) {
    // op.value is one of: 'defaults' (undefined cleared), 'all', 'collapsed'.
    // Passing null/undefined clears the field so the in-memory default applies.
    if (op.value === null || op.value === undefined || op.value === 'defaults') {
      delete state.totalsMode;
    } else if (typeof op.value === 'string') {
      state.totalsMode = op.value;
    } else {
      return { ok: false, error: 'totals_mode_set requires string value or null' };
    }
    return { ok: true };
  },
  collapsed_group_set(state, op) {
    if (!op.key) return { ok: false, error: 'collapsed_group_set requires key' };
    if (!state.collapsedGroups) state.collapsedGroups = {};
    if (op.collapsed) state.collapsedGroups[op.key] = true;
    else delete state.collapsedGroups[op.key];
    return { ok: true };
  },
};

function applyOps(state, ops) {
  const errors = [];
  let applied = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op || typeof op.type !== 'string') {
      errors.push({ index: i, op: '?', reason: 'op missing type' });
      continue;
    }
    const handler = OPS[op.type];
    if (!handler) {
      errors.push({ index: i, op: op.type, reason: 'unknown op type' });
      continue;
    }
    try {
      const r = handler(state, op);
      if (r && r.ok) applied++;
      else errors.push({ index: i, op: op.type, reason: (r && r.error) || 'unknown failure' });
    } catch (e) {
      errors.push({ index: i, op: op.type, reason: e.message || String(e) });
    }
  }
  return { applied, errors };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname !== '/state' && url.pathname !== '/ops') {
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    const rawUser = url.searchParams.get('user');
    const resolved = userConfigFor(rawUser);
    if (resolved.error) return jsonError(400, resolved.error);
    const { cfg } = resolved;

    if (cfg.requireAuth) {
      const auth = request.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) {
        return jsonError(401, 'authorization required');
      }
      // Stub: real token validation goes here in a later pass.
    }

    const gistApi = `https://api.github.com/gists/${cfg.gistId}`;
    const ghHeaders = {
      'Authorization': `Bearer ${env.GIST_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'lzm-tracker-worker',
    };

    // Gist version (history[0].version) is the optimistic-concurrency token.
    // Clients echo it back as If-Match on /ops; the worker rejects with 412
    // if it has moved since the client last read it. Exposed to the client
    // via the X-Gist-Version response header on /state GET and /ops POST.
    const gistVersion = (gist) => (gist && Array.isArray(gist.history) && gist.history[0] && gist.history[0].version) || '';

    if (url.pathname === '/state') {
      if (request.method === 'GET') {
        const r = await fetch(gistApi, { headers: ghHeaders });
        let bodyText = await r.text();
        let version = '';
        try { version = gistVersion(JSON.parse(bodyText)); } catch (e) {}
        const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
        if (version) headers['X-Gist-Version'] = version;
        return new Response(bodyText, { status: r.status, headers });
      }

      if (request.method === 'POST') {
        const stateJson = await request.text();
        const patchBody = JSON.stringify({
          files: { [GIST_FILE]: { content: stateJson } },
        });
        const r = await fetch(gistApi, {
          method: 'PATCH',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: patchBody,
        });
        let bodyText = await r.text();
        let version = '';
        try { version = gistVersion(JSON.parse(bodyText)); } catch (e) {}
        const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
        if (version) headers['X-Gist-Version'] = version;
        return new Response(bodyText, { status: r.status, headers });
      }

      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    // /ops — batch op apply. Single GET -> mutate -> PATCH per request.
    // Optional optimistic concurrency: client sends If-Match: <gist version>;
    // worker compares against the version it just read and returns 412 on
    // mismatch so the client can re-sync before retrying.
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonError(400, 'invalid JSON: ' + e.message);
    }
    if (!body || !Array.isArray(body.ops)) {
      return jsonError(400, 'expected { ops: [...] }');
    }
    if (body.ops.length === 0) {
      return jsonError(400, 'ops array is empty');
    }
    if (body.ops.length > 1000) {
      return jsonError(400, 'ops array too large (max 1000)');
    }

    const ifMatch = (request.headers.get('If-Match') || '').replace(/^"|"$/g, '').trim();

    const getRes = await fetch(gistApi, { headers: ghHeaders });
    if (!getRes.ok) {
      const txt = await getRes.text().catch(() => '');
      return jsonError(getRes.status, 'gist GET failed: ' + txt.slice(0, 200));
    }
    const gist = await getRes.json();
    const currentVersion = gistVersion(gist);

    if (ifMatch && currentVersion && ifMatch !== currentVersion) {
      const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
      if (currentVersion) headers['X-Gist-Version'] = currentVersion;
      return new Response(JSON.stringify({
        error: 'gist version moved',
        expected: ifMatch,
        current: currentVersion,
      }), { status: 412, headers });
    }

    const file = gist.files && gist.files[GIST_FILE];
    if (!file || typeof file.content !== 'string') {
      return jsonError(500, 'gist has no ' + GIST_FILE);
    }
    let wrapper;
    try {
      wrapper = JSON.parse(file.content);
    } catch (e) {
      return jsonError(500, 'gist content not valid JSON: ' + e.message);
    }
    if (!wrapper.state || typeof wrapper.state !== 'object') wrapper.state = {};

    const result = applyOps(wrapper.state, body.ops);
    wrapper._savedAt = new Date().toISOString();

    const patchRes = await fetch(gistApi, {
      method: 'PATCH',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: { [GIST_FILE]: { content: JSON.stringify(wrapper, null, 2) } },
      }),
    });
    if (!patchRes.ok) {
      const txt = await patchRes.text().catch(() => '');
      return jsonError(patchRes.status, 'gist PATCH failed: ' + txt.slice(0, 200));
    }
    let newVersion = '';
    try { newVersion = gistVersion(await patchRes.clone().json()); } catch (e) {}

    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (newVersion) headers['X-Gist-Version'] = newVersion;

    return new Response(JSON.stringify({
      ok: result.errors.length === 0,
      applied: result.applied,
      errors: result.errors,
      _savedAt: wrapper._savedAt,
      gistVersion: newVersion,
    }), {
      status: 200,
      headers,
    });
  },
};
