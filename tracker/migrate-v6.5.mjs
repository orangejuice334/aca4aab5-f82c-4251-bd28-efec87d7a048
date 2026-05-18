#!/usr/bin/env node
// v6.5 schedule-per-serving migration. One-shot.
//
// Consolidates supplements/water that are the same logical item taken at
// multiple times into a single catalog item whose displayUnits[] each carry
// a time + frequency. Toggle keys for past days are rewritten from bare
// keys (`omega3_am`) to compound keys (`omega3#08:00`) so check-history
// survives the rename.

const WORKER = 'https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev';
const USER = 'lg';

// Per-1-native macros are unchanged from the current per-pill / per-ml values.
const NEW_ITEMS = {
  omega3: {
    name: 'Omega-3 (fish oil)',
    category: 'supplements',
    kcal: 10, fat: 1.1667, sf: 0.1667, omega3: 720,
    displayUnits: [
      { label: 'AM',    multiplier: 1, time: '08:00', frequency: 'daily', default: true, amount: 1, unit: 'g' },
      { label: 'Lunch', multiplier: 1, time: '12:30', frequency: 'daily',                  amount: 1, unit: 'g' },
      { label: 'PM',    multiplier: 1, time: '19:00', frequency: 'daily',                  amount: 1, unit: 'g' },
    ],
    notes: 'MAV Nutrition Triple Strength Omega-3, 3 softgels daily split across AM/Lunch/PM. 720 mg combined EPA+DHA per softgel; daily total 2,160 mg = cardiovascular outcome trial dose. Splitting across meals (1) gives each dose dietary fat for micelle formation = better absorption; (2) eliminates the fish-burps that 3-at-once tends to cause; (3) keeps tissue EPA/DHA saturation steady across the day. Anchovy-sourced — low mercury.',
    defaultMeasuredIn: 'g',
    amount: { value: 0, unit: 'g' },
  },
  two_per_day: {
    name: 'Life Extension Two-Per-Day',
    category: 'supplements',
    vitA: 750, vitC: 250, vitD: 25, vitE: 50, vitK: 100,
    b1: 37.5, b2: 25, b3: 50, b5: 50, b6: 37.5, b7: 150, b9: 200, b12: 300,
    choline: 25, calcium: 25, magnesium: 50, zinc: 12.5, selenium: 100,
    copper: 0.5, manganese: 1, iodine: 75, chromium: 100, molybdenum: 50,
    displayUnits: [
      { label: 'AM (1 of 2)', multiplier: 1, time: '08:00', frequency: 'daily', default: true, amount: 1, unit: 'g' },
      { label: 'PM (2 of 2)', multiplier: 1, time: '19:00', frequency: 'daily',                  amount: 1, unit: 'g' },
    ],
    notes: 'Life Extension Two-Per-Day. Multivitamin baseline — covers micronutrients you might miss on a 1,650 kcal diet (limited variety = small deficiency risk). Notable inclusions: zinc 25 mg, B-complex, K2, lutein. Split AM (with breakfast) + PM (with dinner): the iron + zinc + B-vitamin load is gentler on the stomach split, and B-vitamin absorption saturates per dose so spreading captures more.',
    defaultMeasuredIn: 'g',
    amount: { value: 0, unit: 'g' },
  },
  water: {
    name: 'Water',
    category: 'water',
    water: 1,
    displayUnits: [
      { label: 'wake',      multiplier: 500, time: '07:00', frequency: 'daily', default: true, amount: 500, unit: 'ml' },
      { label: 'pre-lunch', multiplier: 500, time: '12:30', frequency: 'daily',                  amount: 500, unit: 'ml' },
      { label: 'afternoon', multiplier: 500, time: '16:00', frequency: 'daily',                  amount: 500, unit: 'ml' },
      { label: 'dinner',    multiplier: 500, time: '19:00', frequency: 'daily',                  amount: 500, unit: 'ml' },
    ],
    defaultMeasuredIn: 'g',
    amount: { value: 0, unit: 'g' },
  },
};

// Items that stay one-of-a-kind but need item.time → displayUnits[0].time.
// Each `displayUnitOverride` provides any label/multiplier tweaks plus the
// schedule fields; the rest of the item (notes, macros, etc.) is preserved.
const SINGLE_TIME_MIGRATIONS = [
  // key, displayUnitOverride
  ['creatine',                  { label: '1 scoop',    multiplier: 5, time: '08:00', frequency: 'daily', default: true, amount: 5, unit: 'g' }],
  ['flonase',                   { label: '1 spray',    multiplier: 1, time: '08:00', frequency: 'daily', default: true, amount: 1, unit: 'g' }],
  ['d3',                        { label: '1 softgel',  multiplier: 1, time: '08:00', frequency: 'alternate', default: true, amount: 1, unit: 'g' }],
  ['4_doctor_s_best_magnesiu',  { label: '800 mg total', multiplier: 4, time: '19:00', frequency: 'daily', default: true, amount: 4, unit: 'g' }],
  ['wegovy',                    { label: '1 pill',     multiplier: 1, time: '07:30', frequency: 'daily', default: true, amount: 1, unit: 'g' }],
  ['soy_coffee',                { label: '1 cup',      multiplier: 250, time: '09:00', frequency: 'daily', default: true, amount: 250, unit: 'g' }],
];

const DELETE_KEYS = [
  'omega3_am', 'omega3_noon', 'omega3_pm',
  'multi1', 'multi2',
  'water_wake', 'water_prelunch', 'water_afternoon', 'water_dinner',
];

// Past-day toggle rewrites: { oldKey: newKey }. Compound keys use the time
// of the consolidated-item's matching scheduled serving.
const TOGGLE_RENAMES = {
  // omega3
  omega3_am:   'omega3#08:00',
  omega3_noon: 'omega3#12:30',
  omega3_pm:   'omega3#19:00',
  // multi (now two_per_day)
  multi1: 'two_per_day#08:00',
  multi2: 'two_per_day#19:00',
  // water
  water_wake:      'water#07:00',
  water_prelunch:  'water#12:30',
  water_afternoon: 'water#16:00',
  water_dinner:    'water#19:00',
  // single-time items: rename to compound key tied to the new variant time
  creatine:                 'creatine#08:00',
  flonase:                  'flonase#08:00',
  d3:                       'd3#08:00',
  '4_doctor_s_best_magnesiu': '4_doctor_s_best_magnesiu#19:00',
  wegovy:                   'wegovy#07:30',
  soy_coffee:               'soy_coffee#09:00',
};

async function fetchState() {
  const r = await fetch(`${WORKER}/state?user=${USER}`);
  if (!r.ok) throw new Error(`state ${r.status}`);
  const g = await r.json();
  const file = g.files['tracker-state.json'];
  return JSON.parse(file.content).state;
}

async function sendOps(ops) {
  const r = await fetch(`${WORKER}/ops?user=${USER}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`ops ${r.status} ${txt.slice(0, 500)}`);
  const body = JSON.parse(txt);
  if (!body.ok) throw new Error(`ops errors: ${JSON.stringify(body.errors)}`);
  return body;
}

async function main() {
  const state = await fetchState();
  const items = state.userCatalog && state.userCatalog.items || {};
  const ts = new Date().toISOString();

  const ops = [];

  // 1. Consolidated items.
  for (const [k, item] of Object.entries(NEW_ITEMS)) {
    ops.push({ type: 'catalog_add', key: k, item, ts });
  }

  // 2. Single-time supplements: rebuild the full item with the migrated
  // schema (no item.time/frequency, schedule lives on the default variant).
  for (const [k, du] of SINGLE_TIME_MIGRATIONS) {
    const cur = items[k];
    if (!cur) continue;
    const next = { ...cur };
    delete next.time;
    delete next.frequency;
    next.displayUnits = [du];
    ops.push({ type: 'catalog_add', key: k, item: next, ts });
  }

  // 3. Delete superseded items.
  for (const k of DELETE_KEYS) {
    if (items[k]) ops.push({ type: 'catalog_delete', key: k, ts });
  }

  // 4. Rewrite past-day toggle keys. For every day that has an old-key
  // toggle, unset the old key + set the new key with the same value.
  const days = state.days || {};
  for (const date of Object.keys(days)) {
    const togs = days[date].toggles || {};
    for (const [oldKey, newKey] of Object.entries(TOGGLE_RENAMES)) {
      if (togs[oldKey] !== undefined) {
        const val = !!togs[oldKey];
        ops.push({ type: 'toggle_unset', date, key: oldKey, ts });
        ops.push({ type: 'toggle_set',   date, key: newKey, value: val, ts });
      }
    }
  }

  console.log(`Sending ${ops.length} ops...`);
  const r = await sendOps(ops);
  console.log('OK', r._savedAt || '(no _savedAt)');
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
