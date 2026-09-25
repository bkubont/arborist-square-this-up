import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCatalog, catalogItemToEstimateLine, loadCatalog, getWorkTypes } from './catalog.js';

test('getWorkTypes exposes catalog trade list', () => {
  const types = getWorkTypes();
  assert.ok(types.length >= 50);
  assert.ok(types.includes('Plumbing'));
});

test('handyman catalog loads labor + materials prices', () => {
  const catalog = loadCatalog();
  assert.ok(catalog.items.length >= 180);
  assert.equal(catalog.version, 2);
  assert.ok(String(catalog.source).includes('materials'));
  assert.ok(Array.isArray(catalog.materials));
  assert.ok(catalog.materials.length >= 100);
  const withMats = catalog.items.filter((i) => i.est_materials_cost != null);
  assert.ok(withMats.length >= 180);
});

test('search→fill maps whole-line amount (materials included)', () => {
  const { items } = searchCatalog({ q: 'toilet fill valve', limit: 5 });
  assert.ok(items.length >= 1);
  const hit = items[0];
  assert.ok(hit.est_materials_cost > 0);
  const line = catalogItemToEstimateLine(hit);
  assert.equal(line.description, hit.task);
  const expected = Math.round((Number(hit.est_labor_cost) + Number(hit.est_materials_cost)) * 100) / 100;
  assert.equal(line.labor_amount, expected);
  assert.ok(line.labor_hours > 0);
  assert.equal(line.labor_rate, hit.labor_rate);
  assert.equal(line.material_amount, undefined);
  assert.equal(line.equipment_amount, undefined);
  assert.ok(line.catalog_id);
  assert.ok(line.category);
});

test('PRICE CHECK materials still roll into line amount and flag in notes', () => {
  const { items } = searchCatalog({ q: 'garbage disposal', limit: 10 });
  const hit = items.find((i) => i.task.toLowerCase().includes('replace garbage disposal') && !i.task.toLowerCase().includes('reset'));
  assert.ok(hit);
  assert.equal(hit.materials_flag, 'PRICE CHECK');
  const line = catalogItemToEstimateLine(hit);
  assert.ok(line.labor_amount > 0);
  assert.match(line.notes, /PRICE CHECK/i);
});
