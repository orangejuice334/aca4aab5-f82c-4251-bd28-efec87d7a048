# Tracker tests

Browser-free unit + integration tests for the pure logic that powers
`track.html`. Built on `node:test`; no other dependencies.

## Run

    node tracker/tests/run-tests.mjs

Or directly (Node 24 requires explicit file list):

    node --test tracker/tests/*.test.mjs

## Workflow

- Every change to `tracker/lib/tracker-core.mjs` must add a matching test.
- Every change to `track.html` that touches a function whose pure twin
  lives in `tracker-core.mjs` must update both copies AND the test.
- Tests must pass before any commit to `tracker/`.

## Layout

- `lib/tracker-core.mjs` (sibling to `tests/`): pure logic extracted
  from `track.html`. No DOM, no fetch.
- `tests/_mocks.mjs`: shared mock catalog used by integration tests.
- `tests/unit-*.test.mjs`: one file per logical chunk of `tracker-core`.
- `tests/integration-*.test.mjs`: end-to-end story tests (create
  recipe, modify ingredients, log a day, etc.).
- `tests/run-tests.mjs`: convenience runner that globs `*.test.mjs`.

## Coverage targets

| Area | File |
|---|---|
| Nutrient schema | unit-nutrient-schema |
| Item helpers (measure, primary unit) | unit-item-helpers |
| displayUnits + ordering | unit-display-units + permutations |
| scaleByNative | unit-scaling |
| computeIngredientMacros / computeItemMacros | unit-ingredient-macros + permutations |
| Cycle protection | unit-cycle-safety |
| resolveIngredient | unit-resolve-ingredient |
| sumIngredientNativeUnits | unit-sum-native |
| Format helpers | unit-format-helpers + unit-format-item-name |
| History lookup | unit-history-helpers |
| Body fat / BMI | unit-bf-bmi |
| Pacing window | unit-pacing |
| Recipe end-to-end | integration-recipe-flows + integration-recipe-as-ingredient + integration-full-story-a/b |
| Supplement flow | integration-supplement-flow + integration-create-supplement |
| Day totals | integration-counter-totals |
| Variant edits | integration-modify-servings |
