import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MATERIAL_STATUSES,
  isMaterialOnHand,
  materialNeedsOrder,
  materialRowForStorage,
  materialStatusLabel,
  normalizeMaterialStatus,
} from '../shared/materialStatus.js';

describe('material status', () => {
  it('exposes the four editable statuses', () => {
    assert.deepEqual(MATERIAL_STATUSES, ['needed', 'ordered', 'waiting', 'on_hand']);
  });

  it('normalizes legacy have flag when status is absent', () => {
    assert.equal(normalizeMaterialStatus({ have: true }), 'on_hand');
    assert.equal(normalizeMaterialStatus({ have: false }), 'needed');
    assert.equal(normalizeMaterialStatus({}), 'needed');
  });

  it('prefers explicit status over legacy have', () => {
    assert.equal(normalizeMaterialStatus({ status: 'waiting', have: true }), 'waiting');
    assert.equal(normalizeMaterialStatus({ status: 'ordered', have: false }), 'ordered');
  });

  it('labels each status for display', () => {
    assert.equal(materialStatusLabel('needed'), 'Needed');
    assert.equal(materialStatusLabel('on_hand'), 'On hand');
  });

  it('tracks on-hand and draft-order eligibility', () => {
    assert.equal(isMaterialOnHand({ status: 'on_hand' }), true);
    assert.equal(isMaterialOnHand({ status: 'waiting' }), false);
    assert.equal(materialNeedsOrder({ status: 'ordered' }), true);
    assert.equal(materialNeedsOrder({ status: 'on_hand' }), false);
  });

  it('persists status and syncs legacy have on save', () => {
    const row = materialRowForStorage({ description: 'Pipe', status: 'waiting', have: true });
    assert.equal(row.status, 'waiting');
    assert.equal(row.have, false);

    const onHand = materialRowForStorage({ description: 'Tape', have: true });
    assert.equal(onHand.status, 'on_hand');
    assert.equal(onHand.have, true);
  });
});
