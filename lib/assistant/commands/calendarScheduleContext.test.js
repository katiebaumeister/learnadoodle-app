import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classWindowForDate,
  timedWindowFromPreviewCommand,
  buildConflictClarification,
} from './calendarScheduleContext.js';
import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES } from './types.js';

describe('classWindowForDate', () => {
  it('returns meeting time when weekday matches', () => {
    // 2026-10-09 is a Friday (5)
    const win = classWindowForDate(
      { weekdays: [1, 3, 5], startTimeHm: '09:30', durationMinutes: 45 },
      '2026-10-09',
    );
    assert.deepEqual(win, { startTimeHm: '09:30', durationMinutes: 45 });
  });

  it('returns null when weekday does not match', () => {
    const win = classWindowForDate(
      { weekdays: [1, 3], startTimeHm: '09:30', durationMinutes: 45 },
      '2026-10-09',
    );
    assert.equal(win, null);
  });
});

describe('timedWindowFromPreviewCommand', () => {
  it('builds a window for timed event.create', () => {
    const window = timedWindowFromPreviewCommand({
      type: DOODLE_COMMAND_TYPES.EVENT_CREATE,
      startAt: '2026-10-09T12:00:00.000Z',
      startTimeHm: '14:00',
      childIds: ['c1'],
    });
    assert.ok(window);
    assert.deepEqual(window.childIds, ['c1']);
    const start = new Date(window.startTs);
    assert.equal(start.getHours(), 14);
    assert.equal(start.getMinutes(), 0);
  });

  it('returns null for untimed event.create', () => {
    const window = timedWindowFromPreviewCommand({
      type: DOODLE_COMMAND_TYPES.EVENT_CREATE,
      startAt: '2026-10-09T12:00:00.000Z',
      childIds: ['c1'],
    });
    assert.equal(window, null);
  });

  it('builds a window for planner.item.move', () => {
    const window = timedWindowFromPreviewCommand({
      type: DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE,
      itemId: 'e1',
      startAt: '2026-10-09T15:00:00.000Z',
      endAt: '2026-10-09T16:00:00.000Z',
      allDay: false,
    });
    assert.ok(window);
    assert.equal(window.excludeEventId, 'e1');
  });

  it('skips all-day moves', () => {
    const window = timedWindowFromPreviewCommand({
      type: DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE,
      itemId: 'e1',
      startAt: '2026-10-09T12:00:00.000Z',
      allDay: true,
    });
    assert.equal(window, null);
  });
});

describe('buildConflictClarification', () => {
  it('offers free-slot chips and keep option', () => {
    const suggestionStart = new Date(2026, 9, 9, 15, 30, 0);
    const clarification = buildConflictClarification({
      conflict: {
        conflicts: [{ title: 'Dentist', start: new Date(), end: new Date() }],
        suggestion: {
          start: suggestionStart,
          end: new Date(suggestionStart.getTime() + 60 * 60 * 1000),
        },
      },
      command: {
        type: DOODLE_COMMAND_TYPES.EVENT_CREATE,
        title: 'Doctors',
        startAt: '2026-10-09T12:00:00.000Z',
        startTimeHm: '14:00',
        childIds: ['c1'],
      },
      originalMessage: 'create event doctors today at 2pm',
      window: {
        startTs: '2026-10-09T18:00:00.000Z',
        endTs: '2026-10-09T19:00:00.000Z',
        durationMs: 3600000,
      },
    });
    assert.equal(clarification.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
    assert.match(clarification.message, /Dentist/);
    assert.ok(clarification.options.some((o) => o.field === 'time'));
    assert.ok(clarification.options.some((o) => o.field === 'conflictResolution'));
    assert.equal(clarification.clarification?.fromConflict, true);
    assert.equal(clarification.clarification?.intent, 'event.create');
  });
});
