import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBlockedWindowsFromMessage,
  parsePreferMorningSubjects,
  packDaySchedule,
  proposeBulkMoveToNextWeek,
  toLocalYmd,
} from './scheduleReplanHelpers.js';
import {
  isDayReplanIntent,
  isPlanWeekIntent,
  isBulkRescheduleIntent,
} from './scheduleReplanPreparers.js';

describe('replan intent detectors', () => {
  it('detects day replan / plan week / bulk', () => {
    assert.equal(
      isDayReplanIntent('We have a dentist appointment at 11. Move our lessons around, but keep math in the morning.'),
      true,
    );
    assert.equal(isPlanWeekIntent('Plan next week’s homeschool schedule for Emma and Noah'), true);
    assert.equal(isBulkRescheduleIntent('Move all unfinished math assignments to next week'), true);
    assert.equal(isDayReplanIntent('move field trip to Friday'), false);
  });
});

describe('parseBlockedWindowsFromMessage', () => {
  it('parses dentist at 11 into a one-hour block', () => {
    const day = '2026-10-10';
    const windows = parseBlockedWindowsFromMessage('dentist appointment at 11', day);
    assert.equal(windows.length, 1);
    assert.equal(windows[0].start.getHours(), 11);
    assert.equal(windows[0].end.getHours(), 12);
  });
});

describe('packDaySchedule', () => {
  it('moves lessons out of a blocked appointment window and keeps math in morning', () => {
    const day = '2026-10-10';
    const events = [
      {
        id: 'm1',
        title: 'Math',
        subject_id: 'math',
        start_ts: new Date(2026, 9, 10, 11, 0).toISOString(),
        end_ts: new Date(2026, 9, 10, 11, 45).toISOString(),
        event_type: 'ClassDay',
        counts_toward_plan: true,
        is_flexible: false,
      },
      {
        id: 'h1',
        title: 'History',
        subject_id: 'hist',
        start_ts: new Date(2026, 9, 10, 9, 0).toISOString(),
        end_ts: new Date(2026, 9, 10, 9, 45).toISOString(),
        event_type: 'ClassDay',
        counts_toward_plan: true,
        is_flexible: false,
      },
      {
        id: 'd1',
        title: 'Dentist',
        start_ts: new Date(2026, 9, 10, 11, 0).toISOString(),
        end_ts: new Date(2026, 9, 10, 12, 0).toISOString(),
        event_type: 'Appointment',
        is_flexible: false,
      },
    ];
    const blocked = parseBlockedWindowsFromMessage('dentist at 11', day);
    const packed = packDaySchedule({
      dayYmd: day,
      events,
      blockedWindows: blocked,
      preferMorningSubjectIds: ['math'],
    });
    assert.ok(packed.moves.length >= 1);
    const mathMove = packed.moves.find((m) => m.eventId === 'm1');
    assert.ok(mathMove, 'math should move out of 11am');
    const mathHour = new Date(mathMove.startAt).getHours();
    assert.ok(mathHour < 11, `math should be morning, got ${mathHour}`);
  });
});

describe('proposeBulkMoveToNextWeek', () => {
  it('places items on next week days', () => {
    const weekStart = '2026-10-05'; // Monday
    const { moves, nextMonday } = proposeBulkMoveToNextWeek({
      items: [
        { id: 'a1', title: 'Fractions', durationMs: 45 * 60 * 1000 },
        { id: 'a2', title: 'Multiplication', durationMs: 45 * 60 * 1000 },
      ],
      fromWeekStartYmd: weekStart,
    });
    assert.equal(nextMonday, '2026-10-12');
    assert.equal(moves.length, 2);
    assert.equal(toLocalYmd(new Date(moves[0].startAt)), '2026-10-12');
  });
});

describe('parsePreferMorningSubjects', () => {
  it('finds math subject id', () => {
    const ids = parsePreferMorningSubjects('keep math in the morning', [
      { id: 'm', name: 'Math' },
      { id: 'h', name: 'History' },
    ]);
    assert.deepEqual(ids, ['m']);
  });
});
