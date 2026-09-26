# Tracker end-to-end scenarios (Playwright)

Adversarial browser scenarios for `track.html`. They encode the behaviour the app is supposed to have, so a failing scenario is a bug report, not a broken test. Many are expected to fail today; the list at the bottom says which and why.

## Safety

- Every scenario runs as the disposable `test` user (`?user=test`), whose Worker entry maps to its own private gist (`4da0464ca688d5308e121cf1e8c0cace`). `support/cloud.mjs` refuses to write if the Worker ever maps `test` anywhere else.
- A context-wide route aborts any Worker request for a different user and fails the scenario, so lg's gist cannot be read or written by the page.
- The two scenarios that need lg-shaped data never contact the Worker for lg: `users-and-routing` answers a bare URL from a fake, and `real-data-smoke` serves the local backup `tracker/backups/lg-state.json` through a fake Worker and acknowledges writes locally. No real data is uploaded to the test gist.
- Each scenario resets the test gist to a known seed (`support/seed.mjs`) before loading the page, and waits for its own writes to land before the next one starts.

## Running

From `tracker/`:

1. `npm install` (once).
2. `npm run e2e` runs everything. Brave is used automatically when installed; otherwise run `npx playwright install chromium` once and set `E2E_BROWSER=chromium`.
3. `npx playwright test -c e2e/playwright.config.mjs e2e/specs/recipes-editing.spec.mjs` runs one file; add `-g "full recipe"` to filter by title.
4. `--headed` shows the browser, `--ui` opens the Playwright UI, `npm run e2e:list` lists every scenario without running it.
5. `npm run e2e:report` opens the HTML report of the last run (traces and screenshots are kept for failures).

Scenarios run one at a time (`workers: 1`) because they share one cloud user. A full run hits the real Worker and GitHub, so expect several minutes; the seed writer skips rewrites when a scenario left the gist untouched, which keeps GitHub's content-creation limits out of reach. Phone-sized scenarios are tagged `@mobile` and also run in the Pixel 7 project.

The page clock is fixed at Mon 2026-06-15 12:00 in America/New_York unless a scenario says otherwise, so "today" never depends on the real date.

## Layout

| Path | What it holds |
|---|---|
| `playwright.config.mjs` | Browser choice, projects, static server, timeouts |
| `support/static-server.mjs` | Serves `tracker/` on 127.0.0.1 for the page |
| `support/cloud.mjs` | The only code that writes cloud state, test user only |
| `support/seed.mjs` | Baseline catalog, recipes, days and helpers (`logCounter`, `dayIn`) |
| `support/fixtures.mjs` | The `tracker` fixture: seeding, guards, page-error checks, and the `TrackerPage` page object |
| `specs/*.spec.mjs` | Scenarios, one file per area |

## Suspected defects these scenarios target

Found by reading the code while writing the scenarios. None of this has been confirmed by a run yet; treat each line as a hypothesis the matching scenario will confirm or refute.

| Area | Suspected defect | Scenario |
|---|---|---|
| Add new item | "Store for later" throws a ReferenceError (`sf`, `water`, `caffeine`, `timeRaw`, `frequency` are undefined), so nothing is stored | add-new-item: Store for later saves a reusable item |
| Add new item | A stored item keeps only kcal, protein, sat fat, water and caffeine; other typed nutrients are dropped | add-new-item: a stored item keeps every nutrient |
| Catalog | Clearing a bar filter does not re-collapse a bar that was collapsed before filtering | catalog-layout |
| Counters | Logging a timed item leaves its "past time" flag until the next minute tick | counters-and-totals |
| Counters | Items counted in pieces show grams in their row titles | counters-and-totals |
| Edit panel | A serving added with the panel's Add button is not saved until the panel closes | catalog-edit-panel |
| Edit panel | Items with a 30 g `amount` show per-gram values under "Per 100 g" and a wrong per-serving column | catalog-edit-panel |
| Edit panel | Opening and closing an item without edits rewrites it and sends a write | catalog-edit-panel |
| Recipe maker | The ingredient picker offers archived items and water | recipes-maker |
| Recipe maker | A one-off (non-preserve) recipe saved from the maker cannot be logged today | recipes-maker |
| Recipe maker | Recipes used as ingredients mix up "default serving" and "whole batch" | recipes-maker |
| Recipe editing | The Preserve switch never renders, so recipes cannot be made one-off | recipes-editing |
| Recipe editing | Changing, adding or removing an ingredient does not update the full-recipe amount and title until the panel closes | recipes-editing |
| Recipe editing | Saving a recipe recomputes its full-recipe size from the default serving while logging uses the first serving, so renaming a recipe changes its calories | recipes-editing |
| Recipe editing | A custom portion in g or oz adds a fraction of a batch instead of grams | recipes-editing |
| Recipe editing | Editing an inner recipe does not refresh a recipe that contains it | recipes-editing |
| Recipe logging | Date navigation does not re-render the catalog, so one-off recipes do not appear or disappear with the viewed day | recipes-logging |
| Today's log | A past day's one-off recipe entry uses the live recipe instead of that day's frozen copy | today-log |
| Supplements | Every-other-day supplements are flagged "past time" on their off days | supplements-and-water |
| Body fat | Female profiles get the male Navy formula (the formula reads `gender`, the profile stores `sex`) | weight-body-mood |
| Weight | The empty weight summary points to a "Checkout List header" that no longer exists | weight-body-mood |
| Profile | BMR and TDEE do not update when today's weight is logged | profile |
| Profile | The date format and imperial units are not applied to the weight summary | profile |
| Profile | Switching to 12-hour time does not update Today's log until the next minute tick | profile |
| History | Deleting a past day has no confirmation | history-and-dates |
| History | Archiving an item removes it from past days' totals | history-and-dates |
| Dates | A page left open over midnight keeps logging onto the previous day | history-and-dates |
| Weekly tracker | The mercury limit ignores body weight (reads a `profile.weightKg` that does not exist) | history-and-dates |
| Weekly tracker | The weight-gain warning hard-codes a 1,400 kcal cut instead of the profile goal | history-and-dates |
| Weekly tracker | A 0.93 kg/week loss is described as "past the 0.5 to 1.0 kg/wk window" | history-and-dates |
| Sync | Nothing retries a failed save once the connection is back | sync-and-persistence |
| Sync | The Offline banner stays after saving works again | sync-and-persistence |
| Sync | Retry replaces local state with the cloud and never sends queued changes, so offline taps vanish | sync-and-persistence |
| Sync | Reloading while saves fail drops the queued changes (the unload beacon clears the queue before delivery is known) | sync-and-persistence |
| Sync | After a 412 conflict the second device's own change disappears from its screen, and its next full save writes the counter back to 0 | sync-and-persistence |
| Sync | A stale device that merely opens and closes an item overwrites another device's edit of it | sync-and-persistence |
| Catalog links | A catalog link opened in an already-open tab does nothing (no `hashchange` listener) | hash-commands |
| Real data | Unknown until run: recipes whose full-recipe row disagrees with their ingredients, and items whose + adds something other than what the row shows | real-data-smoke |
