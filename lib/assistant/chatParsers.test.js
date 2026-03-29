/**
 * Parser / formatter regression tests. Run via npm run test:assistant
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLogGradeIntent, formatGradesListLines } from './gradesChatActions.js';
import { parseRenameSubjectTitles } from './familyRosterChatActions.js';

const emma = { id: 'c1', first_name: 'Emma', name: 'Emma', archived: false };
const sam = { id: 'c2', first_name: 'Sam', archived: false };
const algebra = { id: 's1', name: 'Algebra', child_id: 'c1', student_id: null };

test('parseLogGradeIntent: letter grade + child + subject', () => {
  const r = parseLogGradeIntent('log grade B+ for Emma in Algebra', [emma], [algebra]);
  assert.ok(r && !r.error);
  assert.equal(r.gradeLetter, 'B+');
  assert.equal(r.child.id, 'c1');
  assert.equal(r.subjectId, 's1');
});

test('parseLogGradeIntent: score with fraction', () => {
  const r = parseLogGradeIntent('record score 18/20 for Sam', [sam], []);
  assert.ok(r && !r.error);
  assert.equal(r.score, 18);
  assert.equal(r.possible, 20);
  assert.equal(r.child.id, 'c2');
});

test('parseLogGradeIntent: null when not a grade message', () => {
  assert.equal(parseLogGradeIntent('show grades for Emma', [emma], []), null);
});

test('parseRenameSubjectTitles: unquoted with for child', () => {
  const r = parseRenameSubjectTitles('rename subject Bio to Biology for Emma');
  assert.deepEqual(r, { oldHint: 'Bio', newName: 'Biology', forChild: 'Emma' });
});

test('parseRenameSubjectTitles: null without subject word', () => {
  assert.equal(parseRenameSubjectTitles('rename Algebra to Geometry'), null);
});

test('formatGradesListLines: empty', () => {
  const lines = formatGradesListLines([], new Map(), new Map());
  assert.equal(lines.length, 1);
  assert.match(lines[0], /No grades/);
});

test('formatGradesListLines: one row', () => {
  const chMap = new Map([['c1', emma]]);
  const subMap = new Map([['s1', algebra]]);
  const lines = formatGradesListLines(
    [
      {
        child_id: 'c1',
        subject_id: 's1',
        grade: 'A',
        score: null,
        possible: null,
        created_at: '2026-01-15T12:00:00.000Z',
      },
    ],
    chMap,
    subMap
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Emma/);
  assert.match(lines[0], /Algebra/);
  assert.match(lines[0], /A/);
});
