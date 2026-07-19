/**
 * Unit smoke tests for Doodle command respond/execute contracts.
 * Run: node --test lib/assistant/commands/respond.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanGuideText,
  doodleRespond,
  formatSchoolYearAttendanceAnswer,
  isAttendanceStatusQuery,
} from './respond.js';
import { collectDoodleContext } from './contextCollector.js';
import { DOODLE_RESPONSE_TYPES } from './types.js';

const baseCtx = collectDoodleContext({
  activeTab: 'planner',
  familyId: 'family-1',
  userId: 'user-1',
  userRole: 'parent',
  enabledFeatures: ['assignments', 'learningAreas', 'attendance', 'materials'],
  schoolYearLabel: '2025/26',
});

const roster = {
  children: [{ id: 'c1', first_name: 'Lilly' }],
  subjects: [{ id: 's1', name: 'History' }, { id: 's2', name: 'Math' }, { id: 's3', name: 'Science' }],
};

test('attendance how-to is specific and has no ##', async () => {
  const res = await doodleRespond({
    message: 'how do I mark attendance?',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ANSWER);
  assert.equal(res.message.includes('##'), false);
  assert.match(res.message, /Year/i);
  assert.match(res.message, /Attendance check/i);
  assert.match(res.message, /Learning/i);
});

test('attendance rate this school year is not Settings navigation', async () => {
  assert.equal(
    isAttendanceStatusQuery('how is Lillys attendance rate this school year'),
    true,
  );
  assert.equal(isAttendanceStatusQuery('how do I mark attendance?'), false);
  assert.equal(isAttendanceStatusQuery('open school year settings'), false);

  const formatted = formatSchoolYearAttendanceAnswer('Lilly', {
    schoolYearLabel: '2025/26',
    rangeLabel: 'Aug 7, 2025 – Aug 21, 2026',
    daysAttended: 18,
    targetDays: 80,
    percent: 23,
    terms: [
      { label: 'Fall', count: 0 },
      { label: 'Spring', count: 2 },
      { label: 'Summer', count: 4 },
      { label: 'Other', count: 12 },
    ],
  });
  assert.match(formatted, /Total attended: 18 days/);
  assert.match(formatted, /Goal: 80 days \(23% of goal\)/);
  assert.match(formatted, /Fall 0 · Spring 2 · Summer 4 · Other 12/);

  const res = await doodleRespond({
    message: 'how is Lillys attendance rate this school year',
    context: baseCtx,
    roster,
  });
  assert.notEqual(res.type, DOODLE_RESPONSE_TYPES.NAVIGATION);
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ANSWER);
  assert.equal(/Open Settings/i.test(res.message), false);
  assert.ok((res.links || []).some((l) => /planner/i.test(l.href || '')));
});

test('cleanGuideText strips markdown headings', () => {
  assert.equal(cleanGuideText('## Planner: calendar\n\nHello'), 'Planner: calendar\n\nHello');
});

test('create event returns action_preview with clean title', async () => {
  const res = await doodleRespond({
    message: 'Create an event tomorrow called Field trip for Lilly',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'event.create');
  assert.equal(res.command.title.toLowerCase(), 'field trip');
  assert.deepEqual(res.command.childIds, ['c1']);
});

test('assignment clarifies subject then continues after History', async () => {
  const first = await doodleRespond({
    message: 'Create an assignment called Read Chapter 4 for Lilly',
    context: baseCtx,
    roster,
  });
  assert.equal(first.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.ok(first.clarification?.intent === 'assignment.create');

  const second = await doodleRespond({
    message: 'History',
    context: baseCtx,
    roster,
    pendingClarification: first.clarification,
    clarificationOption: { id: 's1', label: 'History', value: 's1', field: 'subjectId' },
  });
  assert.equal(second.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(second.command.type, 'assignment.create');
  assert.equal(second.command.subjectId, 's1');
  assert.equal(second.command.title.toLowerCase().includes('read chapter 4'), true);
  assert.deepEqual(second.command.childIds, ['c1']);
});

test('mark attendance returns confirmable preview', async () => {
  const res = await doodleRespond({
    message: 'Mark Lilly present today',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'attendance.mark');
  assert.equal(res.command.status, 'present');
  assert.deepEqual(res.command.childIds, ['c1']);
  assert.match(res.command.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(res.confirmationLabel);
  assert.ok(res.idempotencyKey);
});

test('mark all July learning days as attended is not Open Learning nav', async () => {
  const { parseAttendanceRange, isAttendanceRangeMarkIntent } = await import('../attendanceChatActions.js');
  const { isAttendanceMarkIntent } = await import('./respond.js');

  const saturday = new Date('2026-07-18T15:00:00');
  const range = parseAttendanceRange('mark all July learning days as attended', saturday);
  assert.ok(range);
  assert.equal(range.startDate, '2026-07-01');
  assert.equal(range.endDate, '2026-07-18');
  assert.equal(isAttendanceRangeMarkIntent('mark all July learning days as attended'), true);
  assert.equal(isAttendanceMarkIntent('mark all July learning days as attended'), true);
  assert.equal(isAttendanceMarkIntent('Mark Lilly present today'), true);

  const res = await doodleRespond({
    message: 'mark all July learning days as attended',
    context: baseCtx,
    roster,
  });
  assert.notEqual(res.type, DOODLE_RESPONSE_TYPES.NAVIGATION);
  assert.notEqual(res.destination?.href, '/learning');
  // Preview when events load; otherwise answer/error — never Learning nav.
  assert.ok(
    res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
    || res.type === DOODLE_RESPONSE_TYPES.ANSWER
    || res.type === DOODLE_RESPONSE_TYPES.ERROR
    || res.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
  );
  if (res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    assert.equal(res.command.type, 'attendance.mark_range');
  }
});

test('school year update returns preview', async () => {
  const res = await doodleRespond({
    message: 'Set learning hours to 4 per day',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'school_year.update');
  assert.equal(res.command.patch.default_planned_hours_per_day, 4);
});

test('day off create returns preview', async () => {
  const res = await doodleRespond({
    message: 'Add a day off called Holiday tomorrow',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'day_off.create');
  assert.equal(res.command.title, 'Holiday');
});

test('material link clarifies when URL missing', async () => {
  const res = await doodleRespond({
    message: 'Add a material called Khan Academy',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(res.clarification?.intent, 'material.create_link');
});

test('material link with URL returns preview', async () => {
  const res = await doodleRespond({
    message: 'Add a material called Khan Academy https://www.khanacademy.org',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'material.create_link');
  assert.equal(res.command.providerUrl, 'https://www.khanacademy.org');
});

test('subject create returns preview', async () => {
  const res = await doodleRespond({
    message: 'Create a subject called Biology for Lilly',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'subject.create');
  assert.equal(res.command.name, 'Biology');
  assert.equal(res.command.childId, 'c1');
});

test('child create returns preview', async () => {
  const res = await doodleRespond({
    message: 'Add a child named Sam',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'child.create');
  assert.equal(res.command.name, 'Sam');
});

test('learning day clarifies subject then day then previews', async () => {
  const first = await doodleRespond({
    message: 'Create a learning day',
    context: baseCtx,
    roster,
  });
  assert.equal(first.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(first.clarification?.intent, 'learning_day.create');
  assert.equal(first.clarification?.field, 'subjectId');

  const second = await doodleRespond({
    message: 'History',
    context: baseCtx,
    roster,
    pendingClarification: first.clarification,
    clarificationOption: { id: 's1', label: 'History', value: 's1', field: 'subjectId' },
  });
  assert.equal(second.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(second.clarification?.field, 'date');

  const tomorrowOpt = (second.options || []).find((o) => /tomorrow/i.test(o.label));
  assert.ok(tomorrowOpt);

  const third = await doodleRespond({
    message: 'Tomorrow',
    context: baseCtx,
    roster,
    pendingClarification: second.clarification,
    clarificationOption: tomorrowOpt,
  });
  assert.equal(third.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(third.command.type, 'learning_day.create');
  assert.equal(third.command.subjectId, 's1');
  assert.equal(third.command.date, tomorrowOpt.value);
});

test('mark as done with known itemId returns confirmable preview', async () => {
  const { preparePlannerItemComplete, extractCompleteQuery, scoreEventTitle } = await import('./intentPreparers.js');
  assert.equal(extractCompleteQuery('mark reading assignment today as done'), 'reading assignment');
  assert.ok(scoreEventTitle('reading assignment', 'Read Chapter 4') >= 5);

  const res = await preparePlannerItemComplete(
    'mark reading assignment today as done',
    baseCtx,
    roster,
    { itemId: 'ev-1', itemTitle: 'Read Chapter 4', whenLabel: 'Today' },
  );
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'planner.item.complete');
  assert.equal(res.command.itemId, 'ev-1');
  assert.equal(res.confirmationLabel, 'Mark done');
});

test('move field trip to sunday resolves to Sunday and previews', async () => {
  const { parseMoveTargetDay, preparePlannerItemMove } = await import('./intentPreparers.js');

  // Week of Jul 12–18 2026 starts Sunday — “to sunday” should land on Jul 12.
  const weekStart = new Date('2026-07-12T12:00:00');
  const sunday = parseMoveTargetDay('move field trip to sunday', weekStart);
  assert.ok(sunday);
  assert.equal(sunday.getDay(), 0);
  assert.equal(sunday.getFullYear(), 2026);
  assert.equal(sunday.getMonth(), 6);
  assert.equal(sunday.getDate(), 12);

  // From Friday, “to sunday” is the upcoming Sunday (Jul 19).
  const friday = new Date('2026-07-17T12:00:00');
  const nextSun = parseMoveTargetDay('move field trip to sunday', friday);
  assert.equal(nextSun.getDate(), 19);
  assert.equal(nextSun.getMonth(), 6);

  // Event on Sat Jul 18 → “to sunday” moves to that week’s Sunday (Jul 12).
  const res = await preparePlannerItemMove(
    'move field trip to sunday',
    { ...baseCtx, visibleDateStart: '2026-07-12' },
    roster,
    {
      itemId: 'ev-trip',
      itemTitle: 'field trip for lilly',
      originalStartAt: '2026-07-18T12:00:00',
      durationMs: 24 * 60 * 60 * 1000,
      allDay: true,
    },
  );
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'planner.item.move');
  assert.equal(res.command.itemId, 'ev-trip');
  assert.equal(res.command.allDay, true);
  const moved = new Date(res.command.startAt);
  assert.equal(moved.getFullYear(), 2026);
  assert.equal(moved.getMonth(), 6);
  assert.equal(moved.getDate(), 12);
  assert.equal(moved.getHours(), 0);
  const whenField = (res.preview || []).find((f) => f.label === 'When');
  assert.ok(whenField);
  assert.match(whenField.value, /All day/i);
  assert.equal(/12:00|11:59/i.test(whenField.value), false);
  assert.ok(res.confirmationLabel);
});

test('formatMoveWhenLabel uses All day for all-day spans', async () => {
  const { formatMoveWhenLabel } = await import('./commandUtils.js');
  const label = formatMoveWhenLabel(
    '2026-07-19T00:00:00',
    '2026-07-19T23:59:59.999',
    true,
  );
  assert.match(label, /All day/i);
  assert.equal(/12:00|11:59/i.test(label), false);
});

test('formatDisplayDate keeps YYYY-MM-DD on the local calendar day', async () => {
  const { formatDisplayDate, toYmd } = await import('./commandUtils.js');
  // Regression: new Date('YYYY-MM-DD') is UTC and can show as “yesterday” in US timezones.
  const todayYmd = toYmd(new Date());
  const label = formatDisplayDate(todayYmd);
  const local = new Date();
  const expectedDay = local.getDate();
  assert.match(label, new RegExp(String(expectedDay)));
  assert.equal(formatDisplayDate('2026-07-18').includes('17'), false);
  assert.match(formatDisplayDate('2026-07-18'), /Jul/);
  assert.match(formatDisplayDate('2026-07-18'), /18/);
});

test('learning day date clarification accepts typed next week / weekday', async () => {
  const { resolveFlexibleDay, parseMoveTargetDay } = await import('./intentPreparers.js');

  const saturday = new Date('2026-07-18T15:00:00');
  assert.equal(resolveFlexibleDay('Today', saturday), '2026-07-18');
  assert.equal(resolveFlexibleDay('Tomorrow', saturday), '2026-07-19');
  assert.equal(resolveFlexibleDay('next week', saturday), '2026-07-20'); // next Monday
  assert.equal(resolveFlexibleDay('Monday', saturday), '2026-07-20');
  assert.equal(toYmdFromParse(parseMoveTargetDay('next Saturday', saturday)), '2026-07-25');

  const first = await doodleRespond({
    message: 'Create a learning day',
    context: baseCtx,
    roster,
  });
  const second = await doodleRespond({
    message: 'History',
    context: baseCtx,
    roster,
    pendingClarification: first.clarification,
    clarificationOption: { id: 's1', label: 'History', value: 's1', field: 'subjectId' },
  });
  assert.equal(second.clarification?.field, 'date');

  const typed = await doodleRespond({
    message: 'next week',
    context: baseCtx,
    roster,
    pendingClarification: second.clarification,
  });
  assert.equal(typed.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(typed.command.type, 'learning_day.create');
  assert.match(String(typed.command.date), /^\d{4}-\d{2}-\d{2}$/);
  const whenField = (typed.preview || []).find((f) => f.label === 'When');
  assert.ok(whenField);
  // Preview day number must match the YMD day (not UTC-shifted yesterday).
  const dayNum = Number(String(typed.command.date).slice(-2));
  assert.match(whenField.value, new RegExp(String(dayNum)));
});

function toYmdFromParse(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test('create lesson with attachment asks for subject (not Materials-only)', async () => {
  const res = await doodleRespond({
    message: 'create a new lesson for tomorrow using this',
    context: baseCtx,
    roster,
    attachments: [{
      attachmentId: 'att-1',
      fileName: 'religious-economy.pdf',
      mime: 'application/pdf',
      mimeLabel: 'PDF',
      bytes: 1100000,
    }],
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(res.clarification?.intent, 'learning_day.create');
  assert.equal(res.clarification?.field, 'subjectId');
  assert.equal(res.clarification?.draft?.attachmentId, 'att-1');
  assert.equal(res.clarification?.draft?.createLesson, true);
  assert.match(res.message, /subject/i);
});

test('create lesson with attachment continues to preview after subject', async () => {
  const first = await doodleRespond({
    message: 'create a new lesson for tomorrow using this',
    context: baseCtx,
    roster,
    attachments: [{
      attachmentId: 'att-1',
      fileName: 'religious-economy.pdf',
      mime: 'application/pdf',
      mimeLabel: 'PDF',
      bytes: 1100000,
    }],
  });
  assert.equal(first.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);

  const second = await doodleRespond({
    message: 'History',
    context: baseCtx,
    roster,
    pendingClarification: first.clarification,
    clarificationOption: { id: 's1', label: 'History', value: 's1', field: 'subjectId' },
  });
  assert.equal(second.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(second.command.type, 'learning_day.create');
  assert.equal(second.command.subjectId, 's1');
  assert.equal(second.command.createLesson, true);
  assert.equal(second.command.attachmentId, 'att-1');
  assert.equal(second.command.fileName, 'religious-economy.pdf');
  assert.match(String(second.command.date), /^\d{4}-\d{2}-\d{2}$/);
  const materialField = (second.preview || []).find((f) => f.label === 'Material');
  assert.ok(materialField);
  assert.match(materialField.value, /religious-economy/i);
});

test('plain attachment without lesson intent still goes to Materials', async () => {
  const res = await doodleRespond({
    message: 'save this',
    context: baseCtx,
    roster,
    attachments: [{
      attachmentId: 'att-2',
      fileName: 'notes.pdf',
      mime: 'application/pdf',
      mimeLabel: 'PDF',
      bytes: 1000,
    }],
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'material.create_file');
});
