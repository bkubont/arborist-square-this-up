import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendScheduleHistory,
  jobFieldsForReschedule,
  jobFieldsForScheduleAssign,
  schedulePrerequisiteFlags,
  SCHEDULED_STATUS,
} from './schedule.js';
import { READY_TO_SCHEDULE_STATUS } from './readyToSchedule.js';

describe('schedule helpers', () => {
  it('flags prerequisites for approval, deposit, and access', () => {
    const bare = schedulePrerequisiteFlags({ status: 'Estimate sent' });
    assert.equal(bare.approval, false);
    assert.equal(bare.deposit, false);
    assert.equal(bare.access, false);
    assert.ok(bare.missing.includes('approval'));

    const ready = schedulePrerequisiteFlags(
      { status: READY_TO_SCHEDULE_STATUS, prereq_deposit: true },
      { property: { access_notes: 'Gate code 9' } },
    );
    assert.equal(ready.approval, true);
    assert.equal(ready.deposit, true);
    assert.equal(ready.access, true);
    assert.equal(ready.ok, true);
  });

  it('assigns Ready to Schedule → Scheduled and records history', () => {
    const job = {
      status: READY_TO_SCHEDULE_STATUS,
      phase: 'working',
      title: 'Front oak',
    };
    const fields = jobFieldsForScheduleAssign(job, {
      start_date: '2026-10-20',
      end_date: '2026-10-21',
      crew_id: 'crew-a',
      equipment_ids: ['crane-1'],
      estimated_duration_hours: 8,
      changed_by: 'ops@example.com',
    });
    assert.equal(fields.status, SCHEDULED_STATUS);
    assert.equal(fields.start_date, '2026-10-20');
    assert.equal(fields.end_date, '2026-10-21');
    assert.equal(fields.crew_id, 'crew-a');
    assert.deepEqual(fields.equipment_ids, ['crane-1']);
    assert.equal(fields.schedule_history.length, 1);
    assert.equal(fields.schedule_history[0].reason, 'initial');
    assert.equal(fields.schedule_history[0].new_start_date, '2026-10-20');
  });

  it('weather reschedule keeps previous dates in history', () => {
    const job = {
      status: SCHEDULED_STATUS,
      start_date: '2026-10-20',
      end_date: '2026-10-20',
      crew_id: 'crew-a',
      schedule_history: [{
        at: '2026-10-01T00:00:00.000Z',
        reason: 'initial',
        previous_start_date: '',
        new_start_date: '2026-10-20',
        customer_notified: false,
      }],
    };
    const fields = jobFieldsForReschedule(job, {
      start_date: '2026-10-22',
      reason: 'weather',
      note: 'High winds',
      customer_notified: true,
      changed_by: 'office@example.com',
    });
    assert.equal(fields.start_date, '2026-10-22');
    assert.equal(fields.schedule_history.length, 2);
    const last = fields.schedule_history[1];
    assert.equal(last.reason, 'weather');
    assert.equal(last.previous_start_date, '2026-10-20');
    assert.equal(last.new_start_date, '2026-10-22');
    assert.equal(last.customer_notified, true);
    assert.match(last.note || '', /High winds/);
  });

  it('appendScheduleHistory caps at 100 entries', () => {
    const job = {
      schedule_history: Array.from({ length: 100 }, (_, i) => ({
        at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        reason: 'other',
        previous_start_date: '',
        new_start_date: '2026-10-01',
      })),
    };
    const next = appendScheduleHistory(job, {
      reason: 'weather',
      previous_start_date: '2026-10-01',
      new_start_date: '2026-10-02',
    });
    assert.equal(next.length, 100);
    assert.equal(next[99].reason, 'weather');
  });
});
