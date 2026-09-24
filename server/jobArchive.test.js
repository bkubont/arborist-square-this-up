import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyJobArchiveFields, isArchivedJob } from './jobArchive.js';

describe('job archive', () => {
  it('sets archived_at when status becomes Completed or Paid', () => {
    const completed = applyJobArchiveFields({ status: 'Completed' }, { status: 'In Progress' });
    assert.ok(completed.archived_at);
    const paid = applyJobArchiveFields({ status: 'Paid' }, { status: 'Completed', archived_at: '2026-09-01' });
    assert.equal(paid.archived_at, '2026-09-01');
  });

  it('clears archived_at when reopening from a terminal status', () => {
    const reopened = applyJobArchiveFields(
      { status: 'In Progress' },
      { status: 'Completed', archived_at: '2026-09-01' },
    );
    assert.equal(reopened.archived_at, undefined);
  });

  it('treats terminal jobs without archived_at as archived on read', () => {
    assert.equal(isArchivedJob({ status: 'Completed' }), true);
    assert.equal(isArchivedJob({ status: 'Paid' }), true);
    assert.equal(isArchivedJob({ status: 'In Progress' }), false);
  });

  it('does not archive in-progress jobs', () => {
    const next = applyJobArchiveFields({ status: 'Scheduled' }, { status: 'Estimate' });
    assert.equal(next.archived_at, undefined);
    assert.equal(isArchivedJob(next), false);
  });
});
