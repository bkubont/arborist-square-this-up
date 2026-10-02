import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCatalog, catalogItemToEstimateLine, loadCatalog, getWorkTypes, servicePresetToEstimateLine } from './catalog.js';
import { DEFAULT_ARBORIST_SERVICE_PRESETS } from '../shared/arboristServicePresets.js';

test('getWorkTypes exposes arborist work-type list', () => {
  const types = getWorkTypes();
  assert.ok(types.length >= 10);
  assert.ok(types.includes('pruning'));
  assert.ok(types.includes('removal'));
  assert.ok(types.includes('storm cleanup'));
  assert.equal(types[types.length - 1], 'unknown');
});

test('arborist service catalog loads pruning / removal presets', () => {
  const catalog = loadCatalog();
  assert.ok(catalog.items.length >= 8);
  assert.equal(catalog.version, 1);
  assert.match(String(catalog.source), /arborist/i);
  assert.ok(catalog.categories.includes('Pruning'));
  assert.ok(catalog.categories.includes('Removal'));
});

test('search→fill maps arborist preset into estimate line', () => {
  const { items } = searchCatalog({ q: 'stump', limit: 5 });
  assert.ok(items.length >= 1);
  const hit = items[0];
  const line = catalogItemToEstimateLine(hit);
  assert.equal(line.description, hit.task);
  assert.ok(line.labor_amount > 0);
  assert.ok(line.catalog_id);
  assert.ok(line.category);
});

test('servicePresetToEstimateLine uses labor + materials + equipment', () => {
  const preset = DEFAULT_ARBORIST_SERVICE_PRESETS.find((p) => p.id === 'removal-standard');
  assert.ok(preset);
  const line = servicePresetToEstimateLine(preset);
  assert.equal(line.description, 'Tree removal');
  const expected = Math.round(((preset.labor_amount || 0) + (preset.material_amount || 0) + (preset.equipment_amount || 0)) * 100) / 100;
  assert.equal(line.labor_amount, expected);
});
