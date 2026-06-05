import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NUTRIENT_DEFS, STORED_NUTRIENT_KEYS, zeroNutrients, addNutrients } from '../lib/tracker-core.mjs';

test('NUTRIENT_DEFS has the five hot macros first', () => {
  assert.equal(NUTRIENT_DEFS[0].key, 'kcal');
  assert.equal(NUTRIENT_DEFS[1].key, 'p');
  assert.equal(NUTRIENT_DEFS[2].key, 'sf');
  assert.equal(NUTRIENT_DEFS[3].key, 'water');
  assert.equal(NUTRIENT_DEFS[4].key, 'caffeine');
});

test('STORED_NUTRIENT_KEYS mirrors NUTRIENT_DEFS in order', () => {
  assert.deepEqual(STORED_NUTRIENT_KEYS, NUTRIENT_DEFS.map(n => n.key));
});

test('every nutrient def has key, label, unit, dec, group', () => {
  for (const def of NUTRIENT_DEFS) {
    assert.ok(typeof def.key === 'string' && def.key.length > 0, 'key');
    assert.ok(typeof def.label === 'string' && def.label.length > 0, 'label');
    assert.ok(typeof def.unit === 'string', 'unit');
    assert.ok(typeof def.dec === 'number' && def.dec >= 0, 'dec');
    assert.ok(['macros', 'vitamins', 'minerals', 'computed'].includes(def.group), 'group');
  }
});

test('nutrient keys are unique', () => {
  const set = new Set(STORED_NUTRIENT_KEYS);
  assert.equal(set.size, STORED_NUTRIENT_KEYS.length);
});

test('zeroNutrients returns a fresh object with every key at 0', () => {
  const z = zeroNutrients();
  for (const k of STORED_NUTRIENT_KEYS) assert.equal(z[k], 0);
});

test('zeroNutrients calls return independent objects', () => {
  const a = zeroNutrients();
  a.kcal = 999;
  const b = zeroNutrients();
  assert.equal(b.kcal, 0);
});

test('addNutrients accumulates keys in place and returns target', () => {
  const t = zeroNutrients();
  const r = addNutrients(t, { kcal: 100, p: 5, sodium: 50 });
  assert.strictEqual(r, t);
  assert.equal(t.kcal, 100);
  assert.equal(t.p, 5);
  assert.equal(t.sodium, 50);
});

test('addNutrients tolerates missing keys on the src', () => {
  const t = zeroNutrients();
  addNutrients(t, {});
  for (const k of STORED_NUTRIENT_KEYS) assert.equal(t[k], 0);
});

test('addNutrients ignores non-nutrient keys on src', () => {
  const t = zeroNutrients();
  addNutrients(t, { kcal: 50, unrelatedField: 'noise' });
  assert.equal(t.kcal, 50);
  assert.equal(t.unrelatedField, undefined);
});

test('addNutrients is additive across calls', () => {
  const t = zeroNutrients();
  addNutrients(t, { kcal: 100 });
  addNutrients(t, { kcal: 25, p: 3 });
  assert.equal(t.kcal, 125);
  assert.equal(t.p, 3);
});
