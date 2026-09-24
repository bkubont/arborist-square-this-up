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
    assert.equal(isArchivedJob({ status: 'Cancelled' }), true);
    assert.equal(isArchivedJob({ status: 'In progress' }), false);
  });

  it('archives Paid, Declined, and Cancelled but not Completed', () => {
    assert.ok(applyJobArchiveFields({ status: 'Paid' }, { status: 'In progress' }).archived_at);
    assert.ok(applyJobArchiveFields({ status: 'Declined' }, { status: 'Contact' }).archived_at);
    assert.ok(applyJobArchiveFields({ status: 'Cancelled' }, { status: 'In progress' }).archived_at);
    assert.equal(applyJobArchiveFields({ status: 'Completed' }, { status: 'In progress' }).archived_at, undefined);
  });

  it('does not archive in-play jobs', () => {
    const next = applyJobArchiveFields({ status: 'Prep' }, { status: 'Contact' });
    assert.equal(next.archived_at, undefined);
    assert.equal(isArchivedJob(next), false);
  });
});
