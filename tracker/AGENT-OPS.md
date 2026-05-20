# Tracker — agent ops cheat sheet

Endpoint: `https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev`
Users: `?user=lg` (Luis), `?user=eg` (Estela).

## Read state
`GET /state?user=<u>` → raw gist object. State lives at
`JSON.parse(data.files['tracker-state.json'].content).state`.

## Mutate state
`POST /ops?user=<u>` body `{ ops: [ {type, ...args, ts: <ISO>}, ... ] }`.
Every food-log op needs `date: "YYYY-MM-DD"` (today in local tz unless asked).
`ts` is the current ISO timestamp — drives the row "last touched at" badge.

After any mutation, GET /state once to confirm; on `403` back off ~30 s (gist API rate-limited).

## How to translate a user request

### "I just ate <amount> of <item>"
**Always fetch the LIVE local wall-clock NOW before composing the op. Do not reuse a cached `Today's date is X` line, do not pull `new Date()` from earlier in this session, do not assume the timezone offset. Run `date -Is` (or equivalent) in a shell at the moment of building the op so `date` and `ts` reflect the user's actual current local time.**

1. Fetch state. Find `state.userCatalog.items[k]` where `item.name` matches (substring, case-insensitive).
2. **Item not found**: ask the user for the product's nutrition-label values. Phrase it as "I don't have <X> in your catalog. Paste a photo of the back label, or list the per-serving nutrition facts (kcal, P, fat, SF, carbs, fiber, sugar, sodium, etc.) and I will add it." If the user can't get the label, offer to estimate from USDA / brand norms and surface every assumption in the catalog-add op's `notes` field for later verification.
3. `<amount>` in grams (or ml for `defaultMeasuredIn === 'ml'`). Whole serving = use the **default** variant's `multiplier` (`item.displayUnits.find(u=>u.default)`).
4. Emit `{type:'counter_inc', date, key, servingSize:<amount>, ts}`. `servingSize` is the native-unit delta added to the counter. `date` and `ts` MUST come from the just-fetched local clock, not stale context.

### "I ate <amount> g of <recipe>"
Recipe counters are in **fractions of one batch**, not grams.
1. `batch_g = Σ ingredient.multiplier × ITEMS[ingredient.itemKey].defaultDisplayUnit.multiplier` (mass + density-adjusted volume).
2. `servingSize = amount / batch_g` (e.g. 250 / 853 ≈ 0.293).
3. `counter_inc` with that fraction. One whole batch = `servingSize: 1`.

### "I took my <supplement>" / "I drank my <water slot>"
`{type:'toggle_set', date, key, value:true, ts}`. Untick = `value:false` (or `toggle_unset`).

### "Log an ad-hoc item, not in the catalog"
`{type:'custom_add', date, item:{id:<uuid>, name, kcal, p, sf, water, caffeine, count:1, time:'HH:MM'}}`. Use `crypto.randomUUID()` for `id`.

### "Add <food> to my catalog"
Macros are **per-1-native** (per gram for mass items, per ml for volume). Divide nutrition-label values by the canonical serving size.
```
{type:'catalog_add', key:'<slug>', item:{
  name,
  brand:'<optional brand string>',                       // surfaces as "Name (Brand)" everywhere
  category:'items'|'recipes'|'small_portions'|'liquids'|'supplements'|'water'|'uncategorized',
  defaultMeasuredIn:'g'|'ml'|'units',
  kcal:<per-1>, p, sf, water, caffeine, sodium, cholesterol, ...,
  displayUnits:[{label:'1 pkg', amount:448, unit:'g', multiplier:448, default:true}, ...],
  density_g_per_ml:<optional, only if cross-unit variants needed>,
  preserve:true,                                        // recipes only; false = day-scoped like a custom
}}
```

**Schema notes (v6.5+, post-migration)**:
- `time` / `frequency` no longer live at the item level. They live on each `displayUnits` entry that should be scheduled. A single supplement with 3 daily doses has 3 displayUnit entries, each carrying its own `time` and `frequency`.
- Toggle keys for scheduled servings are compound: `<itemKey>#<HH:MM>` (e.g. `omega3#08:00`). `state.days[<date>].toggles[<compound>]` is the persistence path.
- `brand` is a top-level item field. Optional. Renders parenthetically next to the name.
- Each `displayUnits` entry stores `multiplier` (native-unit serving size, the single source of truth) plus `amount` + `unit` (round-trip preservation of the user-typed value, e.g. amount:1, unit:cup, multiplier:240 ml). `unitsPerServing` is a read-time mirror of `multiplier`, never persisted.
- Recipes can mark a variant `locked:true` so the catalog editor's × button refuses to delete it. The auto-generated "full recipe" variant uses this.
- Body-fat tracking uses per-day `neck` and `waist` numbers (cm). The Navy formula uses `state.profile.heightCm` and `state.profile.gender` (`'male'` default).

### "Edit <item>"
`{type:'catalog_edit', key, fields:{...new props...}}` — Object.assign shallow-merge over the existing item.

### "Delete <item>"
`{type:'catalog_delete', key}`. **First** scan recipes for references and warn the user if any will go orphan.

### "Create recipe: <name>, with <ingredient list>"
`catalog_add` with `category:'recipes'`. Category label in the UI is "Recipes and Meals". No top-level kcal/p (computed from ingredients).

Optional fields supported on the recipe object:
- `time: 'HH:MM'` + `frequency: 'daily'|'alternate'` — schedules the recipe alongside supplements/water for a whole-day meal plan. Leave blank for unscheduled.
- `preserve: true|false` — defaults to true. When `false`, the recipe behaves like a custom: visible in the catalog only on the day(s) it was logged (counter > 0 on activeDate), hidden everywhere else. Use for one-off meals you don't want cluttering the catalog.

```
ingredients:[
  {itemKey:'<src1>', multiplier:1, label:'1 pkg'},
  {itemKey:'<src2>', multiplier:0.5, label:'1/2 cup'},
  {name:'Salt to taste', kcal:0, p:0, sf:0, water:0, caffeine:0}     // flat row
]
```
`multiplier` is decimal-fractions of the source's **default** variant's grams (e.g. yogurt canon = 226 g → "1/4 tub" = multiplier 0.5).

### "Edit recipe ingredients"
`catalog_edit` with `fields:{ingredients:[...full new array...]}`.

### Recipe snapshots (non-preserve recipes only)
Non-preserve recipes (`preserve: false` on the catalog item) get a per-day frozen copy stored at `state.days[<date>].recipeSnapshots[<key>]`. Past days are immutable; today's snapshot tracks edits to the recipe so same-day logs see the latest definition.

`counter_inc / counter_dec / counter_set` ops accept an optional `recipeSnapshot` field (a deep-clone of the recipe item). When present, the Worker writes it to `state.days[<op.date>].recipeSnapshots[<op.key>]`. The client only includes this field for non-preserve recipes logged on the current calendar day.

`recipe_snapshot_set { date, key, recipe }` — explicitly refresh a snapshot. Used when the user edits a non-preserve recipe and today already has a counter or snapshot for it. Does not touch past days.

`recipe_snapshot_clear { date, key }` — drop a snapshot if you need to force a re-capture on next log.

Macro compute paths (`computeTotals`, the history detail view) resolve the recipe via `effectiveRecipeForDay(key, day)`: returns the snapshot when present, falls back to live `ITEMS[key]` otherwise.

### "Set my counter directly to N"
`{type:'counter_set', date, key, value:<grams or batches>, ts}`. Use sparingly — `counter_inc` is the usual path.

### "Adjust goals / displayed nutrients"
`{type:'profile_update', fields:{goals:{kcal:1400, p:110, water:2000, caffeine:200, sf:12}, displayedNutrients:['kcal','p','sf','water','caffeine']}}`. Deep-merged.

### "Log my weight"
`{type:'weight_set', date, value:<kg>, ts}`. Clear = `weight_clear`.

### "Re-order categories" / "Add a category"
`{type:'catalog_categories_set', categories:[{key,label}, ...]}`. Reserved keys (`water`, `supplements`, `uncategorized`) must remain.

### "Forget today" / "Delete day"
`{type:'day_delete', date}`.

## Match heuristics
- Item lookup: case-insensitive substring on `item.name`. Fall back to `state.savedItems` (per-day customs that were saved). Ask if ambiguous.
- "Yesterday" / "Monday" / etc. → resolve to absolute `YYYY-MM-DD` in user's local tz before sending.
- "One/a/the" + bare item name → 1 canonical serving (default variant × 1).
- Voice-dictated item names often have mishears; surface a one-line "I read X as Y — confirm?" rather than guessing wrong silently.

## Op examples (copy-paste templates)

Set the shell variables ONCE at the start of every batch by reading the live clock. Never hard-code dates.
```
WORKER="https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev"
TODAY=$(date +%F)          # e.g. 2026-05-20
NOW=$(date -Is)            # e.g. 2026-05-20T09:42:17-04:00
USER=lg
```

### counter_inc: log eating 50 g of almonds (existing catalog item)
```
curl -s -X POST "$WORKER/ops?user=$USER" -H "Content-Type: application/json" -d "$(cat <<JSON
{"ops":[
  {"type":"counter_inc","date":"$TODAY","key":"almonds_oz","servingSize":50,"ts":"$NOW"}
]}
JSON
)"
```

### counter_inc: one whole canonical serving of a multi-variant item
Look up the default variant: `default_mult = state.userCatalog.items.<key>.displayUnits.find(u=>u.default).multiplier`. Then send `servingSize: default_mult`.

### toggle_set: marking a scheduled supplement taken
Compound key = `<itemKey>#<HH:MM>`. The time is the displayUnit's `time` field. `value:false` (or `toggle_unset`) clears it.
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

### catalog_add: FULLY populated single-ingredient item
Every stored nutrient field set explicitly from the label, plus the optional `brand` field. Macros are per-1-native (per gram here since `defaultMeasuredIn:'g'`). Set `0` for fields the label genuinely shows as zero. Most consumer-product labels OMIT vitamins, most minerals, omega-3, transfat, and purines - that is normal, not rare. For omitted fields, prefer to fill from USDA or brand databases when feasible; otherwise leave the field unset (which renders as 0 anyway) and note the gap in the item's `notes` so a later pass can backfill.
```
{"ops":[
  {"type":"catalog_add","key":"kcl_morton","item":{
    "name":"Salt substitute potassium chloride",
    "brand":"Morton",
    "category":"items",
    "defaultMeasuredIn":"g",
    "kcal":0, "p":0, "carbs":0, "fiber":0, "sugar":0,
    "fat":0, "sf":0, "transfat":0,
    "cholesterol":0, "sodium":0, "water":0, "caffeine":0,
    "omega3":0,
    "vitA":0, "vitC":0, "vitD":0, "vitE":0, "vitK":0,
    "b1":0, "b2":0, "b3":0, "b5":0, "b6":0, "b7":0, "b9":0, "b12":0,
    "choline":0,
    "calcium":0, "iron":0, "magnesium":0, "phosphorus":0,
    "potassium":492.86,
    "zinc":0, "selenium":0, "copper":0, "manganese":0,
    "iodine":0, "chromium":0, "molybdenum":0,
    "mercury":0, "purines":0,
    "displayUnits":[
      {"label":"Whole container (88.6 g)","amount":88.6,"unit":"g","multiplier":88.6},
      {"label":"1 tsp (5.6 g)","amount":5.6,"unit":"g","multiplier":5.6},
      {"label":"1/4 tsp (1.4 g)","amount":1.4,"unit":"g","default":true,"multiplier":1.4}
    ],
    "notes":"Morton Salt Substitute, sodium-free. Label: 690 mg potassium per 1/4 tsp (1.4 g) = 492.86 mg K/g. Ingredients: Potassium Chloride, Fumaric Acid, Monocalcium Phosphate, Silicon Dioxide. 88.6 g container = 63 servings."
  }}
]}
```

Reference list of stored nutrient keys (omitting any of these means "unknown", which renders as 0 anyway, but the explicit zero is preferable for label-derived facts):

| Group | Keys |
|---|---|
| Macros | kcal, p, carbs, fiber, sugar, fat, sf, transfat, cholesterol, sodium, water, caffeine, omega3, purines |
| Vitamins | vitA, vitC, vitD, vitE, vitK, b1, b2, b3, b5, b6, b7, b9, b12, choline |
| Minerals | calcium, iron, magnesium, phosphorus, potassium, zinc, selenium, copper, manganese, iodine, chromium, molybdenum, mercury |

Units (the renderer formats with these): kcal (none), p / carbs / fiber / sugar / fat / sf / transfat in g, cholesterol / sodium / caffeine / omega3 / vitC / vitE / mg-class minerals in mg, water in ml, vitA / vitD / vitK / b7 / b9 / b12 / selenium / iodine / chromium / molybdenum / mercury in μg, purines in mg.

### catalog_add: supplement with multiple per-serving scheduled times
Supplements use `defaultMeasuredIn:"units"` for capsules / pills. Each scheduled serving lives on its own `displayUnits` entry; `time` and optional `frequency` move from the item level into the variant.
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
    "notes":"3 softgels/day. 720 mg EPA+DHA per softgel. Take with fat-containing meal."
  }}
]}
```

### catalog_add: liquid with density (cross-unit volume serving)
`defaultMeasuredIn:"ml"` plus `density_g_per_ml` lets you mix mass + volume variants on one item.
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

### catalog_add: recipe (no top-level macros; computed from ingredients)
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

### catalog_edit: backfill missing nutrient on an existing item
```
{"ops":[
  {"type":"catalog_edit","key":"kcl_morton","fields":{"potassium":492.86}}
]}
```

### weight_set + neck_set + waist_set
The client computes Navy body-fat from neck + waist + profile.heightCm; both inputs trigger gap-fill across missing dates.
```
{"ops":[
  {"type":"weight_set","date":"$TODAY","value":98.5,"ts":"$NOW"},
  {"type":"neck_set","date":"$TODAY","value":43,"ts":"$NOW"},
  {"type":"waist_set","date":"$TODAY","value":110,"ts":"$NOW"}
]}
```

### profile_update (deep-merged)
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
Before deleting, GET /state and grep `state.userCatalog.items[*].ingredients[*].itemKey` for references; warn the user if any recipe would be orphaned.
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

### Batched single POST: log a meal + take a supplement + log weight, all in one round-trip
Worker applies ops in order, replies once.
```
{"ops":[
  {"type":"counter_inc","date":"$TODAY","key":"almonds_oz","servingSize":30,"ts":"$NOW"},
  {"type":"counter_inc","date":"$TODAY","key":"soy_milk_unsw","servingSize":240,"ts":"$NOW"},
  {"type":"toggle_set","date":"$TODAY","key":"omega3#08:00","value":true,"ts":"$NOW"},
  {"type":"weight_set","date":"$TODAY","value":98.4,"ts":"$NOW"}
]}
```

## Don't
- Don't store macros per-100. **Per-1-native always.**
- Don't set both `counter_*` AND `toggle_*` on the same supplement/water key — totals double-count.
- Don't push raw `<` `>` `&` in item names without thinking — they go through `escapeHtml` on render but the gist content stays raw and a future reader will see them.
- Don't mass-edit the catalog without backing up the gist content first (`GET /state` → save to disk).
