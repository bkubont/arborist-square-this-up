import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCatalog, catalogItemToEstimateLine, loadCatalog } from './catalog.js';

test('handyman catalog loads and search→fill maps labor fields', () => {
  const catalog = loadCatalog();
  assert.ok(catalog.items.length >= 180);
  const { items } = searchCatalog({ q: 'toilet fill valve', limit: 5 });
  assert.ok(items.length >= 1);
  const line = catalogItemToEstimateLine(items[0]);
  assert.equal(line.description, items[0].task);
  assert.ok(line.labor_amount > 0);
  assert.ok(line.labor_hours > 0);
  assert.equal(line.labor_rate, items[0].labor_rate);
  assert.equal(line.material_amount, undefined);
  assert.equal(line.equipment_amount, undefined);
  assert.ok(line.catalog_id);
});
