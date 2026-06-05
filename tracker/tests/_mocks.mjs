// Shared mocks: stand-in catalog items so integration tests don't need
// to talk to the worker. Items mirror the real per-1-native macro schema.

export function mkCatalog(overrides = {}) {
  const items = {
    // Mass-measured items (defaultMeasuredIn: 'g')
    salmon_atlantic_cooked: {
      name: 'Salmon Atlantic, cooked dry heat',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 2.08, p: 0.221, fat: 0.124, sf: 0.030, cholesterol: 0.63, sodium: 0.59,
      water: 0.65, omega3: 23, calcium: 0.12, iron: 0.0034, potassium: 3.84,
      mercury: 0.014, purines: 1.1,
      displayUnits: [
        { label: '100 g', amount: 100, unit: 'g', multiplier: 100 },
        { label: '1 fillet (170 g)', amount: 170, unit: 'g', multiplier: 170 },
        { label: '3 oz portion', amount: 85, unit: 'g', multiplier: 85, default: true },
      ],
    },
    string_cheese: {
      name: 'Mozzarella stick string cheese',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 80 / 21, p: 7 / 21, sf: 2.5 / 21, sodium: 200 / 21,
      displayUnits: [
        { label: '1 stick', amount: 21, unit: 'g', multiplier: 21, default: true },
      ],
    },
    turkey_breast_smithfield: {
      name: 'Turkey breast oven roasted',
      brand: 'Smithfield Safeway',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 1.0, p: 0.18, sf: 0.01,
      displayUnits: [
        { label: '1 pkg', amount: 224, unit: 'g', multiplier: 224 },
        { label: '1 slice', amount: 28, unit: 'g', multiplier: 28, default: true },
      ],
    },
    egg_substitute: {
      name: 'Egg substitute',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 0.5, p: 0.10, sf: 0,
      displayUnits: [
        { label: '1 carton', amount: 920, unit: 'g', multiplier: 920, default: true },
        { label: '1 cup', amount: 245, unit: 'g', multiplier: 245 },
        { label: '100 g', amount: 100, unit: 'g', multiplier: 100 },
        { label: '3 Tbsp (label)', amount: 46, unit: 'g', multiplier: 46 },
      ],
    },
    // Volume-measured (ml)
    soy_milk_unsw: {
      name: 'Soy milk unsweetened',
      category: 'liquids',
      defaultMeasuredIn: 'ml',
      density_g_per_ml: 1.03,
      kcal: 0.4, p: 0.03, fat: 0.018, sf: 0.0024, water: 0.94, calcium: 1.23, potassium: 1.18,
      displayUnits: [
        { label: '1 cup', amount: 240, unit: 'ml', multiplier: 240, default: true },
        { label: '1 tbsp', amount: 15, unit: 'ml', multiplier: 15 },
        { label: '1 carton (946 ml)', amount: 946, unit: 'ml', multiplier: 946 },
      ],
    },
    // Discrete-unit supplements
    omega3_softgel: {
      name: 'Omega-3 (fish oil)',
      category: 'supplements',
      defaultMeasuredIn: 'units',
      kcal: 10, p: 0, fat: 1.1667, sf: 0.1667, omega3: 720,
      displayUnits: [
        { label: 'AM', multiplier: 1, time: '08:00', frequency: 'daily', default: true, amount: 1, unit: 'g' },
        { label: 'Lunch', multiplier: 1, time: '12:30', frequency: 'daily', amount: 1, unit: 'g' },
        { label: 'PM', multiplier: 1, time: '19:00', frequency: 'daily', amount: 1, unit: 'g' },
      ],
    },
    caffeine_capsule: {
      name: 'Caffeine anhydrous 200 mg capsule',
      category: 'supplements',
      defaultMeasuredIn: 'units',
      kcal: 0, caffeine: 200,
      displayUnits: [
        { label: 'morning', multiplier: 1, time: '08:00', frequency: 'daily', default: true },
      ],
    },
    // Item with no displayUnits (uses item.amount fallback)
    bare_item: {
      name: 'Bare item',
      category: 'items',
      defaultMeasuredIn: 'g',
      kcal: 5, p: 1,
      amount: { value: 10, unit: 'g' },
    },
    // Water (special, filtered from recipe dropdown)
    water: {
      name: 'Water',
      category: 'water',
      defaultMeasuredIn: 'ml',
      kcal: 0, water: 1,
      displayUnits: [{ label: '500 ml', multiplier: 500, default: true }],
    },
    // Recipe: scrambled feggs
    scrambled_feggs: {
      name: 'Scrambled feggs',
      category: 'recipes',
      ingredients: [
        { itemKey: 'string_cheese', amount: 84 },
        { itemKey: 'egg_substitute', amount: 828 },
      ],
      displayUnits: [
        { label: 'full recipe', multiplier: 912, amount: 912, unit: 'g', default: true, locked: true },
      ],
    },
    // Empty recipe (no ingredients yet)
    empty_recipe: {
      name: 'Empty recipe',
      category: 'recipes',
      ingredients: [],
      displayUnits: [{ label: 'full recipe', multiplier: 0, default: true, locked: true }],
    },
    // Cyclic recipe pair for cycle protection test
    cycle_a: {
      name: 'Cycle A',
      category: 'recipes',
      ingredients: [{ itemKey: 'cycle_b', multiplier: 1 }],
      displayUnits: [{ label: 'full recipe', multiplier: 100, default: true, locked: true }],
    },
    cycle_b: {
      name: 'Cycle B',
      category: 'recipes',
      ingredients: [{ itemKey: 'cycle_a', multiplier: 1 }],
      displayUnits: [{ label: 'full recipe', multiplier: 100, default: true, locked: true }],
    },
  };
  for (const [k, v] of Object.entries(overrides)) items[k] = v;
  return items;
}

// Mock day-bucket store for history-helper tests.
export function mkDays(spec) {
  const out = {};
  for (const [date, b] of Object.entries(spec)) out[date] = Object.assign({}, b);
  return out;
}
