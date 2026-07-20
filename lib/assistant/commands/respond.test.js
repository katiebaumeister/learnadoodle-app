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
  isAttendanceExportIntent,
  isPlannerExportIntent,
  resolveAccountSettingsDestination,
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

test('create event today doctors for Lilly uses title and real today', async () => {
  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const res = await doodleRespond({
    message: 'create new event today doctors for Lilly at 2',
    context: {
      ...baseCtx,
      // Stale planner range must not override “today”
      visibleDateStart: '2026-07-18T12:00:00.000Z',
      visibleDateEnd: '2026-07-18T12:00:00.000Z',
    },
    roster: {
      children: [
        { id: 'c1', first_name: 'Lilly' },
        { id: 'c2', first_name: 'Max' },
      ],
      subjects: roster.subjects,
    },
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'event.create');
  assert.equal(res.command.title.toLowerCase(), 'doctors');
  assert.deepEqual(res.command.childIds, ['c1']);
  assert.equal(res.command.startTimeHm, '02:00');
  assert.equal(res.command.dateLabel, todayLabel);
  const start = new Date(res.command.startAt);
  assert.equal(start.getFullYear(), today.getFullYear());
  assert.equal(start.getMonth(), today.getMonth());
  assert.equal(start.getDate(), today.getDate());
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

test('assignment with attachment asks subject (not Materials-only)', async () => {
  const first = await doodleRespond({
    message: 'add new assignment tomorrow',
    context: baseCtx,
    roster,
    attachments: [{
      attachmentId: 'att-asg',
      fileName: 'Central Bank Digital Currency.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mimeLabel: 'DOCX',
      bytes: 307000,
    }],
  });
  assert.equal(first.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(first.clarification?.intent, 'assignment.create');
  assert.equal(first.clarification?.field, 'subjectId');
  assert.match(first.message, /subject/i);
  assert.equal(first.clarification?.draft?.title, 'Central Bank Digital Currency');

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
  assert.equal(second.command.attachmentId, 'att-asg');
  assert.equal(second.command.title, 'Central Bank Digital Currency');
  assert.ok(second.preview.some((row) => row.label === 'Attachment'));
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
  // July 2026 starts Wed — include Mon/Tue overflow cells (Jun 29–30 History on the month grid).
  assert.equal(range.startDate, '2026-06-29');
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

test('calendar event update/delete intents route correctly', async () => {
  const {
    isEventUpdateIntent,
    isEventDeleteIntent,
  } = await import('./intentPreparers.js');

  assert.equal(isEventUpdateIntent('update field trip location to Museum'), true);
  assert.equal(isEventDeleteIntent('delete the field trip event'), true);
  assert.equal(isEventDeleteIntent('delete History learning day on July 8'), false);

  const updateRes = await doodleRespond({
    message: 'update field trip location to Museum',
    context: baseCtx,
    roster,
  });
  assert.ok(
    updateRes.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
    || updateRes.type === DOODLE_RESPONSE_TYPES.ERROR
    || updateRes.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
  );
  if (updateRes.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    assert.equal(updateRes.command.type, 'event.update');
  }

  const deleteRes = await doodleRespond({
    message: 'delete the field trip event',
    context: baseCtx,
    roster,
  });
  assert.ok(
    deleteRes.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
    || deleteRes.type === DOODLE_RESPONSE_TYPES.ERROR
    || deleteRes.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
  );
  if (deleteRes.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    assert.equal(deleteRes.command.type, 'event.delete');
  }
});

test('learning day update/delete intents route correctly', async () => {
  const {
    isLearningDayUpdateIntent,
    isLearningDayDeleteIntent,
    parseUnitLessonFromMessage,
    prepareLearningDayUpdate,
  } = await import('./intentPreparers.js');

  assert.equal(isLearningDayUpdateIntent('change History learning day on July 8 to 45 minutes'), true);
  assert.equal(isLearningDayUpdateIntent('add session notes to Friday learning day: used workbook'), true);
  assert.equal(isLearningDayUpdateIntent('move tomorrows learning day to a new unit 1'), true);
  assert.equal(isLearningDayDeleteIntent('delete History learning day on July 8'), true);
  assert.equal(isLearningDayDeleteIntent('change History to be on Thursdays too'), false);

  assert.deepEqual(parseUnitLessonFromMessage('move tomorrows learning day to a new unit 1'), {
    unitTitle: 'Unit 1',
  });
  assert.deepEqual(parseUnitLessonFromMessage('unit 1 lesson 1'), {
    unitTitle: 'Unit 1',
    lessonTitle: 'Lesson 1',
  });

  const unitMove = await prepareLearningDayUpdate(
    'move tomorrows learning day to a new unit 1',
    baseCtx,
    roster,
    { eventId: 'ev-cine', eventTitle: 'cinematography learning day' },
  );
  assert.equal(unitMove.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(unitMove.command.type, 'learning_day.update');
  assert.equal(unitMove.command.patch.unitTitle, 'Unit 1');

  const unitLessonFollowUp = await prepareLearningDayUpdate(
    'unit 1 lesson 1',
    baseCtx,
    roster,
    { eventId: 'ev-cine', eventTitle: 'cinematography learning day' },
  );
  assert.equal(unitLessonFollowUp.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(unitLessonFollowUp.command.patch.unitTitle, 'Unit 1');
  assert.equal(unitLessonFollowUp.command.patch.lessonTitle, 'Lesson 1');

  const updateRes = await doodleRespond({
    message: 'change History learning day on July 8 to 45 minutes',
    context: baseCtx,
    roster,
  });
  assert.ok(
    updateRes.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
    || updateRes.type === DOODLE_RESPONSE_TYPES.ERROR
    || updateRes.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
  );
  if (updateRes.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    assert.equal(updateRes.command.type, 'learning_day.update');
  }

  const deleteRes = await doodleRespond({
    message: 'delete History learning day on July 8',
    context: baseCtx,
    roster,
  });
  assert.ok(
    deleteRes.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
    || deleteRes.type === DOODLE_RESPONSE_TYPES.ERROR
    || deleteRes.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
  );
  if (deleteRes.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    assert.equal(deleteRes.command.type, 'learning_day.delete');
  }
});

test('app guide answers never mention backlog', async () => {
  const { searchLocalAppGuide } = await import('../../appGuide/localGuideSearch.js');
  const hits = searchLocalAppGuide('unit 1 lesson 1', { limit: 3 }) || [];
  for (const hit of hits) {
    const text = String(hit.content || hit.text || hit.chunk || hit);
    assert.equal(/backlog/i.test(text), false, text);
  }
  const res = await doodleRespond({
    message: 'what is planner backlog?',
    context: baseCtx,
    roster,
  });
  assert.equal(/backlog/i.test(res.message || ''), false);
});

test('learning day update patchDetail clarification continues with unit/lesson', async () => {
  const { prepareLearningDayUpdate, continueIntentClarification } = await import('./intentPreparers.js');
  const ask = await prepareLearningDayUpdate(
    'change this learning day',
    baseCtx,
    roster,
    { eventId: 'ev-cine', eventTitle: 'cinematography learning day' },
  );
  assert.equal(ask.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(ask.clarification?.field, 'patchDetail');
  assert.equal(ask.clarification?.draft?.eventId, 'ev-cine');

  const continued = await continueIntentClarification(
    ask.clarification,
    'unit 1 lesson 1',
    null,
    baseCtx,
    roster,
  );
  assert.equal(continued.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(continued.command.patch.unitTitle, 'Unit 1');
  assert.equal(continued.command.patch.lessonTitle, 'Lesson 1');
});

test('tomorrows without apostrophe resolves to tomorrow', async () => {
  const { resolveFlexibleDay } = await import('./intentPreparers.js');
  const base = new Date(2026, 6, 20); // Jul 20, 2026
  assert.equal(resolveFlexibleDay('tomorrows', base), '2026-07-21');
  assert.equal(resolveFlexibleDay("tomorrow's", base), '2026-07-21');
  assert.equal(resolveFlexibleDay('move tomorrows learning day to a new unit 1', base), '2026-07-21');
});

test('pending action preview can be refined with and lesson 1', async () => {
  const pendingAction = {
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Update learning day',
    command: {
      type: 'learning_day.update',
      householdId: 'family-1',
      eventId: 'ev-cine',
      eventTitle: 'cinematography learning day',
      patch: { unitTitle: 'Unit 1' },
    },
    preview: [{ label: 'Unit', value: 'Unit 1' }],
    confirmationLabel: 'Save learning day',
  };
  const res = await doodleRespond({
    message: 'and lesson 1',
    context: baseCtx,
    roster,
    pendingAction,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'learning_day.update');
  assert.equal(res.command.eventId, 'ev-cine');
  assert.equal(res.command.patch.unitTitle, 'Unit 1');
  assert.equal(res.command.patch.lessonTitle, 'Lesson 1');
  assert.equal(/backlog|classwork learning days/i.test(res.message || ''), false);

  const alsoDo = await doodleRespond({
    message: 'also do lesson 1',
    context: baseCtx,
    roster,
    pendingAction,
  });
  assert.equal(alsoDo.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(alsoDo.command.eventId, 'ev-cine');
  assert.equal(alsoDo.command.patch.lessonTitle, 'Lesson 1');
  assert.equal(alsoDo.command.patch.unitTitle, 'Unit 1');
});

test('stale itemId clarification does not treat also do lesson 1 as a uuid', async () => {
  const { continueIntentClarification } = await import('./intentPreparers.js');
  const continued = await continueIntentClarification(
    {
      intent: 'learning_day.update',
      field: 'itemId',
      originalMessage: 'move tomorrows learning day to a new unit 1',
      draft: {
        eventId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        eventTitle: 'cinematography learning day',
        patch: { unitTitle: 'Unit 1' },
      },
    },
    'also do lesson 1',
    null,
    baseCtx,
    roster,
  );
  assert.equal(continued.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(continued.command.eventId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(continued.command.patch.unitTitle, 'Unit 1');
  assert.equal(continued.command.patch.lessonTitle, 'Lesson 1');
});

test('add learning days fri and sat asks for subject (not Open Learning)', async () => {
  const { isLearningDayCreateIntent, parseWeekdayDatesFromMessage } = await import('./intentPreparers.js');
  assert.equal(isLearningDayCreateIntent('add learning days fri and sat'), true);

  const sunday = new Date(2026, 6, 19); // Jul 19, 2026
  assert.deepEqual(parseWeekdayDatesFromMessage('add learning days fri and sat', sunday), [
    '2026-07-24',
    '2026-07-25',
  ]);

  const res = await doodleRespond({
    message: 'add learning days fri and sat',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(res.clarification?.intent, 'learning_day.create');
  assert.equal(res.clarification?.field, 'subjectId');
  assert.match(res.message, /subject/i);

  const preview = await doodleRespond({
    message: 'History',
    context: baseCtx,
    roster,
    pendingClarification: res.clarification,
    clarificationOption: {
      field: 'subjectId',
      value: 's1',
      label: 'History',
    },
  });
  assert.equal(preview.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(preview.command.type, 'learning_day.create');
  assert.deepEqual(preview.command.dates, ['2026-07-24', '2026-07-25']);
  assert.ok(preview.preview.some((row) => row.label === 'Days'));
});

test('learning day for named subject uses subject + its students (no clarifications)', async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYmd = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, '0'),
    String(tomorrow.getDate()).padStart(2, '0'),
  ].join('-');

  const res = await doodleRespond({
    message: 'add new learning day for cinematography tomorrow',
    context: baseCtx,
    roster: {
      children: [
        { id: 'c1', first_name: 'Lilly' },
        { id: 'c2', first_name: 'Max' },
      ],
      subjects: [
        { id: 's-cine', name: 'cinematography', child_id: 'c1;c2' },
        { id: 's1', name: 'History', child_id: 'c1' },
      ],
    },
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'learning_day.create');
  assert.equal(res.command.subjectId, 's-cine');
  assert.deepEqual(res.command.childIds, ['c1', 'c2']);
  assert.equal(res.command.date, tomorrowYmd);
});

test('learning day defaults to all children when subject has empty child_id', async () => {
  const res = await doodleRespond({
    message: 'add new learning day for cinematography tomorrow',
    context: baseCtx,
    roster: {
      children: [
        { id: 'c1', first_name: 'Lilly' },
        { id: 'c2', first_name: 'Max' },
      ],
      subjects: [
        { id: 's-cine', name: 'cinematography', child_id: '' },
      ],
    },
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.deepEqual(res.command.childIds, ['c1', 'c2']);
});

test('learning day without child_id on subject defaults to all children', async () => {
  // Mirrors the lightweight subjects list (id + name only) that used to feed Doodle.
  const res = await doodleRespond({
    message: 'add new learning day for cinematography tomorrow',
    context: baseCtx,
    roster: {
      children: [
        { id: 'c1', first_name: 'Lilly' },
        { id: 'c2', first_name: 'Max' },
      ],
      subjects: [
        { id: 's-cine', name: 'cinematography' },
      ],
    },
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.deepEqual(res.command.childIds, ['c1', 'c2']);
});

test('change History to be on Thursdays too updates subject schedule', async () => {
  const {
    isSubjectUpdateIntent,
    mergeWeekdaysFromMessage,
  } = await import('./intentPreparers.js');
  const msg = 'change history to be on Thursdays too';
  assert.equal(isSubjectUpdateIntent(msg, roster), true);
  // Mon/Tue/Wed + “Thursdays too” → include Thursday (4)
  assert.deepEqual(mergeWeekdaysFromMessage([1, 2, 3], msg), [1, 2, 3, 4]);

  const res = await doodleRespond({
    message: msg,
    context: baseCtx,
    roster,
  });
  // Preview when plan loads; otherwise clarification/error — never generic how-to.
  assert.ok(
    res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
    || res.type === DOODLE_RESPONSE_TYPES.ERROR
    || res.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
  );
  if (res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    assert.equal(res.command.type, 'subject.update');
    assert.ok(res.command.schedule?.weekdays?.includes(4));
  }
});

test('mark all attendance for the school year routes to mark_range', async () => {
  const {
    isAttendanceRangeMarkIntent,
    isSchoolYearAttendanceRangeIntent,
  } = await import('../attendanceChatActions.js');
  const { isAttendanceMarkIntent } = await import('./respond.js');

  const msg = 'mark all attendance for the school year as done';
  assert.equal(isAttendanceMarkIntent(msg), true);
  assert.equal(isSchoolYearAttendanceRangeIntent(msg), true);
  assert.equal(isAttendanceRangeMarkIntent(msg), true);

  const res = await doodleRespond({
    message: msg,
    context: baseCtx,
    roster,
  });
  // Must not fall back to single-day attendance.mark for “today”.
  if (res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    assert.equal(res.command.type, 'attendance.mark_range');
    assert.notEqual(res.command.type, 'attendance.mark');
  } else {
    assert.ok(
      res.type === DOODLE_RESPONSE_TYPES.ANSWER
      || res.type === DOODLE_RESPONSE_TYPES.ERROR
      || res.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
    );
  }
});

test('bulk attendance modal term intents route like Attendance check', async () => {
  const {
    isAttendanceRangeMarkIntent,
    isBulkAttendanceModalIntent,
    parseTermKeyFromMessage,
  } = await import('../attendanceChatActions.js');
  const { isAttendanceMarkIntent } = await import('./respond.js');
  const { prepareAttendanceMarkRange } = await import('./intentPreparers.js');
  const { getCommand } = await import('./registry.js');
  await import('./registerAll.js');

  assert.equal(parseTermKeyFromMessage('mark Spring term attended for Lilly'), 'spring');
  assert.equal(isBulkAttendanceModalIntent('bulk attendance'), true);
  assert.equal(isBulkAttendanceModalIntent('Mark full range attended'), true);
  assert.equal(isAttendanceMarkIntent('bulk attendance'), true);
  assert.equal(isAttendanceRangeMarkIntent('mark Spring term attended for Lilly'), true);

  const bulkAsk = await doodleRespond({
    message: 'bulk attendance',
    context: baseCtx,
    roster,
  });
  assert.equal(bulkAsk.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(bulkAsk.clarification?.intent, 'attendance.mark_range');
  assert.equal(bulkAsk.clarification?.field, 'termKey');
  assert.ok((bulkAsk.options || []).some((o) => o.value === 'spring'));

  const springPreview = await prepareAttendanceMarkRange(
    'mark Spring term attended for Lilly',
    baseCtx,
    roster,
    {
      termKey: 'spring',
      startDate: '2026-01-08',
      endDate: '2026-05-13',
      rangeLabel: 'Spring term',
      termLabel: 'Spring',
      childIds: ['c1'],
    },
  );
  // May be preview (events found), answer (none), or error (supabase) — not single-day mark.
  assert.ok(
    springPreview.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
    || springPreview.type === DOODLE_RESPONSE_TYPES.ANSWER
    || springPreview.type === DOODLE_RESPONSE_TYPES.ERROR
    || springPreview.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
  );
  if (springPreview.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    assert.equal(springPreview.command.type, 'attendance.mark_range');
    assert.equal(springPreview.command.termLabel, 'Spring');
    assert.equal(springPreview.command.startDate, '2026-01-08');
    assert.equal(springPreview.command.endDate, '2026-05-13');
    assert.equal(springPreview.confirmationLabel, 'Confirm');
    assert.match(springPreview.message, /left untouched/i);
    assert.ok(springPreview.preview.some((r) => r.label === 'Term' && r.value === 'Spring'));
    assert.ok(springPreview.preview.some((r) => r.label === 'Note'));
  }

  const markRange = getCommand('attendance.mark_range');
  const parentOk = markRange.authorize(
    { type: 'attendance.mark_range', householdId: 'family-1', startDate: '2026-01-01', endDate: '2026-01-02', eventIds: ['e1'] },
    { ...baseCtx, householdId: 'family-1', userRole: 'parent' },
    {},
  );
  const tutorOk = markRange.authorize(
    { type: 'attendance.mark_range', householdId: 'family-1', startDate: '2026-01-01', endDate: '2026-01-02', eventIds: ['e1'] },
    { ...baseCtx, householdId: 'family-1', userRole: 'tutor' },
    { canMarkAttendance: true },
  );
  const childDenied = markRange.authorize(
    { type: 'attendance.mark_range', householdId: 'family-1', startDate: '2026-01-01', endDate: '2026-01-02', eventIds: ['e1'] },
    { ...baseCtx, householdId: 'family-1', userRole: 'child' },
    {},
  );
  assert.equal(parentOk.ok, true);
  assert.equal(tutorOk.ok, true);
  assert.equal(childDenied.ok, false);

  const childRes = await doodleRespond({
    message: 'mark Spring term attended',
    context: { ...baseCtx, userRole: 'child', householdId: 'family-1' },
    roster,
  });
  assert.equal(childRes.type, DOODLE_RESPONSE_TYPES.ANSWER);
  assert.match(childRes.message, /parents and tutors/i);
});

test('eventLocalDayKey uses local calendar day of start_ts', async () => {
  const { eventLocalDayKey } = await import('../attendanceChatActions.js');
  assert.ok(eventLocalDayKey({ start_ts: '2026-07-02T16:00:00.000Z' }));
  assert.match(eventLocalDayKey({ start_ts: '2026-07-02T16:00:00.000Z' }), /^\d{4}-\d{2}-\d{2}$/);
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

test('school year end date updates last configured term', async () => {
  const {
    isSchoolYearSettingsIntent,
    prepareSchoolYearUpdate,
    resolveLastConfiguredTermKey,
  } = await import('./intentPreparers.js');

  assert.equal(isSchoolYearSettingsIntent('change this school year to end aug 31'), true);
  assert.equal(
    resolveLastConfiguredTermKey({
      default_fall_term_end_date: '2025-12-19',
      default_spring_term_end_date: '2026-05-13',
      default_summer_term_end_date: '2026-08-21',
    }),
    'summer',
  );
  assert.equal(
    resolveLastConfiguredTermKey({
      default_fall_term_end_date: '2025-12-19',
      default_spring_term_end_date: '2026-05-13',
    }),
    'spring',
  );

  const withSummer = await prepareSchoolYearUpdate(
    'change this school year to end aug 31',
    baseCtx,
    {
      schoolYearLabel: '2025/26',
      settings: {
        default_fall_term_end_date: '2025-12-19',
        default_spring_term_end_date: '2026-05-13',
        default_summer_term_end_date: '2026-08-21',
      },
    },
  );
  assert.equal(withSummer.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(withSummer.command.type, 'school_year.update');
  assert.equal(withSummer.command.patch.default_year_end_date, '2026-08-31');
  assert.equal(withSummer.command.patch.default_summer_term_end_date, '2026-08-31');

  const fallSpringOnly = await prepareSchoolYearUpdate(
    'change this school year to end May 31',
    baseCtx,
    {
      schoolYearLabel: '2025/26',
      settings: {
        default_fall_term_end_date: '2025-12-19',
        default_spring_term_end_date: '2026-05-13',
      },
    },
  );
  assert.equal(fallSpringOnly.command.patch.default_year_end_date, '2026-05-31');
  assert.equal(fallSpringOnly.command.patch.default_spring_term_end_date, '2026-05-31');
  assert.equal(fallSpringOnly.command.patch.default_summer_term_end_date, undefined);
});

test('school year settings modal fields route via chat', async () => {
  const { isSchoolYearSettingsIntent } = await import('./intentPreparers.js');
  assert.equal(isSchoolYearSettingsIntent('set learning days to Monday Tuesday Wednesday'), true);
  assert.equal(isSchoolYearSettingsIntent('set school hours from 9am to 3pm'), true);
  assert.equal(isSchoolYearSettingsIntent('set attendance goal to 80 days'), true);
  assert.equal(isSchoolYearSettingsIntent('set tracking mode to total class days'), true);

  const days = await doodleRespond({
    message: 'set learning days to Monday Tuesday Wednesday',
    context: baseCtx,
    roster,
  });
  assert.equal(days.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(days.command.type, 'school_year.update');
  assert.deepEqual(days.command.patch.allowed_weekdays, [1, 2, 3]);

  const hours = await doodleRespond({
    message: 'set school hours from 9am to 3pm',
    context: baseCtx,
    roster,
  });
  assert.equal(hours.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(hours.command.patch.default_day_start_time, '09:00:00');
  assert.equal(hours.command.patch.default_day_end_time, '15:00:00');
  assert.equal(hours.command.patch.default_planned_hours_per_day, 6);

  const goal = await doodleRespond({
    message: 'set attendance goal to 80 days',
    context: baseCtx,
    roster,
  });
  assert.equal(goal.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(goal.command.patch.default_target_days, 80);
  assert.equal(goal.command.patch.default_constraint_mode, 'days');

  const mode = await doodleRespond({
    message: 'set tracking mode to total class days',
    context: baseCtx,
    roster,
  });
  assert.equal(mode.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(mode.command.patch.attendance_tracking_mode, 'class_day');
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

test('day off create with learning conflicts can move or leave', async () => {
  const { prepareDayOffCreate } = await import('./intentPreparers.js');
  const conflicts = [{
    id: 'ev-hist',
    title: 'History',
    start_ts: '2026-07-22T13:00:00.000Z',
    end_ts: '2026-07-22T14:00:00.000Z',
  }];
  const move = await prepareDayOffCreate('make Wednesday a day off', baseCtx, {
    title: 'Day off',
    startDate: '2026-07-22',
    endDate: '2026-07-22',
    eventHandling: 'move',
    conflictEvents: conflicts,
  });
  assert.equal(move.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(move.command.eventHandling, 'move');
  assert.deepEqual(move.command.conflictEventIds, ['ev-hist']);
  assert.ok(move.preview.some((row) => /Move learning/i.test(row.value)));

  const leave = await prepareDayOffCreate('make Wednesday a day off', baseCtx, {
    title: 'Day off',
    startDate: '2026-07-22',
    endDate: '2026-07-22',
    eventHandling: 'leave',
    conflictEvents: conflicts,
  });
  assert.equal(leave.command.eventHandling, 'leave');
  assert.ok(leave.preview.some((row) => /Leave scheduled learning/i.test(row.value)));

  const del = await prepareDayOffCreate('make Wednesday a day off', baseCtx, {
    title: 'Day off',
    startDate: '2026-07-22',
    endDate: '2026-07-22',
    eventHandling: 'delete',
    conflictEvents: conflicts,
  });
  assert.equal(del.command.eventHandling, 'delete');
  assert.ok(del.preview.some((row) => /Delete the learning day/i.test(row.value)));
});

test('day off range create parses start and end', async () => {
  const res = await doodleRespond({
    message: 'Add a day off called Holiday in France from May 6, 2026 to May 7, 2026',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'day_off.create');
  assert.match(res.command.title, /Holiday/i);
  assert.equal(res.command.startDate, '2026-05-06');
  assert.equal(res.command.endDate, '2026-05-07');
});

test('break shorthand July 27-29 parses as a date range', async () => {
  const { prepareDayOffCreate } = await import('./intentPreparers.js');
  const res = await prepareDayOffCreate('add break July 27-29', baseCtx, {
    eventHandling: 'leave',
    conflictEvents: [],
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.startDate, '2026-07-27');
  assert.equal(res.command.endDate, '2026-07-29');
  assert.equal(res.command.title, 'Break');
  assert.ok(res.preview.some((row) => /Break \(date range\)/i.test(row.value)));
});

test('day off create rejects repeating like the modal', async () => {
  const res = await doodleRespond({
    message: 'Add a repeating day off called Winter Break every year',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ANSWER);
  assert.match(res.message, /Repeating days off are not supported/i);
});

test('day off create notes unsaved location/times like the modal', async () => {
  const res = await doodleRespond({
    message: 'Add a day off called Museum Day on May 6, 2026 at 10am location Museum notes Bring lunch',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'day_off.create');
  assert.equal(res.command.title, 'Museum Day');
  assert.equal(res.command.startDate, '2026-05-06');
  assert.ok(res.command.unsupportedExtras?.includes('location'));
  assert.ok(res.command.unsupportedExtras?.includes('notes'));
  assert.ok(res.command.unsupportedExtras?.some((x) => /time/i.test(x)));
  assert.match(res.message, /aren’t saved|aren't saved/i);
  assert.ok(res.preview.some((row) => row.label === 'Type' && row.value === 'Day off'));
});

test('day off update with editRow returns save preview', async () => {
  const { prepareDayOffUpdate } = await import('./intentPreparers.js');
  const res = await prepareDayOffUpdate(
    'Rename day off to Spring Break',
    baseCtx,
    {
      editRow: {
        id: 'excl-1',
        kind: 'holiday',
        name: 'Holiday',
        start: '2026-05-06',
        end: '2026-05-06',
      },
    },
  );
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'day_off.create');
  assert.equal(res.command.title, 'Spring Break');
  assert.equal(res.command.editRow.id, 'excl-1');
  assert.equal(res.command.startDate, '2026-05-06');
  assert.equal(res.confirmationLabel, 'Save day off');
});

test('day off update can change date range', async () => {
  const { prepareDayOffUpdate } = await import('./intentPreparers.js');
  const res = await prepareDayOffUpdate(
    'Change day off Holiday from May 6, 2026 to May 8, 2026',
    baseCtx,
    {
      editRow: {
        id: 'excl-1',
        kind: 'holiday',
        name: 'Holiday',
        start: '2026-05-06',
        end: '2026-05-06',
      },
    },
  );
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.startDate, '2026-05-06');
  assert.equal(res.command.endDate, '2026-05-08');
  assert.equal(res.command.title, 'Holiday');
});

test('day off create/edit/delete authorize for parent and tutor, not child', async () => {
  const { getCommand } = await import('./registry.js');
  const { authorizeDayOffMutation } = await import('./commandUtils.js');
  await import('./registerAll.js');

  const createCmd = {
    type: 'day_off.create',
    householdId: 'family-1',
    title: 'Holiday',
    startDate: '2026-05-06',
    endDate: '2026-05-06',
  };
  const deleteCmd = {
    type: 'day_off.delete',
    householdId: 'family-1',
    exclusionId: 'excl-1',
    title: 'Holiday',
  };
  const updateCmd = {
    ...createCmd,
    editRow: { id: 'excl-1', kind: 'holiday', name: 'Holiday', start: '2026-05-06', end: '2026-05-06' },
  };

  for (const role of ['parent', 'tutor']) {
    const ctx = { ...baseCtx, userRole: role, householdId: 'family-1' };
    assert.equal(authorizeDayOffMutation(createCmd, ctx, 'add').ok, true, `${role} create`);
    assert.equal(authorizeDayOffMutation(updateCmd, ctx, 'update').ok, true, `${role} update`);
    assert.equal(authorizeDayOffMutation(deleteCmd, ctx, 'remove').ok, true, `${role} delete`);
    assert.equal(getCommand('day_off.create').authorize(createCmd, ctx).ok, true, `${role} create cmd`);
    assert.equal(getCommand('day_off.create').authorize(updateCmd, ctx).ok, true, `${role} update cmd`);
    assert.equal(getCommand('day_off.delete').authorize(deleteCmd, ctx).ok, true, `${role} delete cmd`);
  }

  const childCtx = { ...baseCtx, userRole: 'child', householdId: 'family-1' };
  assert.equal(authorizeDayOffMutation(createCmd, childCtx, 'add').ok, false);
  assert.equal(getCommand('day_off.delete').authorize(deleteCmd, childCtx).ok, false);

  const childCreate = await doodleRespond({
    message: 'Add a day off called Holiday tomorrow',
    context: childCtx,
    roster,
  });
  assert.equal(childCreate.type, DOODLE_RESPONSE_TYPES.ANSWER);
  assert.match(childCreate.message, /parents and tutors/i);

  const tutorCreate = await doodleRespond({
    message: 'Add a day off called Holiday tomorrow',
    context: { ...baseCtx, userRole: 'tutor', householdId: 'family-1' },
    roster,
  });
  assert.equal(tutorCreate.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(tutorCreate.command.type, 'day_off.create');
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

test('subject delete/grading/syllabus intents cover Subject settings modal', async () => {
  const {
    isSubjectDeleteIntent,
    isSubjectUpdateIntent,
    prepareSubjectDelete,
    prepareSubjectUpdate,
    prepareSubjectCreate,
  } = await import('./intentPreparers.js');
  const { getCommand } = await import('./registry.js');
  await import('./registerAll.js');

  assert.equal(isSubjectDeleteIntent('delete subject History'), true);
  assert.equal(isSubjectUpdateIntent('set History grading to total points', roster), true);
  assert.equal(isSubjectUpdateIntent('attach syllabus World Guide to History', roster), true);
  assert.equal(isSubjectUpdateIntent('Create a subject called Biology for Lilly', roster), false);

  const deleteAsk = await prepareSubjectDelete('delete subject History', baseCtx, roster);
  assert.equal(deleteAsk.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(deleteAsk.clarification?.field, 'confirmName');

  const deleteRes = await prepareSubjectDelete(
    'delete subject History confirm History',
    baseCtx,
    roster,
  );
  assert.equal(deleteRes.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(deleteRes.command.type, 'subject.delete');
  assert.equal(deleteRes.command.confirmName, 'History');

  const gradingRes = await prepareSubjectUpdate(
    'set History grading to total points and Spring term',
    baseCtx,
    roster,
  );
  assert.equal(gradingRes.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(gradingRes.command.type, 'subject.update');
  assert.equal(gradingRes.command.patch.gradingMethod, 'total_points');
  assert.equal(gradingRes.command.patch.schoolTerm, 'Spring term');

  const createRich = await prepareSubjectCreate(
    'Create a subject called Biology for Lilly grade 7 with total points grading',
    baseCtx,
    roster,
  );
  assert.equal(createRich.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(createRich.command.grade, '7');
  assert.equal(createRich.command.gradingMethod, 'total_points');

  const delAuth = getCommand('subject.delete').authorize(
    {
      type: 'subject.delete',
      householdId: 'family-1',
      subjectId: 's1',
      subjectName: 'History',
      confirmName: 'History',
    },
    { ...baseCtx, householdId: 'family-1', userRole: 'parent' },
    {},
  );
  assert.equal(delAuth.ok, true);
});

test('export planner opens export modal routing instead of Open Planner nav', async () => {
  assert.equal(isPlannerExportIntent('export planner'), true);
  assert.equal(isPlannerExportIntent('export'), true);
  assert.equal(isPlannerExportIntent('how do I export the planner'), false);
  assert.equal(isPlannerExportIntent('export attendance'), false);

  let opened = null;
  const prevWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent: (event) => {
      opened = { type: event.type, detail: event.detail };
      return true;
    },
  };
  try {
    const res = await doodleRespond({
      message: 'export planner',
      context: baseCtx,
      roster,
    });
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.NAVIGATION);
    assert.equal(res.destination?.href, '#export-planner');
    assert.match(res.message, /Export planner/i);
    assert.equal(opened?.type, 'openExportPlannerModal');
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
  }
});

test('export attendance opens attendance export instead of mark-attendance how-to', async () => {
  assert.equal(isAttendanceExportIntent('export attendance'), true);
  assert.equal(isAttendanceExportIntent('how do I export attendance'), false);

  let opened = null;
  const prevWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent: (event) => {
      opened = { type: event.type, detail: event.detail };
      return true;
    },
  };
  try {
    const res = await doodleRespond({
      message: 'export attendance',
      context: baseCtx,
      roster,
    });
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.NAVIGATION);
    assert.equal(res.destination?.href, '#export-attendance');
    assert.match(res.message, /Export attendance/i);
    assert.equal(res.message.includes('Here’s how to mark attendance'), false);
    assert.equal(opened?.type, 'openAttendanceExportModal');
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
  }
});

test('change it for next year uses recent subject chat context', async () => {
  const {
    bumpSchoolYearLabel,
    isSubjectUpdateIntent,
    parseSubjectSchoolYear,
  } = await import('./intentPreparers.js');

  assert.equal(bumpSchoolYearLabel('2025/26', 1), '2026/27');
  assert.equal(parseSubjectSchoolYear('change it for next year', '2025/26'), '2026/27');
  assert.equal(
    isSubjectUpdateIntent('change it for next year', roster, {
      recentSubjectId: 's-cine',
      recentSubjectName: 'cinematography',
    }),
    true,
  );
  assert.equal(isSubjectUpdateIntent('change it for next year', roster), false);

  const rosterWithRecent = {
    ...roster,
    subjects: [
      ...roster.subjects,
      { id: 's-cine', name: 'cinematography', school_year: '2025/26' },
    ],
  };
  const res = await doodleRespond({
    message: 'change it for next year',
    context: baseCtx,
    roster: rosterWithRecent,
    recentMessages: [
      {
        role: 'assistant',
        content: 'Added subject “cinematography”.',
        structured: {
          type: DOODLE_RESPONSE_TYPES.RESULT,
          affectedRecords: [{
            label: 'cinematography',
            entityType: 'subject',
            entityId: 's-cine',
          }],
        },
      },
    ],
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'subject.update');
  assert.equal(res.command.subjectId, 's-cine');
  assert.equal(res.command.patch.schoolYear, '2026/27');
});

test('child create returns preview', async () => {
  const needsAge = await doodleRespond({
    message: 'Add a child named Sam',
    context: baseCtx,
    roster,
  });
  assert.equal(needsAge.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(needsAge.clarification?.field, 'ageOrGrade');

  const res = await doodleRespond({
    message: 'Add a child named Sam age 10 grade 5',
    context: baseCtx,
    roster,
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'child.create');
  assert.equal(res.command.name, 'Sam');
  assert.equal(res.command.age, 10);
  assert.equal(res.command.gradeLabel, '5');
});

test('child update/delete/invite intents cover Edit Family actions', async () => {
  const {
    isChildUpdateIntent,
    isChildDeleteIntent,
    isChildInviteIntent,
    prepareChildUpdate,
    prepareChildDelete,
    prepareChildInvite,
  } = await import('./intentPreparers.js');
  const { getCommand } = await import('./registry.js');
  await import('./registerAll.js');

  assert.equal(isChildUpdateIntent('change Lilly’s grade to 6'), true);
  assert.equal(isChildDeleteIntent('delete child Lilly'), true);
  assert.equal(isChildInviteIntent('invite child Lilly at kate@example.com'), true);

  const updateRes = await prepareChildUpdate(
    'change Lilly’s age to 15 and grade to 6 notes loves science',
    baseCtx,
    roster,
  );
  assert.equal(updateRes.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(updateRes.command.type, 'child.update');
  assert.equal(updateRes.command.patch.age, 15);
  assert.equal(updateRes.command.patch.grade, '6');
  assert.equal(updateRes.command.patch.notes, 'loves science');
  assert.equal(updateRes.confirmationLabel, 'Save changes');

  const deleteAsk = await prepareChildDelete('delete child Lilly', baseCtx, roster);
  assert.equal(deleteAsk.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(deleteAsk.clarification?.field, 'confirmName');

  const deleteRes = await prepareChildDelete('delete child Lilly confirm Lilly', baseCtx, roster);
  assert.equal(deleteRes.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(deleteRes.command.type, 'child.delete');
  assert.equal(deleteRes.command.confirmName, 'Lilly');

  const inviteRes = await prepareChildInvite(
    'invite child Lilly at kate@example.com',
    baseCtx,
    roster,
  );
  assert.equal(inviteRes.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(inviteRes.command.type, 'child.invite');
  assert.equal(inviteRes.command.email, 'kate@example.com');

  const tutorDenied = await doodleRespond({
    message: 'Add a child named Sam age 10',
    context: { ...baseCtx, userRole: 'tutor', householdId: 'family-1' },
    roster,
  });
  assert.equal(tutorDenied.type, DOODLE_RESPONSE_TYPES.ANSWER);
  assert.match(tutorDenied.message, /Only parents/i);

  const createAuth = getCommand('child.create').authorize(
    { type: 'child.create', householdId: 'family-1', name: 'Sam', age: 10 },
    { ...baseCtx, householdId: 'family-1', userRole: 'parent' },
  );
  assert.equal(createAuth.ok, true);
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
  assert.equal(res.command.subjectId, null);
  assert.equal(res.command.linkAsSubjectAttachment, false);
});

test('add to history lesson plan with file uses named subject (no learning-day ask)', async () => {
  const res = await doodleRespond({
    message: 'add to history lesson plan',
    context: baseCtx,
    roster,
    attachments: [{
      attachmentId: 'att-hist',
      fileName: 'religious-economy.pdf',
      mime: 'application/pdf',
      mimeLabel: 'PDF',
      bytes: 1100000,
    }],
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'material.create_file');
  assert.equal(res.command.subjectId, 's1');
  assert.equal(res.command.subjectName, 'History');
  assert.equal(res.command.documentRole, 'lesson_plan');
  assert.equal(res.command.linkAsSubjectAttachment, true);
  assert.equal(res.type === DOODLE_RESPONSE_TYPES.CLARIFICATION, false);
});

test('attach file to subject lesson plan links Materials and subject attachment', async () => {
  const rosterWithCine = {
    ...roster,
    subjects: [
      ...roster.subjects,
      { id: 's-cine', name: 'cinematography', school_year: '2025/26' },
    ],
  };
  const res = await doodleRespond({
    message: 'attach to cinematography lesson plan',
    context: baseCtx,
    roster: rosterWithCine,
    attachments: [{
      attachmentId: 'att-cine',
      fileName: 'religious-economy.pdf',
      mime: 'application/pdf',
      mimeLabel: 'PDF',
      bytes: 1100000,
    }],
  });
  assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(res.command.type, 'material.create_file');
  assert.equal(res.command.subjectId, 's-cine');
  assert.equal(res.command.subjectName, 'cinematography');
  assert.equal(res.command.documentRole, 'lesson_plan');
  assert.equal(res.command.linkAsSubjectAttachment, true);
  assert.match(res.message, /lesson plan/i);
  assert.match(res.message, /cinematography/i);
  const subjectField = (res.preview || []).find((f) => f.label === 'Subject');
  assert.ok(subjectField);
  assert.equal(subjectField.value, 'cinematography');
  const attachField = (res.preview || []).find((f) => f.label === 'Attachment');
  assert.ok(attachField);
  assert.equal(attachField.value, 'Lesson plan');
});

test('delete all attachments archives materials library items', async () => {
  const {
    isMaterialArchiveAllIntent,
    prepareMaterialArchiveAll,
  } = await import('./intentPreparers.js');
  await import('./registerAll.js');

  assert.equal(isMaterialArchiveAllIntent('delete all attachemnts'), true);
  assert.equal(isMaterialArchiveAllIntent('delete all attachments'), true);
  assert.equal(isMaterialArchiveAllIntent('clear all materials'), true);
  assert.equal(isMaterialArchiveAllIntent('how do I delete all materials'), false);

  const empty = await prepareMaterialArchiveAll('delete all attachments', baseCtx, {
    materials: [],
  });
  assert.equal(empty.type, DOODLE_RESPONSE_TYPES.ANSWER);
  assert.match(empty.message, /no materials/i);

  const one = await prepareMaterialArchiveAll('delete all attachemnts', baseCtx, {
    materials: [{ id: 'm1', title: 'religious-economy.pdf' }],
  });
  assert.equal(one.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(one.command.type, 'material.archive_all');
  assert.deepEqual(one.command.materialIds, ['m1']);
  assert.equal(one.command.count, 1);
  assert.match(one.message, /Delete material/i);
  const items = (one.preview || []).find((f) => f.label === 'Items');
  assert.ok(items);
  assert.match(items.value, /religious-economy/i);
});

test('account settings requests navigate to Profile / Preferences / Notifications', async () => {
  assert.equal(
    resolveAccountSettingsDestination('change notifications to all be off')?.href,
    '/settings?section=notifications',
  );
  assert.equal(
    resolveAccountSettingsDestination('open app preferences')?.href,
    '/settings?section=preferences',
  );
  assert.equal(
    resolveAccountSettingsDestination('how do I reset my password')?.href,
    '/settings?section=profile',
  );
  assert.equal(resolveAccountSettingsDestination('open school year settings'), null);
  assert.equal(resolveAccountSettingsDestination('edit family members'), null);

  const notif = await doodleRespond({
    message: 'change notifications to all be off',
    context: baseCtx,
    roster,
  });
  assert.equal(notif.type, DOODLE_RESPONSE_TYPES.NAVIGATION);
  assert.equal(notif.destination?.href, '/settings?section=notifications');
  assert.match(notif.destination?.label || '', /Notifications/i);

  const prefs = await doodleRespond({
    message: 'turn off learning areas in preferences',
    context: baseCtx,
    roster,
  });
  assert.equal(prefs.type, DOODLE_RESPONSE_TYPES.NAVIGATION);
  assert.equal(prefs.destination?.href, '/settings?section=preferences');

  const profile = await doodleRespond({
    message: 'open my profile settings',
    context: baseCtx,
    roster,
  });
  assert.equal(profile.type, DOODLE_RESPONSE_TYPES.NAVIGATION);
  assert.equal(profile.destination?.href, '/settings?section=profile');
});

test('bulletin announcement create covers home, subject, and audience', async () => {
  const {
    isBulletinPostCreateIntent,
    isBulletinPostUpdateIntent,
    isBulletinPostDeleteIntent,
    prepareBulletinPostCreate,
    prepareBulletinPostUpdate,
    prepareBulletinPostDelete,
  } = await import('./bulletinIntentPreparers.js');
  const { getCommand } = await import('./registry.js');
  await import('./registerAll.js');

  assert.equal(isBulletinPostCreateIntent('Post an announcement: Field trip Friday'), true);
  assert.equal(isBulletinPostUpdateIntent('Edit my announcement about field trip'), true);
  assert.equal(isBulletinPostDeleteIntent('Delete my last announcement'), true);
  assert.equal(isBulletinPostCreateIntent('Create an assignment called Read Chapter 4'), false);
  assert.equal(
    isBulletinPostCreateIntent('create a new post on bulletin announcing spaghetti for dinner'),
    true,
  );

  const announcing = await doodleRespond({
    message: 'create a new post on bulletin announcing spaghetti for dinner',
    context: baseCtx,
    roster,
  });
  assert.equal(announcing.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(announcing.clarification?.field, 'visibility');
  assert.equal(announcing.clarification?.draft?.body, 'spaghetti for dinner');
  assert.ok(announcing.options?.some((o) => o.label === 'All members'));
  assert.ok(announcing.options?.some((o) => o.label === 'Only me'));
  assert.ok(announcing.options?.some((o) => o.label === 'Selected'));

  const announcingAll = await doodleRespond({
    message: 'All members',
    context: baseCtx,
    roster,
    pendingClarification: announcing.clarification,
    clarificationOption: {
      id: 'vis-all',
      label: 'All members',
      value: 'all',
      field: 'visibility',
    },
  });
  assert.equal(announcingAll.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(announcingAll.command.type, 'bulletin.post.create');
  assert.equal(announcingAll.command.body, 'spaghetti for dinner');
  assert.equal(announcingAll.command.visibility, 'all');

  const homeAsk = await doodleRespond({
    message: 'Post an announcement: Field trip Friday',
    context: baseCtx,
    roster,
  });
  assert.equal(homeAsk.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(homeAsk.clarification?.field, 'visibility');
  assert.match(homeAsk.clarification?.draft?.body || '', /Field trip Friday/i);

  const home = await doodleRespond({
    message: 'All members',
    context: baseCtx,
    roster,
    pendingClarification: homeAsk.clarification,
    clarificationOption: {
      id: 'vis-all',
      label: 'All members',
      value: 'all',
      field: 'visibility',
    },
  });
  assert.equal(home.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(home.command.type, 'bulletin.post.create');
  assert.equal(home.command.subjectId, null);
  assert.equal(home.command.visibility, 'all');
  assert.match(home.command.body, /Field trip Friday/i);

  const onlyMe = await prepareBulletinPostCreate(
    'Post an announcement only me: Quiet reminder',
    baseCtx,
    roster,
  );
  assert.equal(onlyMe.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(onlyMe.command.visibility, 'self');

  const selected = await prepareBulletinPostCreate(
    'Post an announcement for Lilly on History bulletin: Lab safety rules',
    baseCtx,
    {
      ...roster,
      subjects: [{ id: 's1', name: 'History', child_id: 'c1' }],
    },
  );
  assert.equal(selected.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(selected.command.subjectId, 's1');
  assert.equal(selected.command.visibility, 'selected');
  assert.deepEqual(selected.command.audienceChildIds, ['c1']);
  assert.match(selected.command.body, /Lab safety/i);

  const classAll = await prepareBulletinPostCreate(
    'Post announcement on History bulletin for all in class: Welcome',
    baseCtx,
    {
      ...roster,
      subjects: [{ id: 's1', name: 'History', child_id: 'c1' }],
    },
  );
  assert.equal(classAll.command.visibility, 'selected');
  assert.deepEqual(classAll.command.audienceChildIds, ['c1']);
  assert.equal(classAll.command.audienceLabel, 'All in class');

  const needsBody = await prepareBulletinPostCreate('Post an announcement', baseCtx, roster);
  assert.equal(needsBody.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(needsBody.clarification?.field, 'body');

  const continuedBody = await doodleRespond({
    message: 'Hello family',
    context: baseCtx,
    roster,
    pendingClarification: needsBody.clarification,
  });
  assert.equal(continuedBody.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(continuedBody.clarification?.field, 'visibility');
  assert.equal(continuedBody.clarification?.draft?.body, 'Hello family');

  const continued = await doodleRespond({
    message: 'All members',
    context: baseCtx,
    roster,
    pendingClarification: continuedBody.clarification,
    clarificationOption: {
      id: 'vis-all',
      label: 'All members',
      value: 'all',
      field: 'visibility',
    },
  });
  assert.equal(continued.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(continued.command.body, 'Hello family');

  const pickSelected = await doodleRespond({
    message: 'create a new post on bulletin announcing pizza night',
    context: baseCtx,
    roster,
  });
  assert.equal(pickSelected.clarification?.field, 'visibility');
  const afterSelected = await doodleRespond({
    message: 'Selected',
    context: baseCtx,
    roster,
    pendingClarification: pickSelected.clarification,
    clarificationOption: {
      id: 'vis-selected',
      label: 'Selected',
      value: 'selected',
      field: 'visibility',
    },
  });
  assert.equal(afterSelected.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(afterSelected.clarification?.field, 'childId');
  assert.ok(afterSelected.options?.some((o) => /lilly/i.test(o.label)));

  assert.equal(isBulletinPostCreateIntent('create new post with this'), true);
  const withFile = await doodleRespond({
    message: 'create new post with this',
    context: baseCtx,
    roster,
    attachments: [{
      attachmentId: 'att-post',
      fileName: 'Central Bank Digital Currency.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mimeLabel: 'DOCX',
      bytes: 307000,
    }],
  });
  assert.equal(withFile.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(withFile.clarification?.field, 'visibility');
  assert.equal(withFile.clarification?.draft?.body, 'Central Bank Digital Currency');
  assert.equal(withFile.clarification?.draft?.attachmentId, 'att-post');

  const withFilePosted = await doodleRespond({
    message: 'All members',
    context: baseCtx,
    roster,
    pendingClarification: withFile.clarification,
    clarificationOption: {
      id: 'vis-all',
      label: 'All members',
      value: 'all',
      field: 'visibility',
    },
  });
  assert.equal(withFilePosted.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(withFilePosted.command.type, 'bulletin.post.create');
  assert.equal(withFilePosted.command.attachmentId, 'att-post');
  assert.equal(withFilePosted.command.body, 'Central Bank Digital Currency');
  assert.ok(withFilePosted.preview.some((row) => row.label === 'Attachment'));

  const updateRes = await prepareBulletinPostUpdate(
    'Edit my announcement to say Updated text',
    baseCtx,
    roster,
    {
      postId: 'post-1',
      existingPost: {
        id: 'post-1',
        body: 'Old text',
        subject_id: null,
        visibility: 'all',
        audience_user_ids: [],
        audience_child_ids: [],
      },
    },
  );
  assert.equal(updateRes.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(updateRes.command.type, 'bulletin.post.update');
  assert.equal(updateRes.command.postId, 'post-1');
  assert.match(updateRes.command.body, /Updated text/i);

  const deleteRes = await prepareBulletinPostDelete(
    'Delete my announcement',
    baseCtx,
    roster,
    {
      postId: 'post-1',
      existingPost: { id: 'post-1', body: 'Old text' },
    },
  );
  assert.equal(deleteRes.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  assert.equal(deleteRes.command.type, 'bulletin.post.delete');

  const createAuth = getCommand('bulletin.post.create').authorize(
    { type: 'bulletin.post.create', householdId: 'family-1', body: 'Hi', visibility: 'all' },
    { ...baseCtx, householdId: 'family-1' },
  );
  assert.equal(createAuth.ok, true);
  assert.equal(
    getCommand('bulletin.post.create').schema({
      type: 'bulletin.post.create',
      householdId: 'family-1',
      body: 'Hi',
      visibility: 'selected',
      audienceChildIds: [],
      audienceUserIds: [],
    }).ok,
    false,
  );
});
