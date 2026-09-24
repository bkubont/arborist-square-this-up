import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyJobStatusFields,
  migrateLegacyStatus,
  normalizeJobRecord,
  phaseForStatus,
} from './jobStatus.js';

describe('job status model', () => {
  it('migrates legacy statuses to phase + status', () => {
    assert.deepEqual(migrateLegacyStatus('Estimate'), {
      phase: 'lead',
      status: 'Plan / draft estimate',
    });
    const normalized = normalizeJobRecord({ title: 'x', status: 'In Progress' });
    assert.equal(normalized.phase, 'working');
    assert.equal(normalized.status, 'In progress');
  });

  it('keeps phase and status aligned on patch', () => {
    const next = applyJobStatusFields(
      { phase: 'payment', status: 'Paid' },
      { phase: 'working', status: 'Completed' },
    );
    assert.equal(next.phase, 'payment');
    assert.equal(next.status, 'Paid');
  });

  it('resolves phase from status when only status is sent', () => {
    const next = applyJobStatusFields({ status: 'Waiting on approval' }, null);
    assert.equal(next.phase, 'lead');
    assert.equal(next.status, 'Waiting on approval');
  });

  it('maps every status to a phase', () => {
    for (const status of [
      'Contact', 'Prep', 'Invoiced', 'Paid', 'Completed',
    ]) {
      assert.ok(phaseForStatus(status));
    }
  });
});
