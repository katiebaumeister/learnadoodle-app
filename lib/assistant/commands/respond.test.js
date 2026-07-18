/**
 * Unit smoke tests for Doodle command respond/execute contracts.
 * Run: node --test lib/assistant/commands/respond.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanGuideText, doodleRespond } from './respond.js';
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

test('learning day clarifies subject then continues', async () => {
  const first = await doodleRespond({
    message: 'Create a learning day',
    context: baseCtx,
    roster,
  });
  assert.equal(first.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
  assert.equal(first.clarification?.intent, 'learning_day.create');

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
