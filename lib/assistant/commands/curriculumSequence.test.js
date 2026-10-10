import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findNextUnscheduledLesson,
  findLessonsByQuery,
} from './curriculumSequence.js';

const units = [
  {
    id: 'u1',
    title: 'Fractions',
    lessons: [
      { id: 'l1', title: 'Intro to fractions', sequence: 1 },
      { id: 'l2', title: 'Adding fractions', sequence: 2, objective: 'Add with like denominators' },
    ],
  },
  {
    id: 'u2',
    title: 'Decimals',
    lessons: [
      { id: 'l3', title: 'Place value', sequence: 1 },
    ],
  },
];

describe('findNextUnscheduledLesson', () => {
  it('returns first unlinked lesson in sequence', () => {
    const next = findNextUnscheduledLesson(units, [
      { curriculum_lesson_id: 'l1', status: 'done' },
    ]);
    assert.equal(next.lessonId, 'l2');
    assert.equal(next.unitTitle, 'Fractions');
    assert.match(next.objective || '', /denominators/);
  });

  it('skips canceled links', () => {
    const next = findNextUnscheduledLesson(units, [
      { curriculum_lesson_id: 'l1', status: 'canceled' },
    ]);
    assert.equal(next.lessonId, 'l1');
  });

  it('returns null when all linked', () => {
    const next = findNextUnscheduledLesson(units, [
      { curriculum_lesson_id: 'l1' },
      { curriculum_lesson_id: 'l2' },
      { curriculum_lesson_id: 'l3' },
    ]);
    assert.equal(next, null);
  });
});

describe('findLessonsByQuery', () => {
  it('matches lesson titles', () => {
    const hits = findLessonsByQuery(units, 'fractions');
    assert.ok(hits.length >= 2);
    assert.ok(hits.some((h) => h.lessonId === 'l1'));
  });

  it('matches unit title', () => {
    const hits = findLessonsByQuery(units, 'decimals');
    assert.ok(hits.some((h) => h.lessonId === 'l3'));
  });
});
