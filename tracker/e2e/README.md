# Tracker end-to-end scenarios (Playwright)

Adversarial browser scenarios for `track.html`. They encode the behaviour the app is supposed to have, so a failing scenario is a bug report, not a broken test. The whole suite is expected to pass; the table at the bottom lists the defects the scenarios caught, each fixed in `track.html` and guarded by the named spec.

## Safety

- Every scenario runs as the disposable `test` user (`?user=test`), whose Worker entry maps to its own private gist (`4da0464ca688d5308e121cf1e8c0cace`). `support/cloud.mjs` refuses to write if the Worker ever maps `test` anywhere else.
- A context-wide route aborts any Worker request for a different user and fails the scenario, so lg's gist cannot be read or written by the page.
- The two scenarios that need lg-shaped data never contact the Worker for lg: `users-and-routing` answers a bare URL from a fake, and `real-data-smoke` serves the local backup `tracker/backups/lg-state.json` through a fake Worker and acknowledges writes locally. No real data is uploaded to the test gist.
- Each scenario resets the test user's state to a known seed (`support/seed.mjs`) before loading the page, and waits for its own writes to land before the next one starts.

## Backends

| `E2E_BACKEND` | What answers the page's Worker calls | Workers | GitHub traffic |
|---|---|---|---|
| `local` (default) | The real Worker code (`worker/src/index.js`, loaded from a verbatim copy) running in the test process, against an in-memory gist with GitHub's version history, so user routing, If-Match / 412 and every op handler run unchanged | 4 (`E2E_WORKERS` overrides) | none |
| `live` | The deployed Worker and the real test gist | 1 | paced: at most 330 gist writes per hour (GitHub allows 500 content writes per hour, shared with lg's tracker), logged in `e2e/.state/gist-write-log.json`; a scenario pauses when the budget is spent |

## Running

From `tracker/`:

1. `npm install` (once).
2. `npm run e2e` runs everything against the local backend. Brave is used automatically when installed; otherwise run `npx playwright install chromium` once and set `E2E_BROWSER=chromium`.
3. `npm run e2e -- e2e/specs/recipes-editing.spec.mjs` runs one file; add `-g "full recipe"` to filter by title.
4. `--headed` shows the browser, `--ui` opens the Playwright UI, `npm run e2e:list` lists every scenario without running it.
5. `E2E_BACKEND=live npm run e2e` runs against the deployed Worker, one scenario at a time.
6. `npm run e2e:report` opens the HTML report of the last run (traces and screenshots are kept for failures). The JSON results land in `e2e/results/results.json`.

Phone-sized scenarios are tagged `@mobile` and also run in the Pixel 7 project. The page clock is fixed at Mon 2026-06-15 12:00 in America/New_York unless a scenario says otherwise, so "today" never depends on the real date.

A scenario that leaves the page mid-save navigates to another page of the same site: a jump to `about:blank` loses the unload request before Playwright's routing sees it, even though the page sends it.

## Layout

| Path | What it holds |
|---|---|
| `playwright.config.mjs` | Browser choice, backend, projects, static server, timeouts, reporters |
| `support/static-server.mjs` | Serves `tracker/` on 127.0.0.1 for the page |
| `support/local-backend.mjs` | The local backend: the Worker code plus the simulated gist |
| `support/cloud.mjs` | The only code that writes cloud state, test user only; the live write budget |
| `support/seed.mjs` | Baseline catalog, recipes, days and helpers (`logCounter`, `dayIn`) |
| `support/fixtures.mjs` | The `tracker` fixture: seeding, guards, page-error checks, and the `TrackerPage` page object |
| `specs/*.spec.mjs` | Scenarios, one file per area |

## Defects the scenarios guard

| Area | Defect | Spec |
|---|---|---|
| Add new item | "Store for later" threw a ReferenceError, so nothing was stored | add-new-item |
| Add new item | A stored item kept only kcal, protein, sat fat, water and caffeine | add-new-item |
| Catalog | Clearing a bar filter did not re-collapse a bar that was collapsed before filtering | catalog-layout |
| Counters | Logging a timed item left its "past time" flag until the next minute tick | counters-and-totals |
| Counters | Items counted in pieces showed grams in their row titles | counters-and-totals |
| Edit panel | A serving added with the panel's Add button was not saved until the panel closed | catalog-edit-panel |
| Edit panel | Items with a 30 g `amount` showed per-gram values under "Per 100 g" | catalog-edit-panel |
| Edit panel | Opening and closing an item without edits rewrote it and sent a write | catalog-edit-panel |
| Recipe maker | The ingredient picker offered archived items and water | recipes-maker |
| Recipe maker | A one-off recipe saved from the maker could not be logged the same day | recipes-maker |
| Recipe maker | Recipes used as ingredients mixed up "default serving" and "whole batch" | recipes-maker |
| Recipe editing | The Preserve switch never rendered | recipes-editing |
| Recipe editing | Changing, adding or removing an ingredient left the full-recipe size, the title and the "1 batch ≈ N g" hint stale until the panel closed | recipes-editing, recipes-create-then-change |
| Recipe editing | A portion logged before its recipe changed lost its share of the batch: a logged full recipe turned into a fraction of the corrected one, and its counter box and the day's total disagreed until the panel closed | recipes-create-then-change |
| Recipe editing | Adding an ingredient to a one-off recipe logged today left today's copy without it | recipes-create-then-change |
| Recipe editing | Saving read the 1-decimal box text, so a quarter of another recipe (0.25) was saved as 0.3 | recipes-create-then-change |
| Recipe editing | A recipe inside a recipe was sized by its default serving instead of its batch: its boxes showed a quarter serving, and typing half a serving added half the whole batch | recipes-create-then-change |
| Recipe editing | Adding one serving of another recipe from the edit panel added its whole batch | recipes-create-then-change |
| Recipe editing | Counted ingredients were labelled "(2 units)" and recipe ingredients "(360 units)" | recipes-create-then-change |
| Recipe editing | The full-recipe size counted a multiplier by the source's first serving while its calories used the default serving | recipes-logging, real-data-smoke |
| Recipe editing | Renaming a recipe changed its calories | recipes-editing |
| Recipe editing | A custom portion in g or oz added a fraction of a batch instead of grams | recipes-editing |
| Recipe editing | Editing an inner recipe did not refresh a recipe that contains it | recipes-editing |
| Recipe editing | While an inner recipe's panel was open, a recipe containing it kept its old batch size in its row title unless it was logged | recipes-create-then-change |
| Recipe editing | Editing a recipe changed every past day that logged it (only one-off recipes had a frozen copy, and the recipes nested in them still followed the catalog) | recipes-create-then-change |
| Recipe editing | Logging a recipe on a past day froze nothing there, so a later edit changed that day | recipes-create-then-change |
| Recipe editing | Editing a recipe while viewing a past day changed today's logged portion instead of keeping its share of the batch | recipes-create-then-change |
| Recipe logging | Date navigation did not re-render the catalog, so one-off recipes did not follow the viewed day | recipes-logging |
| Today's log | A past day's one-off recipe entry used the live recipe instead of that day's frozen copy | today-log |
| Supplements | Every-other-day supplements were flagged "past time" on their off days | supplements-and-water |
| Body fat | Female profiles got the male Navy formula | weight-body-mood |
| Weight | The empty weight summary pointed to a header that does not exist | weight-body-mood |
| Profile | BMR and TDEE did not update when today's weight was logged | profile |
| Profile | The date format and imperial units were not applied to the weight summary | profile |
| Profile | Switching to 12-hour time did not update Today's log until the next minute tick | profile |
| History | Deleting a past day had no confirmation | history-and-dates |
| History | Archiving an item removed it from past days' totals | history-and-dates |
| Dates | A page left open over midnight kept logging onto the previous day | history-and-dates |
| Weekly tracker | The mercury limit ignored body weight | history-and-dates |
| Weekly tracker | The weight-gain warning hard-coded a 1,400 kcal cut instead of the profile goal | history-and-dates |
| Weekly tracker | A 0.93 kg/week loss was described as outside the 0.5 to 1.0 kg/wk window | history-and-dates |
| Sync | Nothing retried a failed save once the connection was back | sync-and-persistence |
| Sync | The Offline banner stayed after saving worked again | sync-and-persistence |
| Sync | Retry replaced local state with the cloud and never sent queued changes | sync-and-persistence |
| Sync | Reloading while saves failed dropped the queued changes | sync-and-persistence |
| Sync | The unload beacon resent ops a save already in flight was carrying, so a tap could count twice | sync-and-persistence |
| Sync | A tap whose save was still in flight when the tab died was sent again by the next visit and counted twice (each op carries an opId; the Worker skips an opId it already applied) | sync-and-persistence |
| Sync | After a 412 conflict the second device's own change disappeared from its screen | sync-and-persistence |
| Sync | A stale device that merely opened and closed an item overwrote another device's edit of it | sync-and-persistence |
| Catalog links | A catalog link opened in an already-open tab did nothing | hash-commands |
| Real data | Full-recipe rows are checked against their ingredients, and every + against what its row shows, on the local backup | real-data-smoke |