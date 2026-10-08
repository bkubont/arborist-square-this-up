import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bindingEstimateLines,
  bindingEstimateTotals,
  capabilitiesFromTrees,
  durationHoursFromEstimateLines,
  filterReadyToScheduleQueue,
  jobFieldsAfterEstimateAccept,
  READY_TO_SCHEDULE_STATUS,
  readyToSchedulePrerequisites,
} from './readyToSchedule.js';

describe('Ready to Schedule helpers', () => {
  it('excludes optional lines from the binding total unless included', () => {
    const lines = [
      { id: 'a', description: 'Removal', labor_amount: 1000 },
      { id: 'b', description: 'Stump', labor_amount: 250, is_optional: true },
    ];
    assert.equal(bindingEstimateTotals(lines, 0).total, 1000);
    assert.equal(bindingEstimateTotals(lines, 0, ['b']).total, 1250);
    assert.deepEqual(bindingEstimateLines(lines).map((l) => l.id), ['a']);
  });

  it('moves estimate-stage jobs into Ready to Schedule when undated', () => {
    const fields = jobFieldsAfterEstimateAccept({ status: 'Estimate sent', phase: 'working' });
    assert.equal(fields.status, READY_TO_SCHEDULE_STATUS);
    assert.equal(fields.phase, 'working');
    assert.equal(jobFieldsAfterEstimateAccept({ status: 'Prep', phase: 'working' }), null);
    assert.equal(jobFieldsAfterEstimateAccept({ status: 'Estimate sent', start_date: '2026-10-20' }), null);
    assert.equal(readyToSchedulePrerequisites({ status: 'Estimate sent' }).ok, true);
  });

  it('filters the queue by area, capability, duration, and urgency', () => {
    const jobs = [
      {
        id: '1',
        status: READY_TO_SCHEDULE_STATUS,
        service_area: 'Austin NW',
        required_capabilities: ['crane'],
        estimated_duration_hours: 4,
        urgency: 'high',
      },
      {
        id: '2',
        status: READY_TO_SCHEDULE_STATUS,
        service_area: 'Round Rock',
        required_capabilities: ['climbing'],
        estimated_duration_hours: 8,
        urgency: 'normal',
      },
      { id: '3', status: 'Prep', service_area: 'Austin NW' },
    ];
    assert.deepEqual(filterReadyToScheduleQueue(jobs, { area: 'austin' }).map((j) => j.id), ['1']);
    assert.deepEqual(filterReadyToScheduleQueue(jobs, { capability: 'climb' }).map((j) => j.id), ['2']);
    assert.deepEqual(filterReadyToScheduleQueue(jobs, { durationMaxHours: 5 }).map((j) => j.id), ['1']);
    assert.deepEqual(filterReadyToScheduleQueue(jobs, { urgency: 'high' }).map((j) => j.id), ['1']);
  });

  it('derives capabilities and duration from trees / estimate lines', () => {
    assert.deepEqual(
      capabilitiesFromTrees([{ method_needs: ['crane', 'chipper'] }, { method_needs: ['crane'] }]).sort(),
      ['chipper', 'crane'],
    );
    assert.equal(
      durationHoursFromEstimateLines([
        { labor_hours: 3 },
        { labor_hours: 2, is_optional: true },
      ]),
      3,
    );
  });
});
