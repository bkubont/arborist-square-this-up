import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dateRangesOverlap,
  findScheduleConflicts,
  jobDateRange,
  jobsOverlapInTime,
  scheduleAssignmentChanged,
} from './scheduleConflicts.js';

describe('scheduleConflicts', () => {
  it('treats missing end_date as a single day', () => {
    assert.deepEqual(jobDateRange({ start_date: '2026-10-10' }), ['2026-10-10', '2026-10-10']);
    assert.deepEqual(jobDateRange({ start_date: '2026-10-10', end_date: '2026-10-12' }), ['2026-10-10', '2026-10-12']);
    assert.equal(jobDateRange({}), null);
  });

  it('detects inclusive date overlaps', () => {
    assert.equal(dateRangesOverlap('2026-10-10', '2026-10-12', '2026-10-12', '2026-10-14'), true);
    assert.equal(dateRangesOverlap('2026-10-10', '2026-10-11', '2026-10-12', '2026-10-14'), false);
    assert.equal(jobsOverlapInTime(
      { start_date: '2026-10-10', end_date: '2026-10-11' },
      { start_date: '2026-10-11' },
    ), true);
  });

  it('warns on double-booked crew and equipment', () => {
    const existing = [
      {
        id: 'j1',
        title: 'Oak removal',
        start_date: '2026-10-15',
        end_date: '2026-10-15',
        crew_id: 'crew-a',
        equipment_ids: ['crane-1'],
      },
      {
        id: 'j2',
        title: 'Prune maple',
        start_date: '2026-10-16',
        crew_id: 'crew-b',
        equipment_ids: ['chipper-1'],
      },
    ];
    const crewHit = findScheduleConflicts(existing, {
      id: 'j-new',
      start_date: '2026-10-15',
      crew_id: 'crew-a',
      equipment_ids: [],
    }, {
      crewsById: { 'crew-a': { id: 'crew-a', name: 'Crew Alpha' } },
    });
    assert.equal(crewHit.ok, false);
    assert.equal(crewHit.crewConflicts.length, 1);
    assert.match(crewHit.warnings[0], /Double-booked Crew Alpha/);

    const equipHit = findScheduleConflicts(existing, {
      id: 'j-new',
      start_date: '2026-10-15',
      crew_id: 'crew-b',
      equipment_ids: ['crane-1'],
    }, {
      equipmentById: { 'crane-1': { id: 'crane-1', name: '80t Crane' } },
    });
    assert.equal(equipHit.ok, false);
    assert.equal(equipHit.equipmentConflicts.length, 1);
    assert.match(equipHit.warnings[0], /Double-booked 80t Crane/);

    const clear = findScheduleConflicts(existing, {
      id: 'j-new',
      start_date: '2026-10-17',
      crew_id: 'crew-a',
      equipment_ids: ['crane-1'],
    });
    assert.equal(clear.ok, true);
    assert.deepEqual(clear.warnings, []);
  });

  it('ignores self when exclude id matches and detects assignment field changes', () => {
    const existing = [{
      id: 'j1',
      start_date: '2026-10-15',
      crew_id: 'crew-a',
      equipment_ids: ['crane-1'],
    }];
    const self = findScheduleConflicts(existing, {
      id: 'j1',
      start_date: '2026-10-15',
      crew_id: 'crew-a',
      equipment_ids: ['crane-1'],
    });
    assert.equal(self.ok, true);
    assert.equal(scheduleAssignmentChanged(
      { start_date: '2026-10-15', crew_id: 'a' },
      { start_date: '2026-10-16', crew_id: 'a' },
    ), true);
    assert.equal(scheduleAssignmentChanged(
      { equipment_ids: ['a'] },
      { equipment_ids: ['b'] },
    ), true);
    assert.equal(scheduleAssignmentChanged(
      { start_date: '2026-10-15' },
      { title: 'x' },
    ), false);
  });
});
