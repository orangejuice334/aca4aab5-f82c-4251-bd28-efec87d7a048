Tracker sync architecture — handover

Layout. tracker/track.html is the entire app. tracker/worker/src/index.js is the Cloudflare Worker that fronts a GitHub gist holding tracker-state.json. tracker/mutate.mjs is a CLI for direct catalog edits.

Worker URL: https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev

No auth required. The Worker is intentionally open — the GitHub token for the backing gist lives in the Worker's env var, not in any request. Anyone with the URL can read and write. Threat model: throwaway gist account, history is rollback-able, leaks acceptable.

Before making any update, check the actual current date and time. Most ops carry a date field (YYYY-MM-DD) and an optional ts (ISO-8601 with timezone). Both must reflect the real wall-clock moment of the user's request — generate them at call time, never copy from older context, prior conversation, or a recent file in the repo. "Today" in a user message means the current calendar date in their timezone; "yesterday" means current minus one day. Mis-stamping ops sends entries to the wrong day, which silently corrupts kcal totals, weight series, and the history view. If you're unsure what time it is, ask the runtime — don't guess.

Endpoints:
- GET /state?user=lg — raw gist pass-through. Returns the gist API response; the tracker file is in gist.files['tracker-state.json'].content (a JSON string). Used for full load and item-count probes.
- POST /ops?user=lg — apply a batch of atomic ops. Body {ops:[...]}, max 1000 ops. The Worker fetches the gist, applies ops in order, writes the gist back. Response {ok, applied, errors:[{index,op,reason}], _savedAt}. Continues past individual op failures; only network/gist errors return non-2xx.
- POST /state?user=lg — full-state replace. Deprecated and unused by the tracker. Kept only as an emergency recovery path. Do not use for normal writes — it clobbers everything.

Op vocabulary. All ops live in the OPS table in worker/src/index.js. Each handler mutates state in place and returns {ok:true} or {ok:false, error}. ts is an optional ISO timestamp the handler stores in the matching *Meta field. date is YYYY-MM-DD. Day buckets are auto-created by ensureDay(state, op.date).

counter_inc {key, date, servingSize?, ts?}: counters[key] += servingSize ?? 1, rounded to 4dp. servingSize is the variant's native-unit serving (e.g. 340 for "1/2 tub" when the tub stores grams).
counter_dec {key, date, servingSize?, ts?}: counters[key] = max(0, counters[key] - (servingSize ?? 1)), rounded to 4dp.
counter_set {key, date, value, ts?}: counters[key] = max(0, value). Absolute set.

toggle_set {key, date, value, ts?}: toggles[key] = !!value.
toggle_unset {key, date}: delete toggles[key] and its meta entry. Used to scrub orphan toggles when a catalog item is deleted.

custom_add {date, item:{id, name, count?, ...}, ts?}: append the item to day.customs. Idempotent when item.id already exists in the day.
custom_inc {id, date, ts?}: custom.count += 1.
custom_dec {id, date, ts?}: custom.count = max(0, count - 1).
custom_set {id, date, count, ts?}: custom.count = max(0, count). Absolute set.
custom_remove {id, date}: remove by id; idempotent.

weight_set {date, value, ts?}: day.weight = value, day.weightMeta = ts.
weight_clear {date}: delete day.weight and day.weightMeta.

day_delete {date}: delete state.days[date].

catalog_add {key, item}: state.userCatalog.items[key] = item. Full replace of the item object — upsert.
catalog_edit {key, fields}: Object.assign(items[key], fields). Partial merge; fails if key is absent.
catalog_delete {key}: delete items[key]; idempotent.
catalog_categories_set {categories:[...]}: wholesale replace of userCatalog.categories.

saved_item_add {item:{key, ...}}: append to state.savedItems; idempotent when key already present.
saved_item_remove {key}: filter out by key.

profile_update {fields:{...}}: shallow merge into state.profile. Use this for any state.profile.* field including displayedNutrients and disabledWarnings.
sort_mode_set {value}: state.sortMode = value. Domain: 'category' | 'alpha' | 'ratio'.
totals_mode_set {value}: state.totalsMode = value. Domain: 'all' | 'collapsed', or null / 'defaults' to delete the field.
collapsed_group_set {key, collapsed:bool}: collapsedGroups[key] = true when collapsed, else delete the key. Keys look like 'totals-<id>', 'section-<id>', 'details-<id>', or a group's data-group-key.

How saves flow.

Hot-path mutations (per click — counters, toggles, weight, custom +/-, custom add/remove, saved-item add/remove, profile form): mutate state, call saveStateLocal() to persist to localStorage, then sendOp(...) to push one op onto the queue. sendOp schedules a debounced flushQueue (FLUSH_DEBOUNCE_MS = 700ms). flushQueue POSTs the batch to /ops and removes successfully-sent ops from the queue. Pending ops persist to localStorage between page loads so a kill-mid-flush survives.

Cold-path mutations (catalog edits, settings checklists, sort/totals/collapsed toggles, history-row deletes): mutate state, then call saveState(). saveState writes localStorage and calls emitDiffOps. emitDiffOps walks every category of state (catalog items, categories, days per-field, savedItems, profile, sortMode, totalsMode, collapsedGroups), compares against lastKnownGistState, and pushes one op per changed key. After emitting, it refreshes lastKnownGistState by calling captureSnapshot().

Snapshot lifecycle. lastKnownGistState is null until the first successful loadFromGist. applyRemotePayload sets it via captureSnapshot() after merging the remote payload into state. emitDiffOps refreshes it after each cold-path save. Hot-path sendOp does NOT update the snapshot, so the next cold-path saveState will see hot-path changes as a delta and emit redundant counter_set/toggle_set/etc ops. The Worker applies these idempotently — wasted bytes, no data corruption. If this ever becomes a hot spot, the fix is to mirror each op's effect into lastKnownGistState inside sendOp before queueing.

Sync status. scheduleQueueFlush sets 'pending' when ops are queued. flushQueue sets 'saving' during the in-flight POST, then 'ok' on success or 'error' on failure. There is no per-saveState status pulse — status follows the actual wire round-trip.

mutate.mjs. CLI for catalog edits from a terminal. Usage: node mutate.mjs [user] <op> <json-payload>. User defaults to lg. High-level ops map to Worker ops:
- addItem {key, name, category, ...other-fields} → catalog_add
- editItem {key, ...fields-to-merge} → catalog_edit
- deleteItem {key} → catalog_delete
- catalogPart {items:{key:{...}}, categories?:[...]} → one catalog_add per item plus catalog_categories_set if categories supplied

Adding a new op.
1. Write a handler in worker/src/index.js under OPS. Validate op.key / op.date / required fields, return {ok:true} or {ok:false, error:'...'}.
2. cd tracker/worker && wrangler deploy.
3. Decide whether the op is hot-path or cold-path. Hot-path: emit at the mutation site via sendOp({type:'...', ...}) right after saveStateLocal(). Cold-path: add a diff comparison inside emitDiffOps so it fires when the corresponding field differs vs snapshot; existing cold-path sites already call saveState() and will pick it up automatically.
4. If mutate.mjs needs to drive it from CLI, add an entry to OP_BUILDERS in tracker/mutate.mjs.

Editing an existing item from CLI. node mutate.mjs lg editItem '{"key":"<key>","<field>":<value>,...}'. Multiple fields per call OK. To replace the entire item shape (including dropping fields), use addItem instead — it does a full upsert.

Adding a brand-new item from CLI. node mutate.mjs lg addItem '{"key":"<key>","name":"...","category":"...","kcal":...,"displayUnits":[{...}],...}'. The schema for an item: name, category, plus per-native-unit nutrient fields (kcal, fat, sf, omega3, p, water, caffeine, ...) and a displayUnits array of {label, unitsPerServing, default?}. Recipes use {ingredients:[{itemKey, multiplier}]} instead of nutrient fields.

Edge cases.
1. Concurrent counter_inc from two tabs both succeed; server lands at +2 and each tab still shows +1 until it reloads. Correct semantics.
2. Concurrent catalog edits last-write-wins per object via catalog_add upsert; mutate.mjs editItem uses catalog_edit and is last-write-wins per field.
3. Legacy id-less customs in the gist are skipped by the diff path — only id-bearing customs sync. New customs created via the UI are id-bearing from the start. Old id-less day entries are read-only via the gist.
4. If lastKnownGistState drifts behind the actual gist (load failure, another writer landed during flush), the next saveState diff may re-emit an op the server already has. Worker handlers are idempotent for upserts and last-write-wins for sets — worst case is a few wasted bytes. The next successful loadFromGist re-syncs the snapshot.
