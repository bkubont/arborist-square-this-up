import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyJobStatusFields,
  INVOICE_GATE_STATUS,
  JOB_PHASES,
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
      'Contact', 'Prep', INVOICE_GATE_STATUS, 'Paid', 'Completed',
    ]) {
      assert.ok(phaseForStatus(status));
    }
  });

  it('working phase is Prep through Cancelled, with Waiting on materials after In progress', () => {
    assert.deepEqual(JOB_PHASES.working.statuses, [
      'Prep',
      'In progress',
      'Waiting on materials',
      'Blocked',
      'Completed',
      'Cancelled',
    ]);
    assert.ok(!JOB_PHASES.working.statuses.includes('Waiting'));
    assert.ok(!JOB_PHASES.working.statuses.includes(INVOICE_GATE_STATUS));
    assert.ok(JOB_PHASES.working.statuses.includes('Prep'));
    assert.ok(JOB_PHASES.working.statuses.includes('Blocked'));
    assert.deepEqual(JOB_PHASES.payment.statuses, [
      INVOICE_GATE_STATUS,
      'Waiting on payment',
      'Partial',
      'Late',
      'Paid',
    ]);
    const normalized = normalizeJobRecord({ status: 'Waiting on materials' });
    assert.equal(normalized.status, 'Waiting on materials');
    assert.equal(normalized.phase, 'working');
    const legacy = normalizeJobRecord({ status: 'Waiting on Materials' });
    assert.equal(legacy.status, 'Waiting on materials');
    assert.equal(legacy.phase, 'working');
    const prep = normalizeJobRecord({ phase: 'working', status: 'Prep' });
    assert.equal(prep.status, 'Prep');
  });

  it('invoiced stays Invoiced on the payment phase and does not clear the lead track', () => {
    const next = applyJobStatusFields(
      { status: INVOICE_GATE_STATUS, lead_status: 'Approved' },
      { phase: 'working', status: 'Completed', lead_status: 'Contact' },
    );
    assert.equal(next.phase, 'payment');
    assert.equal(next.status, INVOICE_GATE_STATUS);
    assert.equal(next.payment_status, INVOICE_GATE_STATUS);
    assert.equal(next.lead_status, 'Approved');
    const normalized = normalizeJobRecord({ phase: 'working', status: INVOICE_GATE_STATUS });
    assert.equal(normalized.phase, 'payment');
    assert.equal(normalized.status, INVOICE_GATE_STATUS);
  });
});
