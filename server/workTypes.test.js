import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadWorkTypes,
  normalizeWorkType,
  workTypeColumnKeys,
  workTypeForStorage,
  UNASSIGNED_WORK_TYPE,
  encodeTypeDroppableId,
  parseTypeDroppableId,
} from '../shared/workTypes.js';

test('loadWorkTypes returns catalog categories', () => {
  const types = loadWorkTypes();
  assert.ok(types.length >= 50);
  assert.ok(types.includes('Plumbing'));
  assert.ok(types.includes('Electrical'));
  assert.ok(types.includes('Drywall / Finishing'));
});

test('normalizeWorkType maps empty to unassigned sentinel', () => {
  assert.equal(normalizeWorkType(''), UNASSIGNED_WORK_TYPE);
  assert.equal(normalizeWorkType('  '), UNASSIGNED_WORK_TYPE);
  assert.equal(normalizeWorkType('Plumbing'), 'Plumbing');
});

test('workTypeForStorage clears unassigned', () => {
  assert.equal(workTypeForStorage(UNASSIGNED_WORK_TYPE), '');
  assert.equal(workTypeForStorage('HVAC'), 'HVAC');
});

test('workTypeColumnKeys orders unassigned then catalog then extras', () => {
  const items = [
    { category: 'Custom Trade' },
    { category: 'Plumbing' },
    { category: '' },
  ];
  const keys = workTypeColumnKeys(items, (item) => item.category, ['Plumbing', 'Electrical']);
  assert.deepEqual(keys, [UNASSIGNED_WORK_TYPE, 'Plumbing', 'Custom Trade']);
});

test('type droppable ids round-trip', () => {
  const id = encodeTypeDroppableId('Painting / Finishing');
  assert.equal(parseTypeDroppableId(id), 'Painting / Finishing');
});
