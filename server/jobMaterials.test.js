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

  it('derives waiting status from items not on hand', () => {
    const status = deriveMaterialsStatus({
      job: { materials: [{ description: 'Pipe', have: false }] },
      workItems: [],
      materialOrders: [],
    });
    assert.equal(status.key, 'waiting');
    assert.match(status.label, /Waiting on 1 item/);
  });

  it('derives ordered when a material order is purchased', () => {
    const status = deriveMaterialsStatus({
      job: { materials: [{ description: 'Pipe', have: false }] },
      materialOrders: [{ status: 'purchased', lines: [] }],
    });
    assert.equal(status.key, 'ordered');
    assert.equal(status.label, 'Ordered');
  });

  it('reports all on hand when every row is ticked', () => {
    const status = deriveMaterialsStatus({
      job: { materials: [{ description: 'Tape', have: true }] },
      workItems: [{ id: 't1', materials: [{ description: 'Glue', have: true }] }],
    });
    assert.equal(status.key, 'on_hand');
    assert.equal(status.label, 'All on hand');
  });
});
