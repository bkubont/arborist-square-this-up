import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectJobMaterialItems,
  deriveMaterialsStatus,
  jobHasOpenMaterials,
  materialsForTask,
  replaceTaskMaterialLines,
  taskHasOpenMaterials,
} from '../shared/jobMaterials.js';

describe('job materials', () => {
  it('collects one job list and names the task a line is tagged to', () => {
    const items = collectJobMaterialItems(
      {
        materials: [
          { description: 'Caulk', have: true },
          { description: 'Faucet', task_id: 't1' },
          { description: 'Old pipe', task_id: 't2' },
        ],
      },
      [
        { id: 't1', description: 'Replace faucet' },
        { id: 't2', status: 'cancelled', description: 'Demo' },
      ],
    );
    assert.equal(items.length, 3);
    assert.equal(items[0].source, 'job');
    assert.equal(items[1].source, 'task');
    assert.equal(items[1].taskDescription, 'Replace faucet');
    assert.equal(items[2].taskDescription, 'Demo');
  });

  it('derives needed from legacy rows without explicit status', () => {
    const status = deriveMaterialsStatus({
      job: { materials: [{ description: 'Pipe', have: false }] },
      workItems: [],
      materialOrders: [],
    });
    assert.equal(status.key, 'needed');
    assert.equal(status.label, 'Needed');
  });

  it('derives waiting from explicit waiting status', () => {
    const status = deriveMaterialsStatus({
      job: { materials: [{ description: 'Pipe', status: 'waiting' }] },
      workItems: [],
      materialOrders: [],
    });
    assert.equal(status.key, 'waiting');
    assert.equal(status.label, 'Waiting');
  });

  it('derives ordered from line status', () => {
    const status = deriveMaterialsStatus({
      job: { materials: [{ description: 'Pipe', status: 'ordered' }] },
      materialOrders: [],
    });
    assert.equal(status.key, 'ordered');
    assert.equal(status.label, 'Ordered');
  });

  it('derives ordered from a purchased material order when no lines are needed or waiting', () => {
    const status = deriveMaterialsStatus({
      job: { materials: [{ description: 'Pipe', status: 'ordered', have: false }] },
      materialOrders: [{ status: 'purchased', lines: [] }],
    });
    assert.equal(status.key, 'ordered');
    assert.equal(status.label, 'Ordered');
  });

  it('reports all on hand when every row is on hand', () => {
    const status = deriveMaterialsStatus({
      job: { materials: [{ description: 'Tape', status: 'on_hand' }, { description: 'Glue', task_id: 't1', have: true }] },
    });
    assert.equal(status.key, 'on_hand');
    assert.equal(status.label, 'All on hand');
  });

  it('prioritizes waiting over needed in the header label', () => {
    const status = deriveMaterialsStatus({
      job: {
        materials: [
          { description: 'A', status: 'needed' },
          { description: 'B', status: 'waiting' },
        ],
      },
    });
    assert.equal(status.key, 'waiting');
    assert.equal(status.label, 'Waiting');
  });

  it('treats needed, ordered, and waiting as open on the job and on a tagged task', () => {
    const job = {
      materials: [
        { description: 'Caulk', status: 'on_hand' },
        { description: 'Valve', status: 'ordered', task_id: 't1' },
        { description: 'Tile', status: 'needed', task_id: 't2' },
      ],
    };
    assert.equal(jobHasOpenMaterials(job), true);
    assert.equal(taskHasOpenMaterials(job, 't1'), true);
    assert.equal(materialsForTask(job, 't2').length, 1);
    assert.equal(taskHasOpenMaterials({ materials: [{ description: 'Tape', status: 'on_hand', task_id: 't1' }] }, 't1'), false);
  });

  it('replaces only the tagged task lines', () => {
    const next = replaceTaskMaterialLines(
      [
        { id: 'a', description: 'Caulk' },
        { id: 'b', description: 'Valve', task_id: 't1' },
      ],
      't1',
      [{ id: 'b', description: 'Valve', status: 'waiting' }],
    );
    assert.equal(next.length, 2);
    assert.equal(next[0].description, 'Caulk');
    assert.equal(next[0].task_id, undefined);
    assert.equal(next[1].task_id, 't1');
    assert.equal(next[1].status, 'waiting');
  });
});
