import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_STATUSES,
  normalizeTaskStatus,
  parseTaskStatusForWrite,
  isTaskCompleted,
  defaultStatusForTemplate,
} from './taskStatus.js';

test('task board columns: plan, in progress, permits, waiting on materials, finish | completed | cancelled; no prep or materials column', () => {
  assert.deepEqual(TASK_STATUSES, [
    'plan',
    'in_progress',
    'permits',
    'waiting_on_approval',
    'waiting_on_materials',
    'blocked',
    'finish',
    'completed',
    'cancelled',
  ]);
  assert.ok(!TASK_STATUSES.includes('materials'));
  assert.ok(!TASK_STATUSES.includes('prep'));
});

test('normalizeTaskStatus keeps in_progress and maps other legacy values', () => {
  assert.equal(normalizeTaskStatus('in_progress'), 'in_progress');
  assert.equal(normalizeTaskStatus('done'), 'completed');
  assert.equal(normalizeTaskStatus('prep'), 'plan');
  assert.equal(normalizeTaskStatus('materials'), 'plan');
  assert.equal(normalizeTaskStatus('waiting_materials'), 'waiting_on_materials');
});

test('parseTaskStatusForWrite accepts in_progress and maps done to completed', () => {
  assert.equal(parseTaskStatusForWrite('in_progress'), 'in_progress');
  assert.equal(parseTaskStatusForWrite('done'), 'completed');
  assert.equal(parseTaskStatusForWrite('finished'), null);
});

test('built-in templates default to plan', () => {
  assert.equal(defaultStatusForTemplate('prep'), 'plan');
  assert.equal(defaultStatusForTemplate('materials'), 'plan');
  assert.equal(defaultStatusForTemplate('final_walkthrough'), 'finish');
});

test('isTaskCompleted accepts legacy done', () => {
  assert.equal(isTaskCompleted('completed'), true);
  assert.equal(isTaskCompleted('done'), true);
  assert.equal(isTaskCompleted('finish'), false);
});
