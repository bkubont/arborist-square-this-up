import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_STATUSES,
  normalizeTaskStatus,
  parseTaskStatusForWrite,
  isTaskCompleted,
  defaultStatusForTemplate,
} from './taskStatus.js';

test('task board columns: plan, materials, then finish | completed | cancelled at end', () => {
  assert.deepEqual(TASK_STATUSES.slice(0, 2), ['plan', 'materials']);
  assert.deepEqual(TASK_STATUSES.slice(-3), ['finish', 'completed', 'cancelled']);
});

test('normalizeTaskStatus maps legacy values', () => {
  assert.equal(normalizeTaskStatus('done'), 'completed');
  assert.equal(normalizeTaskStatus('prep'), 'plan');
  assert.equal(normalizeTaskStatus('waiting_materials'), 'materials');
});

test('parseTaskStatusForWrite accepts legacy values and maps done to completed', () => {
  assert.equal(parseTaskStatusForWrite('in_progress'), 'in_progress');
  assert.equal(parseTaskStatusForWrite('done'), 'completed');
  assert.equal(parseTaskStatusForWrite('finished'), null);
});

test('built-in templates default to plan, materials, and finish', () => {
  assert.equal(defaultStatusForTemplate('prep'), 'plan');
  assert.equal(defaultStatusForTemplate('materials'), 'materials');
  assert.equal(defaultStatusForTemplate('final_walkthrough'), 'finish');
});

test('isTaskCompleted accepts legacy done', () => {
  assert.equal(isTaskCompleted('completed'), true);
  assert.equal(isTaskCompleted('done'), true);
  assert.equal(isTaskCompleted('finish'), false);
});
