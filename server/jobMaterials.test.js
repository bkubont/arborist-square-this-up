import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectJobMaterialItems, deriveMaterialsStatus } from '../shared/jobMaterials.js';

describe('job materials', () => {
  it('collects job and task materials, skipping cancelled tasks', () => {
    const items = collectJobMaterialItems(
      { materials: [{ description: 'Caulk', have: true }] },
      [
        { id: 't1', materials: [{ description: 'Faucet', have: false }] },
        { id: 't2', status: 'cancelled', materials: [{ description: 'Skip me' }] },
      ],
    );
    assert.equal(items.length, 2);
    assert.equal(items[0].source, 'job');
    assert.equal(items[1].source, 'task');
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
      job: { materials: [{ description: 'Tape', status: 'on_hand' }] },
      workItems: [{ id: 't1', materials: [{ description: 'Glue', have: true }] }],
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
});
