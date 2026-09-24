import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_STATUSES,
  normalizeTaskStatus,
  parseTaskStatusForWrite,
  isTaskCompleted,
  defaultStatusForTemplate,
} from './taskStatus.js';

test('task board columns end with finish, completed, cancelled', () => {
  const tail = TASK_STATUSES.slice(-3);
  assert.deepEqual(tail, ['finish', 'completed', 'cancelled']);
});

test('normalizeTaskStatus maps legacy values', () => {
  assert.equal(normalizeTaskStatus('done'), 'completed');
  assert.equal(normalizeTaskStatus('prep'), 'plan');
  assert.equal(normalizeTaskStatus('waiting_materials'), 'blocked');
});

test('parseTaskStatusForWrite accepts legacy values and maps done to completed', () => {
  assert.equal(parseTaskStatusForWrite('in_progress'), 'in_progress');
  assert.equal(parseTaskStatusForWrite('done'), 'completed');
  assert.equal(parseTaskStatusForWrite('finished'), null);
});

test('built-in templates default to plan and finish', () => {
  assert.equal(defaultStatusForTemplate('prep'), 'plan');
  assert.equal(defaultStatusForTemplate('final_walkthrough'), 'finish');
});

test('isTaskCompleted accepts legacy done', () => {
  assert.equal(isTaskCompleted('completed'), true);
  assert.equal(isTaskCompleted('done'), true);
  assert.equal(isTaskCompleted('finish'), false);
});
