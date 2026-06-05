import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeItemMacros,
  computeIngredientMacros,
  sumIngredientNativeUnits,
  resolveIngredient,
  scaleByNative,
  addNutrients,
  zeroNutrients,
  getDisplayUnits,
  STORED_NUTRIENT_KEYS,
} from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

// "Full story" test: a user starts the day, creates a new catalog item,
// then a new recipe, then modifies the recipe, then logs a day's totals.
// One test, many steps; if any step's math drifts the test fails.

test('full story A: create item, create recipe, modify, log a day', () => {
  const items = mkCatalog();

  // Step 1: user adds a new branded catalog item (turkey deli slice).
  items.deli_turkey = {
    name: 'Deli turkey',
    brand: 'Boar\'s Head',
    category: 'items',
    defaultMeasuredIn: 'g',
    kcal: 1.1, p: 0.18, sf: 0.005, sodium: 5,
    displayUnits: [{ label: '1 slice', multiplier: 28, default: true }],
  };
  // formatItemDisplayName resolves to "Name (Brand · ...)" - check via
  // resolveIngredient since that's the ingredient-row read path
  const r = resolveIngredient({ itemKey: 'deli_turkey', amount: 28 }, items);
  assert.equal(r.name, 'Deli turkey (Boar\'s Head)');
  assert.equal(r.kcal, 28 * 1.1);

  // Step 2: user creates a new recipe with two ingredients.
  items.lunch = {
    name: 'Quick lunch',
    category: 'recipes',
    ingredients: [
      { itemKey: 'deli_turkey', amount: 84 },          // 3 slices
      { itemKey: 'string_cheese', amount: 21 },        // 1 stick
    ],
    displayUnits: [{ label: 'full recipe', multiplier: 105, default: true, locked: true }],
  };
  let recipe = computeItemMacros(items.lunch, items);
  const expectedStep2 = 84 * 1.1 + 80; // 92.4 + 80 = 172.4
  assert.ok(Math.abs(recipe.kcal - expectedStep2) < 0.01);

  // Step 3: user modifies the recipe (adds salmon and bumps cheese).
  items.lunch.ingredients[1].amount = 42;            // 2 sticks of cheese
  items.lunch.ingredients.push({ itemKey: 'salmon_atlantic_cooked', amount: 50 });
  // Recipe variant must be recomputed via sumIngredientNativeUnits
  const newTotal = sumIngredientNativeUnits(items.lunch.ingredients, items);
  assert.equal(newTotal, 84 + 42 + 50);
  items.lunch.displayUnits[0].multiplier = newTotal;
  items.lunch.displayUnits[0].amount = newTotal;
  // New macros = 84*1.1 + 160 + 50*2.08 = 92.4 + 160 + 104 = 356.4
  recipe = computeItemMacros(items.lunch, items);
  assert.ok(Math.abs(recipe.kcal - 356.4) < 0.1);

  // Step 4: log a day with the recipe (200 g consumed) plus a custom snack
  // plus a scheduled supplement toggle.
  const day = {
    counters: { 'lunch': 200 },
    customs: [{ name: 'protein bar', kcal: 220, p: 20, sf: 5, water: 0, caffeine: 0, count: 1 }],
    toggles: { 'omega3_softgel#08:00': true },
  };
  // computeTotals reimplemented in tests but using the same primitives:
  const totals = zeroNutrients();
  for (const [k, native] of Object.entries(day.counters)) {
    if (!native) continue;
    const item = items[k];
    if (!item) continue;
    if (item.category === 'recipes') {
      const batch = computeItemMacros(item, items);
      const canon = (item.displayUnits || [])[0];
      const canonG = (canon && (canon.multiplier || canon.unitsPerServing)) || 1;
      const f = native / canonG;
      for (const nk of STORED_NUTRIENT_KEYS) totals[nk] += (batch[nk] || 0) * f;
    } else {
      addNutrients(totals, scaleByNative(item, native));
    }
  }
  for (const c of day.customs) addNutrients(totals, { kcal: (c.kcal || 0) * c.count, p: (c.p || 0) * c.count, sf: (c.sf || 0) * c.count, water: (c.water || 0) * c.count, caffeine: (c.caffeine || 0) * c.count });
  for (const [tk, on] of Object.entries(day.toggles)) {
    if (!on) continue;
    const it = items[tk.split('#')[0]];
    if (it) addNutrients(totals, scaleByNative(it, 1));
  }
  // Lunch 200g out of 176g batch (after step 3) = 200/176 of 356.4 = 405.0
  const lunchG = items.lunch.displayUnits[0].multiplier;
  const expectedKcal = (356.4 * (200 / lunchG)) + 220 + 10;
  assert.ok(Math.abs(totals.kcal - expectedKcal) < 1);
});
