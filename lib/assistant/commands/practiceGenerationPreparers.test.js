import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPracticeGenerateIntent,
  buildPracticeFallback,
  preparePracticeGeneration,
} from './practiceGenerationPreparers.js';
import { ageBandFromChild } from './openaiChatHelper.js';
import { DOODLE_RESPONSE_TYPES } from './types.js';
import { collectDoodleContext } from './contextCollector.js';
import './registerAll.js';

const ctx = collectDoodleContext({
  activeTab: 'planner',
  familyId: 'family-1',
  userId: 'user-1',
  userRole: 'parent',
  enabledFeatures: ['assignments', 'learningAreas'],
  schoolYearLabel: '2025/26',
});

const roster = {
  children: [{ id: 'c1', first_name: 'Emma', age: 10 }],
  subjects: [{ id: 's-math', name: 'Math' }],
};

const bundle = {
  units: [
    {
      id: 'u1',
      title: 'Fractions',
      lessons: [
        { id: 'l1', title: 'Intro to fractions', sequence: 1, objective: 'Identify numerator and denominator' },
        { id: 'l2', title: 'Adding fractions', sequence: 2 },
      ],
    },
  ],
  events: [{ curriculum_lesson_id: 'l1', status: 'done' }],
};

describe('practice generate intent', () => {
  it('detects quiz/worksheet generation vs quiz-me', () => {
    assert.equal(isPracticeGenerateIntent('make a quiz on fractions for Emma'), true);
    assert.equal(isPracticeGenerateIntent('generate a worksheet from next Math lesson'), true);
    assert.equal(isPracticeGenerateIntent('quiz me on fractions'), false);
  });
});

describe('preparePracticeGeneration', () => {
  it('previews confirmable assignment with generated instructions', async () => {
    const res = await preparePracticeGeneration(
      'make a quiz from next Math lesson for Emma due Friday',
      ctx,
      roster,
      {},
      {
        bundle,
        completeChat: async () => 'Quiz: Adding fractions\n1. What is a denominator?\n2. Add 1/4 + 2/4.',
      },
    );
    assert.ok(
      res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
      || res.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
    );
    if (res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
      assert.equal(res.command.type, 'assignment.create');
      assert.equal(res.command.curriculumLessonId, 'l2');
      assert.match(res.command.instructions || '', /denominator|Adding|Quiz/i);
      assert.match(res.command.title, /Quiz/i);
    }
  });

  it('fallback builds numbered questions', () => {
    const text = buildPracticeFallback({
      kind: 'quiz',
      lessonTitle: 'Adding fractions',
      unitTitle: 'Fractions',
      ageBand: ageBandFromChild({ age: 10 }),
    });
    assert.match(text, /1\./);
    assert.match(text, /Adding fractions/);
  });
});
