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

  it('does not archive in-progress jobs', () => {
    const next = applyJobArchiveFields({ status: 'Scheduled' }, { status: 'Estimate' });
    assert.equal(next.archived_at, undefined);
    assert.equal(isArchivedJob(next), false);
  });
});
