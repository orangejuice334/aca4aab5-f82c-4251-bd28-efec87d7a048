// tracker-core.mjs
// Pure (no-DOM, no-network) logic extracted from track.html so it can be
// unit-tested under Node. Every function here is exported and idempotent;
// any change in this file must (a) be mirrored in track.html's inline
// copy of the same function, and (b) ship with a test in tracker/tests/.
// The module exists so the algorithms behind catalog rows, recipes,
// ingredient computation, and display formatting can be regression-checked
// without spinning up a browser.

// ---------------------------------------------------------------------------
// Nutrient schema
// ---------------------------------------------------------------------------

export const NUTRIENT_DEFS = [
  { key: 'kcal',         label: 'kcal',            unit: '',     dec: 0, group: 'macros' },
  { key: 'p',            label: 'Protein',         unit: 'g',    dec: 0, group: 'macros' },
  { key: 'sf',           label: 'Sat. Fat',        unit: 'g',    dec: 1, group: 'macros' },
  { key: 'water',        label: 'water',           unit: 'ml',   dec: 0, group: 'macros' },
  { key: 'caffeine',     label: 'caffeine',        unit: 'mg',   dec: 0, group: 'macros' },
  { key: 'carbs',        label: 'Carbs',           unit: 'g',    dec: 0, group: 'macros' },
  { key: 'fiber',        label: 'Fiber',           unit: 'g',    dec: 0, group: 'macros' },
  { key: 'sugar',        label: 'Sugar',           unit: 'g',    dec: 0, group: 'macros' },
  { key: 'fat',          label: 'Fat',             unit: 'g',    dec: 0, group: 'macros' },
  { key: 'transfat',     label: 'Trans Fat',       unit: 'g',    dec: 1, group: 'macros' },
  { key: 'cholesterol',  label: 'Cholesterol',     unit: 'mg',   dec: 0, group: 'macros' },
  { key: 'sodium',       label: 'Sodium',          unit: 'mg',   dec: 0, group: 'macros' },
  { key: 'omega3',       label: 'Omega-3',         unit: 'mg',   dec: 0, group: 'macros' },
  { key: 'purines',      label: 'Purines',         unit: 'mg',   dec: 0, group: 'macros' },
  { key: 'vitA',         label: 'Vit A',           unit: 'mcg',  dec: 0, group: 'vitamins' },
  { key: 'vitC',         label: 'Vit C',           unit: 'mg',   dec: 0, group: 'vitamins' },
  { key: 'vitD',         label: 'Vit D',           unit: 'mcg',  dec: 0, group: 'vitamins' },
  { key: 'vitE',         label: 'Vit E',           unit: 'mg',   dec: 0, group: 'vitamins' },
  { key: 'vitK',         label: 'Vit K',           unit: 'mcg',  dec: 0, group: 'vitamins' },
  { key: 'b1',           label: 'B1 Thiamine',     unit: 'mg',   dec: 1, group: 'vitamins' },
  { key: 'b2',           label: 'B2 Riboflavin',   unit: 'mg',   dec: 1, group: 'vitamins' },
  { key: 'b3',           label: 'B3 Niacin',       unit: 'mg',   dec: 1, group: 'vitamins' },
  { key: 'b5',           label: 'B5 Pantothenic',  unit: 'mg',   dec: 1, group: 'vitamins' },
  { key: 'b6',           label: 'B6',              unit: 'mg',   dec: 1, group: 'vitamins' },
  { key: 'b7',           label: 'B7 Biotin',       unit: 'mcg',  dec: 0, group: 'vitamins' },
  { key: 'b9',           label: 'B9 Folate',       unit: 'mcg',  dec: 0, group: 'vitamins' },
  { key: 'b12',          label: 'B12',             unit: 'mcg',  dec: 1, group: 'vitamins' },
  { key: 'choline',      label: 'Choline',         unit: 'mg',   dec: 0, group: 'vitamins' },
  { key: 'calcium',      label: 'Calcium',         unit: 'mg',   dec: 0, group: 'minerals' },
  { key: 'iron',         label: 'Iron',            unit: 'mg',   dec: 1, group: 'minerals' },
  { key: 'magnesium',    label: 'Magnesium',       unit: 'mg',   dec: 0, group: 'minerals' },
  { key: 'phosphorus',   label: 'Phosphorus',      unit: 'mg',   dec: 0, group: 'minerals' },
  { key: 'potassium',    label: 'Potassium',       unit: 'mg',   dec: 0, group: 'minerals' },
  { key: 'zinc',         label: 'Zinc',            unit: 'mg',   dec: 1, group: 'minerals' },
  { key: 'selenium',     label: 'Selenium',        unit: 'mcg',  dec: 0, group: 'minerals' },
  { key: 'copper',       label: 'Copper',          unit: 'mg',   dec: 2, group: 'minerals' },
  { key: 'manganese',    label: 'Manganese',       unit: 'mg',   dec: 1, group: 'minerals' },
  { key: 'iodine',       label: 'Iodine',          unit: 'mcg',  dec: 0, group: 'minerals' },
  { key: 'chromium',     label: 'Chromium',        unit: 'mcg',  dec: 0, group: 'minerals' },
  { key: 'molybdenum',   label: 'Molybdenum',      unit: 'mcg',  dec: 0, group: 'minerals' },
  { key: 'mercury',      label: 'Mercury',         unit: 'mcg',  dec: 1, group: 'minerals' },
];

export const STORED_NUTRIENT_KEYS = NUTRIENT_DEFS.map(n => n.key);

export function zeroNutrients() {
  const z = {};
  for (const k of STORED_NUTRIENT_KEYS) z[k] = 0;
  return z;
}

export function addNutrients(target, src) {
  for (const k of STORED_NUTRIENT_KEYS) target[k] = (target[k] || 0) + (src[k] || 0);
  return target;
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

export function getDefaultMeasuredIn(item) {
  if (!item) return 'units';
  if (item.defaultMeasuredIn === 'g' || item.defaultMeasuredIn === 'ml' || item.defaultMeasuredIn === 'units') {
    return item.defaultMeasuredIn;
  }
  return 'units';
}

export function isPer100(item) {
  const m = getDefaultMeasuredIn(item);
  return m === 'g' || m === 'ml';
}

export function primaryUnit(item) {
  return (item && item.defaultMeasuredIn === 'ml') ? 'ml' : 'g';
}

// Returns a displayUnits list with `unitsPerServing` mirrored from
// `multiplier`. Every g/ml item (and every recipe) gets a synthetic "1 g"
// (or "1 ml") trailer if not already present, so the catalog row + recipe
// maker always expose a raw native-unit input. The synthetic variant
// carries `synthetic: true` so the variant editor can filter it out.
export function getDisplayUnits(item) {
  const measuredForUnit = getDefaultMeasuredIn(item);
  const isRecipeItem = !!(item && item.category === 'recipes' && Array.isArray(item.ingredients));
  const wantSynthetic = (measuredForUnit === 'g' || measuredForUnit === 'ml' || isRecipeItem);
  const oneNativeLabel = '1 ' + (isRecipeItem && measuredForUnit === 'units' ? 'g' : measuredForUnit);
  if (item && Array.isArray(item.displayUnits) && item.displayUnits.length) {
    const out = item.displayUnits.map(v => {
      if (!v) return v;
      if (typeof v.multiplier === 'number' && v.multiplier > 0) {
        return Object.assign({}, v, { unitsPerServing: v.multiplier });
      }
      return v;
    });
    if (wantSynthetic && !out.some(v => v && (v.unitsPerServing || v.multiplier) === 1)) {
      out.push({ label: oneNativeLabel, unitsPerServing: 1, multiplier: 1, synthetic: true });
    }
    return out;
  }
  const a = (item && item.amount) || {};
  const value = (typeof a.value === 'number') ? a.value : 1;
  const label = a.label || (value + ' ' + (a.unit || (measuredForUnit === 'units' ? 'unit' : measuredForUnit)));
  const head = { label, unitsPerServing: value, multiplier: value };
  if (!wantSynthetic || value === 1) return [head];
  return [head, { label: oneNativeLabel, unitsPerServing: 1, multiplier: 1, synthetic: true }];
}

export function orderVariantsForCatalog(displayUnits) {
  const all = (Array.isArray(displayUnits) ? displayUnits.slice() : []);
  all.sort((a, b) => (b.unitsPerServing || 0) - (a.unitsPerServing || 0));
  const def = all.find(d => d && d.default);
  if (def && all[0] !== def) {
    const idx = all.indexOf(def);
    all.splice(idx, 1);
    all.unshift(def);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Macro scaling
// ---------------------------------------------------------------------------

export function scaleByNative(item, units) {
  if (!item) return zeroNutrients();
  const out = {};
  for (const k of STORED_NUTRIENT_KEYS) out[k] = (item[k] || 0) * (units || 0);
  return out;
}

// computeIngredientMacros and computeItemMacros are mutually recursive via
// the recipe-as-ingredient path. `seen` threads through to prevent cycles.
export function computeIngredientMacros(ing, items, seen) {
  const z = zeroNutrients();
  if (!ing) return z;
  if (!ing.itemKey) {
    const out = {};
    for (const k of STORED_NUTRIENT_KEYS) out[k] = ing[k] || 0;
    return out;
  }
  const item = items[ing.itemKey];
  if (!item) return z;
  if (item.category === 'recipes' && Array.isArray(item.ingredients) && item.ingredients.length) {
    const visited = seen || new Set();
    if (visited.has(item)) return z;
    visited.add(item);
    const batch = computeItemMacros(item, items, visited);
    visited.delete(item);
    let batchFraction = 0;
    if (typeof ing.multiplier === 'number') {
      batchFraction = ing.multiplier;
    } else if (typeof ing.amount === 'number') {
      const canon = getDisplayUnits(item).find(u => u && (/full recipe/i.test(u.label || '') || u.locked))
                  || getDisplayUnits(item)[0];
      const batchGrams = (canon && (canon.multiplier || canon.unitsPerServing)) || 1;
      batchFraction = batchGrams > 0 ? (ing.amount / batchGrams) : 0;
    }
    const out = {};
    for (const k of STORED_NUTRIENT_KEYS) out[k] = (batch[k] || 0) * batchFraction;
    return out;
  }
  let units = 0;
  if (typeof ing.amount === 'number') {
    units = ing.amount;
  } else if (typeof ing.multiplier === 'number') {
    const canon = getDisplayUnits(item)[0];
    units = ing.multiplier * (canon.unitsPerServing || 0);
  }
  return scaleByNative(item, units);
}

export function computeItemMacros(item, items, seen) {
  if (!item) return zeroNutrients();
  if (item.category === 'recipes' && Array.isArray(item.ingredients) && item.ingredients.length) {
    const t = zeroNutrients();
    for (const ing of item.ingredients) addNutrients(t, computeIngredientMacros(ing, items, seen));
    return t;
  }
  const canon = getDisplayUnits(item)[0];
  return scaleByNative(item, canon.unitsPerServing || 0);
}

// Resolve an ingredient to a display-ready object including computed
// macros and a name that mirrors the catalog row format ("Name (Brand)").
export function resolveIngredient(ing, items) {
  if (!ing || typeof ing !== 'object') return null;
  if (ing.itemKey) {
    const item = items[ing.itemKey];
    if (!item) {
      return { name: '(missing item: ' + ing.itemKey + ')', amount: null,
        ...zeroNutrients(), itemKey: ing.itemKey, broken: true, linked: true };
    }
    const macros = computeIngredientMacros(ing, items);
    const brand = (typeof item.brand === 'string' && item.brand.trim()) ? item.brand.trim() : '';
    const displayName = brand ? (item.name + ' (' + brand + ')') : item.name;
    return Object.assign({
      name: displayName,
      itemKey: ing.itemKey,
      amountValue: ing.amount,
      multiplier: ing.multiplier,
      label: ing.label || null,
      linked: true,
    }, macros);
  }
  return Object.assign({
    name: ing.name || '',
    amount: ing.amount || null,
    linked: false,
  }, {
    kcal: ing.kcal || 0, p: ing.p || 0, sf: ing.sf || 0,
    water: ing.water || 0, caffeine: ing.caffeine || 0,
  });
}

// Sum the native-unit total of every ingredient (used by the recipe edit
// panel's auto-recompute of the "full recipe" variant).
export function sumIngredientNativeUnits(ingredients, items) {
  let total = 0;
  for (const ing of (ingredients || [])) {
    if (ing.itemKey) {
      const src = items[ing.itemKey];
      if (!src) continue;
      if (typeof ing.amount === 'number' && ing.amount > 0) {
        total += ing.amount;
      } else if (typeof ing.multiplier === 'number' && ing.multiplier > 0) {
        const srcDef = getDisplayUnits(src).find(u => u && u.default) || getDisplayUnits(src)[0];
        const srcSize = (srcDef && (srcDef.multiplier || srcDef.unitsPerServing)) || 0;
        if (srcSize > 0) total += ing.multiplier * srcSize;
      }
    } else if (ing.amount && typeof ing.amount.value === 'number' && ing.amount.value > 0) {
      const u = (ing.amount.unit || '').toLowerCase();
      if (u === 'g' || u === 'ml') total += ing.amount.value;
    }
  }
  return Math.round(total * 10) / 10;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function dropTrailingZeros(s) {
  if (typeof s !== 'string') s = String(s);
  if (s.indexOf('.') === -1) return s;
  return s.replace(/\.?0+$/, '');
}

export function fmt1(n) {
  if (n == null || !Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 10) / 10;
  if (rounded === Math.floor(rounded)) return String(Math.floor(rounded));
  return rounded.toFixed(1);
}

export function formatSize(n) {
  if (n == null || !Number.isFinite(n)) return '0';
  if (Math.abs(n - Math.round(n)) < 0.01) return String(Math.round(n));
  return (Math.round(n * 10) / 10).toString();
}

export function roundStorage(n) {
  if (n == null || isNaN(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

// "Name (Brand · 1 cup / 240 ml)" style for catalog rows and dropdowns.
export function formatItemDisplayName(item) {
  if (!item) return '';
  const name = item.name || '';
  const brand = (typeof item.brand === 'string' && item.brand.trim()) ? item.brand.trim() : '';
  const isRecipe = item.category === 'recipes' && Array.isArray(item.ingredients) && item.ingredients.length;
  const parts = [];
  if (brand) parts.push(brand);
  if (isRecipe) {
    const variants = getDisplayUnits(item);
    const def = variants.find(v => v && v.default) || variants[0] || null;
    if (def) {
      const dSize = (def.multiplier ?? def.unitsPerServing) || 0;
      if (def.label) parts.push(def.label + (dSize ? ' / ' + fmt1(dSize) + ' g' : ''));
      else if (dSize) parts.push(fmt1(dSize) + ' g');
    }
    return parts.length ? name + ' (' + parts.join(' · ') + ')' : name;
  }
  const amt = item.amount;
  if (!amt || (!amt.value && !amt.label)) {
    return parts.length ? name + ' (' + parts.join(' · ') + ')' : name;
  }
  const v = amt.value, u = amt.unit || '', lbl = amt.label || '';
  let amountParens;
  if (lbl && v && u) amountParens = lbl + ' / ' + fmt1(v) + ' ' + u;
  else if (lbl) amountParens = lbl;
  else if (v && u) amountParens = fmt1(v) + ' ' + u;
  else amountParens = fmt1(v);
  parts.push(amountParens);
  return name + ' (' + parts.join(' · ') + ')';
}

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

export function mostRecentMetricUpTo(days, fieldName, dateKey) {
  if (!days) return null;
  const dates = Object.keys(days).filter(d => d <= dateKey).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const b = days[dates[i]];
    if (b && typeof b[fieldName] === 'number' && b[fieldName] > 0) return b[fieldName];
  }
  return null;
}

// Navy body fat formula (US Navy). Returns body fat % or null when inputs
// are missing or geometry is invalid. Male formula uses waist - neck;
// female adds hips.
export function computeNavyBodyFat(neckCm, waistCm, heightCm, gender, hipsCm) {
  if (!(neckCm > 0) || !(waistCm > 0) || !(heightCm > 0)) return null;
  if (waistCm - neckCm <= 0) return null;
  const log10 = Math.log10;
  if (gender === 'F' || gender === 'female') {
    if (!(hipsCm > 0)) return null;
    if (hipsCm + waistCm - neckCm <= 0) return null;
    const bf = 495 / (1.29579 - 0.35004 * log10(waistCm + hipsCm - neckCm) + 0.22100 * log10(heightCm)) - 450;
    return bf;
  }
  const bf = 495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
  return bf;
}

// BMI = kg / m^2
export function bmiFor(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

// ---------------------------------------------------------------------------
// Pacing window (daily-tracker bar color)
// ---------------------------------------------------------------------------

export const DEFAULT_WINDOW = { start: 7 * 60, end: 21 * 60 };
export const WINDOWS = {
  kcal:          { start: 7 * 60, end: 21 * 60 },
  p:             { start: 7 * 60, end: 21 * 60 },
  carbs:         { start: 7 * 60, end: 21 * 60 },
  fiber:         { start: 7 * 60, end: 21 * 60 },
  sugar:         { start: 7 * 60, end: 21 * 60 },
  fat:           { start: 7 * 60, end: 21 * 60 },
  sf:            { start: 7 * 60, end: 21 * 60 },
  water:         { start: 7 * 60, end: 23 * 60 },
  caffeine:      { start: 7 * 60, end: 12 * 60 },
  _kcal_per_p:   { start: 7 * 60, end: 21 * 60 },
};

export function pacingFraction(metric, nowMinutes) {
  const win = WINDOWS[metric] || DEFAULT_WINDOW;
  if (nowMinutes < win.start) return 0;
  if (nowMinutes >= win.end) return 1;
  return (nowMinutes - win.start) / (win.end - win.start);
}
