// Deterministic baseline cloud state for the end-to-end scenarios.
//
// Every scenario starts from baselineState() (optionally mutated by the
// scenario) with the page clock installed at FIXED_NOON, so "today" is always
// Mon 2026-06-15 in America/New_York no matter when the suite runs.
//
// Macros are stored the way the app stores them: per native unit (per gram
// for 'g' items, per ml for 'ml' items, per piece for 'units' items). The
// numbers are chosen so every expectation in the specs is easy arithmetic.

export const TODAY = '2026-06-15';          // a Monday
export const TIMEZONE_OFFSET = '-04:00';    // EDT in June, matches timezoneId America/New_York

// Calendar arithmetic on date keys, independent of the host time zone.
export function dayOffset(offsetDays, fromDate = TODAY) {
  const [year, month, day] = fromDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}
export const YESTERDAY = dayOffset(-1);

// A Date for `hhmm` local (EDT) time on `dateKey`.
export function localTime(hhmm, dateKey = TODAY) {
  return new Date(`${dateKey}T${hhmm}:00${TIMEZONE_OFFSET}`);
}
export const FIXED_NOON = localTime('12:00');
export const isoAt = (hhmm, dateKey = TODAY) => localTime(hhmm, dateKey).toISOString();

export const GOALS = { kcal: 1650, p: 184, sf: 12, water: 3200, caffeine: 400 };
// kcal per gram of protein the app treats as the daily cutoff.
export const TARGET_RATIO = GOALS.kcal / GOALS.p; // 8.967…

export const CATEGORIES = [
  { key: 'items', label: 'Items' },
  { key: 'liquids', label: 'Liquids' },
  { key: 'small_portions', label: 'Small portions' },
  { key: 'recipes', label: 'Recipes and Meals' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'water', label: 'Water' },
  { key: 'uncategorized', label: 'Uncategorized' },
];

export function baselineItems() {
  return {
    // 200 g breast = 330 kcal, 62 g protein, 2 g sat fat, 130 ml water.
    chicken_breast: {
      name: 'Chicken breast', brand: 'Test Farms', category: 'items', defaultMeasuredIn: 'g',
      kcal: 1.65, p: 0.31, sf: 0.01, water: 0.65,
      displayUnits: [{ label: '1 breast', multiplier: 200, default: true }, { label: '100 g', multiplier: 100 }],
    },
    // 160 g cup = 208 kcal, 4 g protein.
    rice_cooked: {
      name: 'White rice', category: 'items', defaultMeasuredIn: 'g',
      kcal: 1.3, p: 0.025, sf: 0.001, water: 0.68,
      displayUnits: [{ label: '1 cup', multiplier: 160, default: true }],
    },
    // 15 ml tablespoon = 120 kcal, 2.1 g sat fat, no protein.
    olive_oil: {
      name: 'Olive oil', category: 'items', defaultMeasuredIn: 'ml', density_g_per_ml: 0.9,
      kcal: 8, sf: 0.14,
      displayUnits: [{ label: '1 tbsp', multiplier: 15, default: true }],
    },
    // Discrete item whose DEFAULT serving (2 eggs) is not its FIRST serving.
    // 1 egg = 70 kcal, 6 g protein, 1.5 g sat fat.
    egg_large: {
      name: 'Egg', category: 'items', defaultMeasuredIn: 'units',
      kcal: 70, p: 6, sf: 1.5, water: 37,
      displayUnits: [{ label: '1 egg', multiplier: 1 }, { label: '2 eggs', multiplier: 2, default: true }],
    },
    // Three linked fraction servings. 340 g half tub = 204 kcal, 34 g protein.
    greek_yogurt: {
      name: 'Greek yogurt', category: 'items', defaultMeasuredIn: 'g',
      kcal: 0.6, p: 0.1,
      displayUnits: [
        { label: '1 tub', multiplier: 680 },
        { label: '1/2 tub', multiplier: 340, default: true },
        { label: '1/4 tub', multiplier: 170 },
      ],
    },
    // 330 ml bottle = 165 kcal, 33 g protein, 297 ml water.
    protein_shake: {
      name: 'Protein shake', category: 'liquids', defaultMeasuredIn: 'ml',
      kcal: 0.5, p: 0.1, water: 0.9,
      displayUnits: [{ label: '1 bottle', multiplier: 330, default: true }],
    },
    // 240 ml cup = 96 mg caffeine.
    black_coffee: {
      name: 'Black coffee', category: 'liquids', defaultMeasuredIn: 'ml',
      kcal: 0.01, caffeine: 0.4, water: 0.99,
      displayUnits: [{ label: '1 cup', multiplier: 240, default: true }],
    },
    // Timed food: flagged "past time" when not logged within an hour of 09:00.
    // 40 g bar = 200 kcal, 20 g protein, 2 g sat fat.
    protein_bar: {
      name: 'Protein bar', category: 'small_portions', defaultMeasuredIn: 'g', time: '09:00',
      kcal: 5, p: 0.5, sf: 0.05,
      displayUnits: [{ label: '1 bar', multiplier: 40, default: true }],
    },
    vitamin_d: {
      name: 'Vitamin D3', category: 'supplements', defaultMeasuredIn: 'units', vitD: 25,
      displayUnits: [{ label: '1 capsule', multiplier: 1, default: true, time: '08:00', frequency: 'daily' }],
    },
    magnesium: {
      name: 'Magnesium', category: 'supplements', defaultMeasuredIn: 'units', magnesium: 200,
      displayUnits: [
        { label: 'AM', multiplier: 1, time: '08:00', frequency: 'daily' },
        { label: 'PM', multiplier: 1, time: '21:00', frequency: 'daily', default: true },
      ],
    },
    // Unscheduled supplement: counted through its catalog row. 100 mg caffeine per pill.
    caffeine_pill: {
      name: 'Caffeine pill', category: 'supplements', defaultMeasuredIn: 'units', caffeine: 100,
      displayUnits: [{ label: '1 pill', multiplier: 1, default: true }],
    },
    water_bottle: {
      name: 'Water bottle', category: 'water', defaultMeasuredIn: 'ml', water: 1,
      displayUnits: [
        { label: 'Morning', multiplier: 500, default: true, time: '10:00', frequency: 'daily' },
        { label: 'Afternoon', multiplier: 750, time: '15:00', frequency: 'daily' },
      ],
    },
    // Linked recipe. Batch = 375 g, 658 kcal, 66 g protein.
    chicken_rice_bowl: {
      name: 'Chicken rice bowl', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [
        { itemKey: 'chicken_breast', amount: 200 },
        { itemKey: 'rice_cooked', amount: 160 },
        { itemKey: 'olive_oil', amount: 15 },
      ],
      displayUnits: [
        { label: 'full recipe', multiplier: 375, amount: 375, unit: 'g', default: true, locked: true },
        { label: '1/2 bowl', multiplier: 187.5, amount: 187.5, unit: 'g' },
      ],
    },
    // Recipe with a multiplier-linked discrete ingredient: 1 × the egg's
    // default serving (2 eggs = 140 kcal) + 5 ml oil (40 kcal) = 180 kcal.
    // Full recipe = 6, the size the recipe maker itself stores for it.
    egg_scramble: {
      name: 'Egg scramble', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [{ itemKey: 'egg_large', multiplier: 1 }, { itemKey: 'olive_oil', amount: 5 }],
      displayUnits: [{ label: 'full recipe', multiplier: 6, amount: 6, unit: 'g', default: true, locked: true }],
    },
    // Batch = 1440 g, 2152 kcal, 264 g protein. Default serving is a quarter.
    meal_prep_slab: {
      name: 'Meal prep slab', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [{ itemKey: 'chicken_breast', amount: 800 }, { itemKey: 'rice_cooked', amount: 640 }],
      displayUnits: [
        { label: 'full recipe', multiplier: 1440, amount: 1440, unit: 'g', locked: true },
        { label: '1 serving', multiplier: 360, amount: 360, unit: 'g', default: true },
      ],
    },
    // Recipe made only of inline (non-catalog) ingredients. One plate = the
    // whole plate = 250 kcal, 5 g protein, 7.5 g sat fat.
    inline_breakfast: {
      name: 'Toast and butter', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [
        { name: 'Toast', kcal: 150, p: 5, sf: 0.5, water: 0, caffeine: 0, amount: { value: 2, unit: 'slices' } },
        { name: 'Butter', kcal: 100, p: 0, sf: 7, water: 0, caffeine: 0, amount: { value: 14, unit: 'g' } },
      ],
      displayUnits: [{ label: '1 plate', multiplier: 1, amount: 1, unit: 'g', default: true }],
    },
    // Recipe containing a quarter batch of another recipe: 538 + 40 = 578 kcal.
    recipe_in_recipe: {
      name: 'Slab bowl with oil', category: 'recipes', defaultMeasuredIn: 'units',
      ingredients: [{ itemKey: 'meal_prep_slab', multiplier: 0.25 }, { itemKey: 'olive_oil', amount: 5 }],
      displayUnits: [{ label: 'full recipe', multiplier: 365, amount: 365, unit: 'g', default: true, locked: true }],
    },
    // Non-preserve ("one-off") recipe. Batch = 200 g, 295 kcal, 33.5 g protein.
    one_off_lunch: {
      name: 'One-off lunch', category: 'recipes', defaultMeasuredIn: 'units', preserve: false,
      ingredients: [{ itemKey: 'chicken_breast', amount: 100 }, { itemKey: 'rice_cooked', amount: 100 }],
      displayUnits: [{ label: 'full recipe', multiplier: 200, amount: 200, unit: 'g', default: true, locked: true }],
    },
    old_granola: {
      name: 'Old granola', category: 'items', defaultMeasuredIn: 'g', archived: true, prevCategory: 'items',
      kcal: 4.5, p: 0.1,
      displayUnits: [{ label: '1 bowl', multiplier: 60, default: true }],
    },
  };
}

export function emptyDay() {
  return { toggles: {}, counters: {}, customs: [], toggleMeta: {}, counterMeta: {} };
}

export function baselineProfile() {
  return {
    displayName: 'Test',
    fullName: 'Test user',
    heightCm: 183,
    ageYears: 42,
    sex: 'M',
    activityLevel: 'light',
    startWeightKg: 102,
    targetWeightKg: 88,
    goals: { ...GOALS },
    displayedNutrients: ['kcal', 'p', 'sf', 'water', 'caffeine', '_kcal_per_p'],
    units: { weight: 'kg', height: 'cm' },
    display: { unitDisplay: 'metric', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' },
    disabledWarnings: [],
  };
}

export function baselineState() {
  const items = baselineItems();
  const yesterday = emptyDay();
  yesterday.counters.one_off_lunch = 200;
  yesterday.counterMeta.one_off_lunch = isoAt('13:00', YESTERDAY);
  yesterday.recipeSnapshots = { one_off_lunch: JSON.parse(JSON.stringify(items.one_off_lunch)) };
  yesterday.weight = 89.2;
  yesterday.weightMeta = isoAt('07:00', YESTERDAY);
  const weekAgo = emptyDay();
  weekAgo.weight = 90.0;
  weekAgo.weightMeta = isoAt('07:00', dayOffset(-7));
  return {
    days: { [dayOffset(-7)]: weekAgo, [YESTERDAY]: yesterday },
    savedItems: [],
    profile: baselineProfile(),
    sortMode: 'category',
    collapsedGroups: {},
    userCatalog: { items, categories: CATEGORIES.map(category => ({ ...category })) },
  };
}

// Ensure a day bucket exists in a seed state and return it.
export function dayIn(state, dateKey) {
  if (!state.days[dateKey]) state.days[dateKey] = emptyDay();
  return state.days[dateKey];
}

// Log `grams` (native units) of `key` on `dateKey` at local `hhmm`.
export function logCounter(state, key, grams, { dateKey = TODAY, at = '08:00' } = {}) {
  const day = dayIn(state, dateKey);
  day.counters[key] = grams;
  day.counterMeta[key] = isoAt(at, dateKey);
  return state;
}

// Nutrients of `grams` native units of a baseline item (non-recipe items only).
export function nutrientsOf(itemKey, units) {
  const item = baselineItems()[itemKey];
  const out = {};
  for (const [field, value] of Object.entries(item)) {
    if (typeof value === 'number' && !['multiplier', 'density_g_per_ml'].includes(field)) out[field] = value * units;
  }
  return out;
}

// Batch macros of the baseline recipes, spelled out so expectations read
// as plain numbers in the specs.
export const RECIPE_BATCH = {
  chicken_rice_bowl: { grams: 375, kcal: 658, p: 66, sf: 4.26 },
  egg_scramble: { kcal: 180, p: 12, sf: 3.7 },
  meal_prep_slab: { grams: 1440, kcal: 2152, p: 264, sf: 8.64 },
  inline_breakfast: { kcal: 250, p: 5, sf: 7.5 },
  recipe_in_recipe: { grams: 365, kcal: 578, p: 66 },
  one_off_lunch: { grams: 200, kcal: 295, p: 33.5 },
};
