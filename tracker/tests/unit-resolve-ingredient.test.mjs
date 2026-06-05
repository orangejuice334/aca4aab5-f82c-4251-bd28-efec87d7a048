import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIngredient } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('resolveIngredient on a linked item returns name with brand suffix', () => {
  const items = mkCatalog();
  const r = resolveIngredient({ itemKey: 'turkey_breast_smithfield', amount: 56 }, items);
  assert.equal(r.name, 'Turkey breast oven roasted (Smithfield Safeway)');
});

test('resolveIngredient returns plain name when brand missing', () => {
  const items = mkCatalog();
  const r = resolveIngredient({ itemKey: 'egg_substitute', amount: 100 }, items);
  assert.equal(r.name, 'Egg substitute');
});

test('resolveIngredient on missing itemKey marks broken with the literal key', () => {
  const r = resolveIngredient({ itemKey: 'missing_xyz', amount: 10 }, mkCatalog());
  assert.equal(r.broken, true);
  assert.ok(r.name.includes('missing_xyz'));
});

test('resolveIngredient on null returns null', () => {
  assert.equal(resolveIngredient(null, mkCatalog()), null);
});

test('resolveIngredient on flat ingredient returns linked: false', () => {
  const r = resolveIngredient({ name: 'salt to taste', kcal: 0 }, mkCatalog());
  assert.equal(r.linked, false);
  assert.equal(r.name, 'salt to taste');
});

test('resolveIngredient surfaces macros on the result object', () => {
  const items = mkCatalog();
  const r = resolveIngredient({ itemKey: 'salmon_atlantic_cooked', amount: 100 }, items);
  assert.ok(Math.abs(r.kcal - 208) < 0.01);
  assert.ok(Math.abs(r.p - 22.1) < 0.01);
});

test('resolveIngredient for recipe-as-ingredient returns scaled macros', () => {
  const items = mkCatalog();
  const r = resolveIngredient({ itemKey: 'scrambled_feggs', multiplier: 0.5 }, items);
  assert.ok(Math.abs(r.kcal - 367) < 0.01);
});

test('resolveIngredient preserves ing.label, multiplier, amount fields on the result', () => {
  const items = mkCatalog();
  const r = resolveIngredient({ itemKey: 'string_cheese', multiplier: 2, label: '2 sticks' }, items);
  assert.equal(r.label, '2 sticks');
  assert.equal(r.multiplier, 2);
});
