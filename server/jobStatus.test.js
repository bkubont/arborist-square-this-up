import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyJobStatusFields,
  ESTIMATE_STAGE_STATUSES,
  INVOICE_GATE_STATUS,
  JOB_PHASE_ORDER,
  JOB_PHASES,
  migrateLegacyStatus,
  normalizeJobRecord,
  phaseForStatus,
} from './jobStatus.js';

describe('job status model', () => {
  it('has working and payment boards only', () => {
    assert.deepEqual(JOB_PHASE_ORDER, ['working', 'payment']);
    assert.equal(JOB_PHASES.lead, undefined);
  });

  it('migrates Contact / Assessment / Plan-draft-estimate to Estimate', () => {
    assert.deepEqual(migrateLegacyStatus('Contact'), { phase: 'working', status: 'Estimate' });
    assert.deepEqual(migrateLegacyStatus('Assessment'), { phase: 'working', status: 'Estimate' });
    assert.deepEqual(migrateLegacyStatus('Plan / draft estimate'), {
      phase: 'working',
      status: 'Estimate',
    });
    for (const status of ['Contact', 'Assessment', 'Plan / draft estimate']) {
      const normalized = normalizeJobRecord({ title: 'x', phase: 'lead', status });
      assert.equal(normalized.phase, 'working');
      assert.equal(normalized.status, 'Estimate');
    }
  });

  it('keeps Waiting on approval and Approved on Working', () => {
    const waiting = normalizeJobRecord({ phase: 'lead', status: 'Waiting on approval' });
    assert.equal(waiting.phase, 'working');
    assert.equal(waiting.status, 'Waiting on approval');
    const approved = normalizeJobRecord({ phase: 'lead', status: 'Approved' });
    assert.equal(approved.phase, 'working');
    assert.equal(approved.status, 'Approved');
    assert.deepEqual(ESTIMATE_STAGE_STATUSES, ['Estimate', 'Waiting on approval', 'Approved']);
  });

  it('migrates legacy In Progress and keeps phase and status aligned on patch', () => {
    const normalized = normalizeJobRecord({ title: 'x', status: 'In Progress' });
    assert.equal(normalized.phase, 'working');
    assert.equal(normalized.status, 'In progress');
    const next = applyJobStatusFields(
      { phase: 'payment', status: 'Paid' },
      { phase: 'working', status: 'Completed' },
    );
    assert.equal(next.phase, 'payment');
    assert.equal(next.status, 'Paid');
  });

  it('resolves phase from status when only status is sent', () => {
    const next = applyJobStatusFields({ status: 'Waiting on approval' }, null);
    assert.equal(next.phase, 'working');
    assert.equal(next.status, 'Waiting on approval');
    const fresh = applyJobStatusFields({}, null);
    assert.equal(fresh.phase, 'working');
    assert.equal(fresh.status, 'Estimate');
  });

  it('maps every status to a phase', () => {
    for (const status of [
      'Estimate', 'Prep', INVOICE_GATE_STATUS, 'Paid', 'Completed',
    ]) {
      assert.ok(phaseForStatus(status));
    }
  });

  it('working phase is Estimate through Cancelled', () => {
    assert.deepEqual(JOB_PHASES.working.statuses, [
      'Estimate',
      'Waiting on approval',
      'Approved',
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

  it('invoiced stays Invoiced on the payment phase', () => {
    const next = applyJobStatusFields(
      { status: INVOICE_GATE_STATUS },
      { phase: 'working', status: 'Completed' },
    );
    assert.equal(next.phase, 'payment');
    assert.equal(next.status, INVOICE_GATE_STATUS);
    assert.equal(next.payment_status, INVOICE_GATE_STATUS);
    const normalized = normalizeJobRecord({ phase: 'working', status: INVOICE_GATE_STATUS });
    assert.equal(normalized.phase, 'payment');
    assert.equal(normalized.status, INVOICE_GATE_STATUS);
  });

  it('maps Declined jobs to Cancelled so they stay archived', () => {
    const declined = normalizeJobRecord({ phase: 'lead', status: 'Declined' });
    assert.equal(declined.phase, 'working');
    assert.equal(declined.status, 'Cancelled');
  });
});
