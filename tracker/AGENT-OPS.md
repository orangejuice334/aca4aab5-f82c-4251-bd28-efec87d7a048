# Tracker - agent ops cheat sheet

A read-from-scratch reference. No history, no migration notes, just the
current schema and how to drive it.

## Tests (mandatory)

Run before every commit that touches `tracker/`:

    node tracker/tests/run-tests.mjs

Every change to a pure function in `track.html` whose twin lives in
`tracker/lib/tracker-core.mjs` MUST update both copies AND add a test in
`tracker/tests/*.test.mjs`. See `tracker/tests/README.md` for the layout
and coverage targets. No commit may land with a red suite.

Endpoint: `https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev`
User: this document is scoped to `?user=lg` (Luis). Every read and write
in here assumes that query string. Do not act on any other user from this
playbook.

## Read state
`GET /state?user=<u>` returns the raw gist object. Parse the live state via
`JSON.parse(data.files['tracker-state.json'].content).state`.

State shape:

| Path | Holds |
|---|---|
| `state.userCatalog.items` | All catalog items, keyed by slug. |
| `state.userCatalog.categories` | Category order + labels. |
| `state.days[<YYYY-MM-DD>]` | Per-day bucket. |
| `state.days[<d>].counters[<key>]` | Native-unit count consumed of that catalog item on that day. |
| `state.days[<d>].toggles[<key>]` | Bool. Scheduled servings use compound keys `<itemKey>#<HH:MM>`. |
| `state.days[<d>].customs[]` | One-off custom items logged on that day. |
| `state.days[<d>].weight` | kg as a number. Also `neck` and `waist` in cm. |
| `state.days[<d>].recipeSnapshots[<key>]` | Frozen copy of a non-preserve recipe. |
| `state.savedItems[]` | Reusable custom items the user saved (similar to catalog items but lighter). |
| `state.profile` | Goals, height, weight history target, displayedNutrients list, gender, etc. |

## Mutate state
`POST /ops?user=<u>` body `{ ops: [ {type, ...args, ts: <ISO>}, ... ] }`.
Every food-log op needs `date: "YYYY-MM-DD"`. `ts` is the current ISO
timestamp; it drives the row's "last touched at" badge.

Response shape: `{ ok, applied, errors, _savedAt, gistVersion }`. The
`X-Gist-Version` response header carries the same `gistVersion` for
clients that prefer headers. `ok: false` means one or more ops failed
validation; inspect `errors[].index` / `errors[].reason`.

After any mutation, GET /state once to confirm. On HTTP 403 back off
about 30 seconds; the underlying gist API is rate-limited.

## Optimistic concurrency (optional)

The Worker supports an `If-Match: <gistVersion>` request header on
`/ops`. When the header is present and the gist's current version no
longer matches, the Worker rejects the entire batch with HTTP 412 and
returns `{ error, expected, current }` plus the `X-Gist-Version` header
so the client can re-sync before retrying. Omit the header to disable
the check (last writer wins).

The browser app uses this to detect concurrent writes from other tabs
or `mutate.mjs`. One-shot scripts that don't loop can skip it.

## Live clock requirement

Whenever the user phrases a log in present tense ("I just ate ...",
"I took my ...", "I drank ..."), fetch the LIVE local wall-clock NOW
before composing the op. Do not reuse a cached "today's date is X"
line, do not pull `new Date()` from earlier in this session, do not
assume the timezone offset. Run `date -Is` (or the equivalent in
PowerShell) in a shell AT THE MOMENT of building the op so `date` and
`ts` reflect the user's actual current local time.

## Item schema

```
{
  name: "Salt substitute potassium chloride",
  brand: "Morton",                                  // optional, renders as "Name (Brand)"
  category: "items" | "recipes" | "small_portions" | "liquids" |
            "supplements" | "water" | "uncategorized",
  defaultMeasuredIn: "g" | "ml" | "units",
  // All nutrients are per-1-native (per gram for 'g' items, per ml for
  // 'ml' items, per discrete unit for 'units' items).
  kcal, p, carbs, fiber, sugar, fat, sf, transfat,
  cholesterol, sodium, water, caffeine, omega3,
  vitA, vitC, vitD, vitE, vitK,
  b1, b2, b3, b5, b6, b7, b9, b12, choline,
  calcium, iron, magnesium, phosphorus, potassium,
  zinc, selenium, copper, manganese, iodine, chromium, molybdenum,
  mercury, purines,
  density_g_per_ml,                                 // optional, only if cross-unit variants used
  displayUnits: [ ... ],                            // see below
  notes: "free-text reference / assumption log",
  ingredients: [ ... ],                             // recipes only
  preserve: true | false,                           // recipes only; false = day-scoped
}
```

### displayUnits

Each entry describes one way to count the item. The render path reads
`multiplier` (native-unit serving size) as the single source of truth;
`amount` and `unit` preserve the user-typed input for round-tripping.

```
{
  label: "1 cup",          // human-readable
  amount: 1,               // user-typed magnitude
  unit: "cup",             // user-typed unit
  multiplier: 240,         // native-unit equivalent (e.g. 240 ml for 1 cup)
  default: true,           // optional, exactly one variant should carry this
  time: "08:00",           // optional, schedules this serving (supplements/water)
  frequency: "daily" | "alternate",  // optional, only meaningful with time
  locked: true,            // optional, hides the catalog editor's delete button
}
```

Rules:
- Exactly ONE variant in `displayUnits` should have `default: true`.
- Scheduled servings live on individual displayUnits, not on the item.
  A supplement taken 3 times a day has 3 displayUnits, each with its
  own `time` and `frequency`.
- Toggle keys for scheduled servings are compound:
  `<itemKey>#<HH:MM>` (e.g. `omega3#08:00`). Persistence path is
  `state.days[<date>].toggles[<compound>]`.
- For recipes, the auto-generated "full recipe" variant typically carries
  `locked: true` so it cannot be deleted from the variant editor.

## How to translate a user request

### "I just ate <amount> of <item>"

1. Fetch the LIVE clock first (see Live clock requirement above).
2. Fetch state. Find `state.userCatalog.items[k]` where `item.name`
   matches (case-insensitive substring). If multiple plausible matches,
   ask the user which one.
3. Item not found: ask the user for the product's nutrition-label
   values. Phrase it as: "I don't have X in your catalog. Paste a photo
   of the back label, or list the per-serving nutrition facts (kcal, P,
   fat, SF, carbs, fiber, sugar, sodium, and anything else) and I will
   add it." If the user can't get a label, offer to estimate from USDA
   or brand databases and record every assumption in the item's `notes`
   field for later verification.
4. Resolve `<amount>` to grams (or ml for `defaultMeasuredIn === 'ml'`,
   or units for `'units'`). For a whole serving use the default
   variant's `multiplier`.
5. Emit `{type:'counter_inc', date, key, servingSize:<amount>, ts}`.
   `date` and `ts` MUST come from the just-fetched local clock.

### "I ate <amount> g of <recipe>"

Recipe counters are in fractions of one batch, not grams.

1. Compute one batch's native-unit total by summing every ingredient:
   - If `ing.amount` is a positive number, add `ing.amount`.
   - Otherwise if `ing.multiplier` is a positive number, add
     `ing.multiplier * ITEMS[ing.itemKey].displayUnits[0].multiplier`.
   - Flat ingredients (no `itemKey`, no numeric amount) contribute 0.
2. `servingSize = amount / batch_total` (e.g. 250 / 853 = 0.293).
3. `counter_inc` with that fraction. One whole batch = `servingSize: 1`.

### "I took my <supplement>" / "I drank my <water slot>"

For a scheduled supplement: `{type:'toggle_set', date,
key:'<itemKey>#<HH:MM>', value:true, ts}`. To untick:
`{type:'toggle_unset', date, key, ts}` (or `value:false`).

For an unscheduled supplement: `counter_inc` instead, since unscheduled
items use the regular counter path.

### "Log an ad-hoc item, not in the catalog"

`{type:'custom_add', date, item:{id:<uuid>, name, kcal, p, sf, water,
caffeine, count:1, time:'HH:MM'}}`. Use `crypto.randomUUID()` (or
`uuidgen`) for `id`.

### "Add <food> to my catalog"

Macros are per-1-native: divide nutrition-label values by the canonical
serving size in grams (mass items) or ml (volume items). Set 0 for
fields the label genuinely shows as zero. Most consumer-product labels
omit vitamins, most minerals, omega-3, transfat, and purines; backfill
those from USDA or brand databases when feasible, otherwise leave the
field unset (which renders as 0 anyway) and note the gap in `notes` so
a later pass can fill it.

### "Edit <item>"

`{type:'catalog_edit', key, fields:{...new props...}}`. Shallow-merge
(Object.assign) over the existing item.

### "Delete <item>"

`{type:'catalog_delete', key}`. BEFORE issuing, scan
`state.userCatalog.items[*].ingredients[*].itemKey` for references and
warn the user if any recipe would be orphaned.

### "Create recipe: <name>, with <ingredient list>"

`catalog_add` with `category:'recipes'`. No top-level kcal/p (computed
from ingredients).

Optional recipe-only fields:

| Field | Effect |
|---|---|
| `preserve: false` | Recipe behaves like a custom: visible in the catalog only on days where it was logged. Defaults to `true`. |
| Variant with `locked: true` | Variant editor's × button refuses to delete this variant. |

Ingredient shape:

```
ingredients: [
  {itemKey:'<src1>', multiplier:1, label:'1 pkg'},
  {itemKey:'<src2>', multiplier:0.5, label:'1/2 cup'},
  {name:'Salt to taste', kcal:0, p:0, sf:0, water:0, caffeine:0}   // flat row
]
```

`multiplier` is decimal-fractions of the source item's default variant
size (yogurt default 226 g, "1/4 tub" = multiplier 0.5).

### "Edit recipe ingredients"

`{type:'catalog_edit', key, fields:{ingredients:[...full new array...]}}`.

### Recipe snapshots (non-preserve recipes only)

Non-preserve recipes get a per-day frozen copy stored at
`state.days[<date>].recipeSnapshots[<key>]`. Past days are immutable;
today's snapshot tracks edits to the recipe so same-day logs see the
latest definition.

`counter_inc / counter_dec / counter_set` ops accept an optional
`recipeSnapshot` field (a deep-clone of the recipe item). When present,
the Worker writes it to `state.days[<op.date>].recipeSnapshots[<op.key>]`.

| Op | Meaning |
|---|---|
| `recipe_snapshot_set { date, key, recipe }` | Refresh a snapshot. Used when the user edits a non-preserve recipe and today already has a counter or snapshot for it. |
| `recipe_snapshot_clear { date, key }` | Drop a snapshot so the next log re-captures it. |

Macro compute paths (the daily totals function and the history detail
view) resolve a recipe via `effectiveRecipeForDay(key, day)`: returns
the snapshot when present, falls back to live `ITEMS[key]` otherwise.

### "Set my counter directly to N"

`{type:'counter_set', date, key, value:<grams or batches>, ts}`. Use
sparingly; `counter_inc` is the usual path.

### "Adjust goals / displayed nutrients"

```
{type:'profile_update', fields:{
  goals: {kcal:1400, p:110, water:2000, caffeine:200, sf:12},
  displayedNutrients: ['kcal','p','sf','water','caffeine'],
  targetWeightKg: 76,
  gender: 'male'
}}
```

Deep-merged into `state.profile`.

### "Log my weight" / "Log my measurements"

```
{type:'weight_set', date, value:<kg>, ts}
{type:'neck_set',   date, value:<cm>, ts}
{type:'waist_set',  date, value:<cm>, ts}
```

Body-fat is computed by the client (Navy formula) from neck + waist +
`state.profile.heightCm`. To clear a single metric: `weight_clear`,
`neck_clear`, `waist_clear`.

### "Re-order categories" / "Add a category"

`{type:'catalog_categories_set', categories:[{key,label}, ...]}`.
Reserved keys (`water`, `supplements`, `uncategorized`) must remain.

### "Forget today" / "Delete day"

`{type:'day_delete', date}`.

## Match heuristics

- Item lookup: case-insensitive substring on `item.name`. Fall back to
  `state.savedItems` (per-day customs that were saved). Ask if
  ambiguous.
- "Yesterday" / "Monday" / etc. resolve to absolute `YYYY-MM-DD` in the
  user's local timezone before sending.
- "One/a/the" + bare item name = 1 canonical serving (default variant
  times 1).
- Voice-dictated item names often have mishears. Surface a one-line
  "I read X as Y, confirm?" rather than guessing wrong silently.

## Nutrient reference

| Group | Keys |
|---|---|
| Macros | kcal, p, carbs, fiber, sugar, fat, sf, transfat, cholesterol, sodium, water, caffeine, omega3, purines |
| Vitamins | vitA, vitC, vitD, vitE, vitK, b1, b2, b3, b5, b6, b7, b9, b12, choline |
| Minerals | calcium, iron, magnesium, phosphorus, potassium, zinc, selenium, copper, manganese, iodine, chromium, molybdenum, mercury |

Units the renderer expects (matters when you read a label):

| Field | Unit |
|---|---|
| kcal | (number, kcal) |
| p, carbs, fiber, sugar, fat, sf, transfat | grams |
| cholesterol, sodium, caffeine, omega3, vitC, vitE, calcium, iron, magnesium, phosphorus, potassium, zinc, copper, manganese, purines | mg |
| water | ml |
| vitA, vitD, vitK, b7, b9, b12, selenium, iodine, chromium, molybdenum, mercury | μg |

## Op examples (copy-paste templates)

Set the shell variables ONCE at the start of every batch by reading
the live clock. Never hard-code dates.

```
WORKER="https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev"
TODAY=$(date +%F)          # e.g. 2026-05-20
NOW=$(date -Is)            # e.g. 2026-05-20T09:42:17-04:00
USER=lg
```

### counter_inc: log eating 50 g of almonds

```
curl -s -X POST "$WORKER/ops?user=$USER" -H "Content-Type: application/json" -d "$(cat <<JSON
{"ops":[
  {"type":"counter_inc","date":"$TODAY","key":"almonds_oz","servingSize":50,"ts":"$NOW"}
]}
JSON
)"
```

### counter_inc: one whole canonical serving of a multi-variant item

Look up the default variant: `default_mult = state.userCatalog.items.<key>.displayUnits.find(u=>u.default).multiplier`.
Then send `servingSize: default_mult`.

### toggle_set: marking a scheduled supplement taken

Compound key = `<itemKey>#<HH:MM>`. The time matches the displayUnit's
`time` field.

```
{"ops":[
  {"type":"toggle_set","date":"$TODAY","key":"omega3#08:00","value":true,"ts":"$NOW"}
]}
```

### custom_add: log a one-off snack not in the catalog

```
ID=$(uuidgen)
{"ops":[
  {"type":"custom_add","date":"$TODAY","item":{
    "id":"$ID","name":"Hotel breakfast pastry","kcal":320,"p":4,"sf":8,
    "carbs":42,"sugar":18,"sodium":210,"water":0,"caffeine":0,"count":1,"time":"09:00"
  },"ts":"$NOW"}
]}
```

### catalog_add: fully populated single-ingredient item

Every stored nutrient field explicit, most of them non-zero, sourced
from USDA SR Legacy for cooked Atlantic salmon (per 100 g) converted
to per-gram. Use a real reference table like this whenever the label
or USDA entry gives a complete profile.

```
{"ops":[
  {"type":"catalog_add","key":"salmon_atlantic_cooked","item":{
    "name":"Salmon Atlantic, cooked dry heat",
    "category":"items",
    "defaultMeasuredIn":"g",
    "kcal":2.08, "p":0.221, "fat":0.124, "sf":0.030, "transfat":0,
    "carbs":0, "fiber":0, "sugar":0,
    "cholesterol":0.63, "sodium":0.59, "water":0.65, "caffeine":0,
    "omega3":23,
    "vitA":0.036, "vitC":0, "vitD":0.132, "vitE":0.0135, "vitK":0.007,
    "b1":0.0023, "b2":0.0038, "b3":0.085, "b5":0.016, "b6":0.0065,
    "b7":0.05, "b9":0.25, "b12":0.028, "choline":0.95,
    "calcium":0.12, "iron":0.0034, "magnesium":0.30, "phosphorus":2.52,
    "potassium":3.84, "zinc":0.0043, "selenium":0.38, "copper":0.0005,
    "manganese":0.0002, "iodine":0.24, "chromium":0, "molybdenum":0,
    "mercury":0.014, "purines":1.1,
    "displayUnits":[
      {"label":"100 g","amount":100,"unit":"g","multiplier":100},
      {"label":"1 fillet (170 g)","amount":170,"unit":"g","multiplier":170},
      {"label":"3 oz portion","amount":85,"unit":"g","multiplier":85,"default":true}
    ],
    "notes":"USDA SR Legacy 15076 (Fish, salmon, Atlantic, farmed, cooked, dry heat). Per-1-g derived by dividing per-100-g facts by 100, except omega3 which is mg/g. Mercury value is the FDA's average for farmed Atlantic salmon (~0.014 mg/kg = 0.014 μg/g)."
  }}
]}
```

### catalog_add: supplement with multiple per-serving scheduled times

Supplements use `defaultMeasuredIn:"units"` for capsules / pills. Each
scheduled serving lives on its own displayUnit, carrying its own
`time` and `frequency`.

```
{"ops":[
  {"type":"catalog_add","key":"omega3","item":{
    "name":"Omega-3 (fish oil)",
    "category":"supplements",
    "defaultMeasuredIn":"units",
    "kcal":10, "p":0, "fat":1.1667, "sf":0.1667, "omega3":720,
    "carbs":0, "fiber":0, "sugar":0, "transfat":0, "cholesterol":0,
    "sodium":0, "water":0, "caffeine":0,
    "vitA":0, "vitC":0, "vitD":0, "vitE":0, "vitK":0,
    "b1":0, "b2":0, "b3":0, "b5":0, "b6":0, "b7":0, "b9":0, "b12":0, "choline":0,
    "calcium":0, "iron":0, "magnesium":0, "phosphorus":0, "potassium":0,
    "zinc":0, "selenium":0, "copper":0, "manganese":0, "iodine":0,
    "chromium":0, "molybdenum":0, "mercury":0, "purines":0,
    "displayUnits":[
      {"label":"AM","multiplier":1,"time":"08:00","frequency":"daily","default":true,"amount":1,"unit":"g"},
      {"label":"Lunch","multiplier":1,"time":"12:30","frequency":"daily","amount":1,"unit":"g"},
      {"label":"PM","multiplier":1,"time":"19:00","frequency":"daily","amount":1,"unit":"g"}
    ],
    "notes":"3 softgels/day. 720 mg EPA+DHA per softgel. Take with a fat-containing meal."
  }}
]}
```

### catalog_add: liquid with density (cross-unit volume servings)

`defaultMeasuredIn:"ml"` plus `density_g_per_ml` lets the same item
support both volume and mass serving sizes.

```
{"ops":[
  {"type":"catalog_add","key":"soy_milk_unsw","item":{
    "name":"Soy milk unsweetened",
    "category":"liquids",
    "defaultMeasuredIn":"ml",
    "density_g_per_ml":1.03,
    "kcal":0.4, "p":0.03, "carbs":0.014, "fiber":0.004, "sugar":0.005,
    "fat":0.018, "sf":0.0024, "transfat":0, "cholesterol":0,
    "sodium":0.36, "water":0.94, "caffeine":0, "omega3":0,
    "vitA":0, "vitC":0, "vitD":0.42, "vitE":0.01, "vitK":0.029,
    "b1":0, "b2":0.001, "b3":0.0004, "b5":0, "b6":0.0001, "b7":0, "b9":0.0003, "b12":0.012, "choline":0.236,
    "calcium":1.23, "iron":0.005, "magnesium":0.099, "phosphorus":0.42, "potassium":1.18,
    "zinc":0.002, "selenium":0.014, "copper":0.0007, "manganese":0.0008, "iodine":0,
    "chromium":0, "molybdenum":0, "mercury":0, "purines":0,
    "displayUnits":[
      {"label":"1 cup","amount":240,"unit":"ml","multiplier":240,"default":true},
      {"label":"1 tbsp","amount":15,"unit":"ml","multiplier":15},
      {"label":"1 carton (946 ml)","amount":946,"unit":"ml","multiplier":946}
    ]
  }}
]}
```

### catalog_add: recipe (computed macros via ingredients)

```
{"ops":[
  {"type":"catalog_add","key":"turkey_salmon_slab","item":{
    "name":"Turkey salmon slab",
    "category":"recipes",
    "ingredients":[
      {"itemKey":"turkey_ground_safeway","multiplier":1,"label":"1 pkg"},
      {"itemKey":"salmon_pink_canned","multiplier":1,"label":"1 can"},
      {"itemKey":"egg_substitute","multiplier":1,"label":"2 cups"},
      {"name":"Salt to taste","kcal":0,"p":0,"sf":0,"water":0,"caffeine":0}
    ],
    "displayUnits":[
      {"label":"1 serving","amount":200,"unit":"g","multiplier":200,"default":true},
      {"label":"full recipe","amount":4117,"unit":"g","multiplier":4117,"locked":true}
    ]
  }}
]}
```

### catalog_edit: backfill a single field

```
{"ops":[
  {"type":"catalog_edit","key":"kcl_morton","fields":{"potassium":492.86}}
]}
```

### weight + neck + waist (one batch)

```
{"ops":[
  {"type":"weight_set","date":"$TODAY","value":98.5,"ts":"$NOW"},
  {"type":"neck_set",  "date":"$TODAY","value":43,  "ts":"$NOW"},
  {"type":"waist_set", "date":"$TODAY","value":110, "ts":"$NOW"}
]}
```

### profile_update (deep-merge)

```
{"ops":[
  {"type":"profile_update","fields":{
    "goals":{"kcal":1400,"p":110,"water":2000,"caffeine":200,"sf":12},
    "displayedNutrients":["kcal","p","sf","water","caffeine","potassium"],
    "targetWeightKg":76,
    "gender":"male"
  }}
]}
```

### catalog_delete (with safety scan)

Before deleting, GET /state and grep
`state.userCatalog.items[*].ingredients[*].itemKey` for references.
Warn the user if any recipe would be orphaned.

```
{"ops":[
  {"type":"catalog_delete","key":"some_old_item"}
]}
```

### catalog_categories_set (reorder / rename categories)

```
{"ops":[
  {"type":"catalog_categories_set","categories":[
    {"key":"liquids","label":"Liquids"},
    {"key":"items","label":"Items"},
    {"key":"small_portions","label":"Small portions"},
    {"key":"recipes","label":"Recipes and Meals"},
    {"key":"supplements","label":"Supplements"},
    {"key":"water","label":"Water"},
    {"key":"uncategorized","label":"Uncategorized"}
  ]}
]}
```

### day_delete (wipe a day's log entirely)

```
{"ops":[
  {"type":"day_delete","date":"2026-05-18"}
]}
```

### Batched single POST: meal + supplement + weight

The Worker applies ops in order and replies once.

```
{"ops":[
  {"type":"counter_inc","date":"$TODAY","key":"almonds_oz","servingSize":30,"ts":"$NOW"},
  {"type":"counter_inc","date":"$TODAY","key":"soy_milk_unsw","servingSize":240,"ts":"$NOW"},
  {"type":"toggle_set","date":"$TODAY","key":"omega3#08:00","value":true,"ts":"$NOW"},
  {"type":"weight_set","date":"$TODAY","value":98.4,"ts":"$NOW"}
]}
```

## Don't

- Don't store macros per-100. Per-1-native always.
- Don't set both `counter_*` AND `toggle_*` on the same supplement/water key. Totals will double-count.
- Don't push raw `<`, `>`, or `&` in item names without thinking. They render through `escapeHtml` but the gist content stays raw and a future reader will see them.
- Don't mass-edit the catalog without backing up the gist content first: GET /state and save to disk.
