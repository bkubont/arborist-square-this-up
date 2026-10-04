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

  it('migrates Contact / Assessment / Plan-draft-estimate to Estimate sent', () => {
    assert.deepEqual(migrateLegacyStatus('Contact'), { phase: 'working', status: 'Estimate sent' });
    assert.deepEqual(migrateLegacyStatus('Assessment'), { phase: 'working', status: 'Estimate sent' });
    assert.deepEqual(migrateLegacyStatus('Plan / draft estimate'), {
      phase: 'working',
      status: 'Estimate sent',
    });
    for (const status of ['Contact', 'Assessment', 'Plan / draft estimate', 'Estimate', 'Waiting on approval']) {
      const normalized = normalizeJobRecord({ title: 'x', phase: 'lead', status });
      assert.equal(normalized.phase, 'working');
      assert.equal(normalized.status, 'Estimate sent');
    }
  });

  it('keeps Approved on Working and collapses waiting columns', () => {
    const approved = normalizeJobRecord({ phase: 'lead', status: 'Approved' });
    assert.equal(approved.phase, 'working');
    assert.equal(approved.status, 'Approved');
    assert.deepEqual(ESTIMATE_STAGE_STATUSES, ['Estimate sent', 'Approved']);
    for (const status of ['Waiting on access', 'Waiting on weather', 'Waiting on utility', 'Waiting on materials']) {
      const waiting = normalizeJobRecord({ phase: 'working', status });
      assert.equal(waiting.status, 'Waiting on');
      assert.equal(waiting.phase, 'working');
    }
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
    const next = applyJobStatusFields({ status: 'Estimate sent' }, null);
    assert.equal(next.phase, 'working');
    assert.equal(next.status, 'Estimate sent');
    const fresh = applyJobStatusFields({}, null);
    assert.equal(fresh.phase, 'working');
    assert.equal(fresh.status, 'Estimate sent');
  });

  it('maps every status to a phase', () => {
    for (const status of [
      'Estimate sent', 'Prep', INVOICE_GATE_STATUS, 'Paid', 'Completed',
    ]) {
      assert.ok(phaseForStatus(status));
    }
  });

  it('working phase is Estimate sent through Completed with one Waiting on column', () => {
    assert.deepEqual(JOB_PHASES.working.statuses, [
      'Estimate sent',
      'Approved',
      'Prep',
      'In progress',
      'Waiting on',
      'Blocked',
      'Completed',
    ]);
    assert.ok(!JOB_PHASES.working.statuses.includes('Waiting'));
    assert.ok(!JOB_PHASES.working.statuses.includes('Waiting on approval'));
    assert.ok(!JOB_PHASES.working.statuses.includes('Cancelled'));
    assert.ok(!JOB_PHASES.working.statuses.includes(INVOICE_GATE_STATUS));
    assert.ok(!JOB_PHASES.working.statuses.includes('Waiting on materials'));
    assert.ok(!JOB_PHASES.working.statuses.includes('Waiting on access'));
    assert.ok(JOB_PHASES.working.statuses.includes('Prep'));
    assert.ok(JOB_PHASES.working.statuses.includes('Blocked'));
    assert.ok(JOB_PHASES.working.statuses.includes('Waiting on'));
    assert.deepEqual(JOB_PHASES.payment.statuses, [
      INVOICE_GATE_STATUS,
      'Waiting on payment',
      'Partial',
      'Late',
      'Paid',
    ]);
    const normalized = normalizeJobRecord({ status: 'Waiting on materials' });
    assert.equal(normalized.status, 'Waiting on');
    assert.equal(normalized.phase, 'working');
    const legacy = normalizeJobRecord({ status: 'Waiting on Materials' });
    assert.equal(legacy.status, 'Waiting on');
    assert.equal(legacy.phase, 'working');
    const prep = normalizeJobRecord({ phase: 'working', status: 'Prep' });
    assert.equal(prep.status, 'Prep');
  });

  it('migrates status_notes colors onto the collapsed Waiting on label', () => {
    const normalized = normalizeJobRecord({
      phase: 'working',
      status: 'Waiting on weather',
      status_notes: [
        { id: 'n1', text: 'Storm delay', status: 'Waiting on weather' },
        { id: 'n2', text: 'Utility flagging', status: 'Waiting on utility' },
      ],
    });
    assert.equal(normalized.status, 'Waiting on');
    assert.deepEqual(normalized.status_notes.map((n) => n.status), ['Waiting on', 'Waiting on']);
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

  it('maps Declined and Cancelled jobs to Completed', () => {
    const declined = normalizeJobRecord({ phase: 'lead', status: 'Declined' });
    assert.equal(declined.phase, 'working');
    assert.equal(declined.status, 'Completed');
    const cancelled = normalizeJobRecord({ phase: 'working', status: 'Cancelled' });
    assert.equal(cancelled.phase, 'working');
    assert.equal(cancelled.status, 'Completed');
  });
});
