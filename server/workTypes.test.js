import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_TYPES,
  loadWorkTypes,
  normalizeWorkType,
  workTypeColumnKeys,
  workTypeForStorage,
  UNASSIGNED_WORK_TYPE,
  encodeTypeDroppableId,
  parseTypeDroppableId,
} from '../shared/workTypes.js';

test('loadWorkTypes returns Brittany + Tess work-type list in order', () => {
  const types = loadWorkTypes();
  assert.deepEqual(types, WORK_TYPES);
  assert.equal(types.length, 48);
  assert.equal(types[0], 'propane');
  assert.equal(types[types.length - 1], 'unknown');
  assert.ok(types.includes('doors'));
  assert.ok(types.includes('inside doors'));
  assert.deepEqual(types.slice(32, 35), ['removal', 'fencing', 'tile']);
  assert.equal(types.filter((t) => t === 'doors').length, 1);
});

test('normalizeWorkType maps empty to unassigned sentinel', () => {
  assert.equal(normalizeWorkType(''), UNASSIGNED_WORK_TYPE);
  assert.equal(normalizeWorkType('  '), UNASSIGNED_WORK_TYPE);
  assert.equal(normalizeWorkType('plumbing'), 'plumbing');
});

test('workTypeForStorage clears unassigned', () => {
  assert.equal(workTypeForStorage(UNASSIGNED_WORK_TYPE), '');
  assert.equal(workTypeForStorage('HVAC'), 'HVAC');
});

test('workTypeColumnKeys uses full list plus legacy extras', () => {
  const items = [
    { category: 'Legacy Trade' },
    { category: 'plumbing' },
    { category: '' },
  ];
  const keys = workTypeColumnKeys(items, (item) => item.category, WORK_TYPES);
  assert.equal(keys[0], UNASSIGNED_WORK_TYPE);
  assert.equal(keys[1], 'propane');
  assert.ok(keys.includes('plumbing'));
  assert.equal(keys[keys.length - 1], 'Legacy Trade');
});

test('type droppable ids round-trip', () => {
  const id = encodeTypeDroppableId('inside doors');
  assert.equal(parseTypeDroppableId(id), 'inside doors');
});
