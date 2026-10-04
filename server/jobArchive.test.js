import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyJobArchiveFields, isArchivedJob } from './jobArchive.js';

describe('job archive', () => {
  it('sets archived_at when status becomes Paid', () => {
    const paid = applyJobArchiveFields({ status: 'Paid' }, { status: 'Completed' });
    assert.ok(paid.archived_at);
    const keepDate = applyJobArchiveFields({ status: 'Paid' }, { status: 'Completed', archived_at: '2026-09-01' });
    assert.equal(keepDate.archived_at, '2026-09-01');
  });

  it('clears archived_at when reopening from a terminal status', () => {
    const reopened = applyJobArchiveFields(
      { status: 'In progress' },
      { status: 'Completed', archived_at: '2026-09-01' },
    );
    assert.equal(reopened.archived_at, undefined);
  });

  it('treats archive statuses without archived_at as archived on read', () => {
    assert.equal(isArchivedJob({ status: 'Completed' }), false);
    assert.equal(isArchivedJob({ status: 'Paid' }), true);
    assert.equal(isArchivedJob({ status: 'Declined' }), true);
    assert.equal(isArchivedJob({ status: 'In progress' }), false);
  });

  it('archives Paid and Declined but not Completed', () => {
    assert.ok(applyJobArchiveFields({ status: 'Paid' }, { status: 'In progress' }).archived_at);
    assert.ok(applyJobArchiveFields({ status: 'Declined' }, { status: 'Estimate sent' }).archived_at);
    assert.equal(applyJobArchiveFields({ status: 'Completed' }, { status: 'In progress' }).archived_at, undefined);
  });

  it('does not archive in-play jobs', () => {
    const next = applyJobArchiveFields({ status: 'Prep' }, { status: 'Estimate sent' });
    assert.equal(next.archived_at, undefined);
    assert.equal(isArchivedJob(next), false);
  });

  it('completed jobs stay in working even with a legacy archived_at', () => {
    assert.equal(isArchivedJob({ status: 'Completed', archived_at: '2026-01-01' }), false);
    const cleared = applyJobArchiveFields(
      { status: 'Completed' },
      { status: 'Paid', archived_at: '2026-01-01' },
    );
    assert.equal(cleared.archived_at, undefined);
  });
});
