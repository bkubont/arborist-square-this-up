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

test('loadWorkTypes returns arborist work-type list in order', () => {
  const types = loadWorkTypes();
  assert.deepEqual(types, WORK_TYPES);
  assert.ok(types.length >= 10);
  assert.equal(types[0], 'pruning');
  assert.equal(types[types.length - 1], 'unknown');
  assert.ok(types.includes('removal'));
  assert.ok(types.includes('storm cleanup'));
  assert.ok(types.includes('plant health care'));
});

test('normalizeWorkType maps empty to unassigned sentinel', () => {
  assert.equal(normalizeWorkType(''), UNASSIGNED_WORK_TYPE);
  assert.equal(normalizeWorkType('  '), UNASSIGNED_WORK_TYPE);
  assert.equal(normalizeWorkType('pruning'), 'pruning');
});

test('workTypeForStorage clears unassigned', () => {
  assert.equal(workTypeForStorage(UNASSIGNED_WORK_TYPE), '');
  assert.equal(workTypeForStorage('removal'), 'removal');
});

test('workTypeColumnKeys uses full list plus legacy extras', () => {
  const items = [
    { category: 'Legacy Trade' },
    { category: 'removal' },
    { category: '' },
  ];
  const keys = workTypeColumnKeys(items, (item) => item.category, WORK_TYPES);
  assert.equal(keys[0], UNASSIGNED_WORK_TYPE);
  assert.equal(keys[1], 'pruning');
  assert.ok(keys.includes('removal'));
  assert.equal(keys[keys.length - 1], 'Legacy Trade');
});

test('type droppable ids round-trip', () => {
  const id = encodeTypeDroppableId('storm cleanup');
  assert.equal(parseTypeDroppableId(id), 'storm cleanup');
});
