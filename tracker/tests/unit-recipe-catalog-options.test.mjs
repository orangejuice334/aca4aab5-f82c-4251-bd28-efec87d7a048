import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipeCatalogOptions } from '../lib/tracker-core.mjs';
import { mkCatalog } from './_mocks.mjs';

test('recipeCatalogOptions includes brand in label when present', () => {
  const opts = recipeCatalogOptions(mkCatalog());
  const turkey = opts.find(o => o.key === 'turkey_breast_smithfield');
  assert.equal(turkey.label, 'Turkey breast oven roasted (Smithfield Safeway)');
});

test('recipeCatalogOptions omits brand suffix when missing', () => {
  const opts = recipeCatalogOptions(mkCatalog());
  const eggs = opts.find(o => o.key === 'egg_substitute');
  assert.equal(eggs.label, 'Egg substitute');
});

test('recipeCatalogOptions filters out water', () => {
  const opts = recipeCatalogOptions(mkCatalog());
  assert.ok(!opts.some(o => o.key === 'water'));
});

test('recipeCatalogOptions sorts alphabetically by label', () => {
  const opts = recipeCatalogOptions(mkCatalog());
  for (let i = 1; i < opts.length; i++) {
    assert.ok(opts[i - 1].label.localeCompare(opts[i].label) <= 0);
  }
});

test('recipeCatalogOptions handles empty / null inputs', () => {
  assert.deepEqual(recipeCatalogOptions({}), []);
  assert.deepEqual(recipeCatalogOptions(null), []);
  assert.deepEqual(recipeCatalogOptions(undefined), []);
});

test('recipeCatalogOptions trims whitespace-only brand to no-brand label', () => {
  const opts = recipeCatalogOptions({ x: { name: 'Item', brand: '   ' } });
  assert.equal(opts[0].label, 'Item');
});

test('recipeCatalogOptions falls back to key when item has no name', () => {
  const opts = recipeCatalogOptions({ orphan: { brand: 'B' } });
  assert.equal(opts[0].label, 'orphan (B)');
});

test('recipeCatalogOptions includes recipes (so recipe-as-ingredient works)', () => {
  const opts = recipeCatalogOptions(mkCatalog());
  assert.ok(opts.some(o => o.key === 'scrambled_feggs'));
});

test('recipeCatalogOptions includes supplements with brand', () => {
  const items = mkCatalog();
  items.s = { name: 'Multi', brand: 'NOW', category: 'supplements' };
  const opts = recipeCatalogOptions(items);
  assert.ok(opts.some(o => o.label === 'Multi (NOW)'));
});
