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
1. Fetch state. Find `state.userCatalog.items[k]` where `item.name` matches (substring, case-insensitive). Ask only if ≥ 2 plausible matches.
2. `<amount>` in grams (or ml for `defaultMeasuredIn === 'ml'`). Whole serving = use the **default** variant's `multiplier` (`item.displayUnits.find(u=>u.default)`).
3. Emit `{type:'counter_inc', date, key, servingSize:<amount>, ts}`. `servingSize` is the native-unit delta added to the counter.

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
  name, category:'items'|'recipes'|'small_portions'|'liquids'|'supplements'|'water'|'uncategorized',
  defaultMeasuredIn:'g'|'ml'|'units',
  kcal:<per-1>, p, sf, water, caffeine, sodium, cholesterol, ...,
  displayUnits:[{label:'1 pkg', multiplier:448, default:true}, {label:'100 g', multiplier:100}, ...],
  density_g_per_ml:<optional, only if cross-unit variants needed>,
  time:'HH:MM', frequency:'daily'|'alternate',          // optional schedule for any category
  preserve:true,                                        // recipes only; false = day-scoped like a custom
}}
```

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

## Example: "I just ate 50 g of almonds, on lg"
```
TODAY=$(date +%F)        # 2026-05-16
NOW=$(date -Is)          # 2026-05-16T15:30:00-04:00
curl -s -X POST "$WORKER/ops?user=lg" -H "Content-Type: application/json" -d "$(cat <<JSON
{"ops":[{"type":"counter_inc","date":"$TODAY","key":"almonds_oz","servingSize":50,"ts":"$NOW"}]}
JSON
)"
```

## Don't
- Don't store macros per-100. **Per-1-native always.**
- Don't set both `counter_*` AND `toggle_*` on the same supplement/water key — totals double-count.
- Don't push raw `<` `>` `&` in item names without thinking — they go through `escapeHtml` on render but the gist content stays raw and a future reader will see them.
- Don't mass-edit the catalog without backing up the gist content first (`GET /state` → save to disk).
