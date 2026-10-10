import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isScheduleNextCurriculumLessonIntent,
  isAssignFromCurriculumIntent,
  prepareScheduleNextCurriculumLesson,
  prepareAssignFromCurriculum,
} from './curriculumLessonPreparers.js';
import { DOODLE_RESPONSE_TYPES } from './types.js';
import { collectDoodleContext } from './contextCollector.js';
import './registerAll.js';

const ctx = collectDoodleContext({
  activeTab: 'planner',
  familyId: 'family-1',
  userId: 'user-1',
  userRole: 'parent',
  enabledFeatures: ['assignments', 'learningAreas', 'attendance', 'materials'],
  schoolYearLabel: '2025/26',
});

const roster = {
  children: [{ id: 'c1', first_name: 'Emma' }],
  subjects: [{ id: 's-math', name: 'Math' }, { id: 's-hist', name: 'History' }],
};

const bundle = {
  units: [
    {
      id: 'u1',
      title: 'Fractions',
      lessons: [
        { id: 'l1', title: 'Intro to fractions', sequence: 1, minutes: 45 },
        { id: 'l2', title: 'Adding fractions', sequence: 2 },
      ],
    },
  ],
  events: [{ curriculum_lesson_id: 'l1', status: 'done' }],
};

describe('curriculum lesson intents', () => {
  it('detects schedule next lesson', () => {
    assert.equal(isScheduleNextCurriculumLessonIntent('create next Math lesson for Emma'), true);
    assert.equal(isScheduleNextCurriculumLessonIntent('schedule the next History lesson'), true);
    assert.equal(isScheduleNextCurriculumLessonIntent('create a new Math lesson'), false);
    assert.equal(isScheduleNextCurriculumLessonIntent('how do I create the next lesson?'), false);
  });

  it('detects assign from curriculum', () => {
    assert.equal(isAssignFromCurriculumIntent('assign Emma fractions practice from curriculum'), true);
    assert.equal(isAssignFromCurriculumIntent('create assignment from next History lesson'), true);
    assert.equal(isAssignFromCurriculumIntent('create an assignment called fractions'), false);
  });
});

describe('prepareScheduleNextCurriculumLesson', () => {
  it('previews linking the next unscheduled lesson', async () => {
    const res = await prepareScheduleNextCurriculumLesson(
      'create next Math lesson for Emma tomorrow',
      ctx,
      roster,
      {},
      { bundle },
    );
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
    assert.equal(res.command.type, 'learning_day.create');
    assert.equal(res.command.curriculumLessonId, 'l2');
    assert.equal(res.command.createLesson, false);
    assert.equal(res.command.linkExistingLesson, true);
    assert.match(res.message, /Adding fractions|next/i);
  });

  it('answers when curriculum is empty', async () => {
    const res = await prepareScheduleNextCurriculumLesson(
      'create next Math lesson for Emma tomorrow',
      ctx,
      roster,
      {},
      { bundle: { units: [], events: [] } },
    );
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ANSWER);
    assert.match(res.message, /no curriculum/i);
  });
});

describe('prepareAssignFromCurriculum', () => {
  it('previews assignment linked to matching lesson', async () => {
    const res = await prepareAssignFromCurriculum(
      'assign Emma fractions practice from curriculum due Friday',
      ctx,
      roster,
      {},
      { bundle },
    );
    assert.ok(
      res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
      || res.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
    );
    if (res.type === DOODLE_RESPONSE_TYPES.CLARIFICATION) {
      assert.equal(res.clarification?.intent, 'curriculum.assign');
      assert.ok(res.options?.length);
    } else {
      assert.equal(res.command.type, 'assignment.create');
      assert.ok(res.command.curriculumLessonId);
      assert.match(res.command.title, /fraction/i);
    }
  });

  it('assigns next lesson when asked', async () => {
    const res = await prepareAssignFromCurriculum(
      'create assignment from next Math lesson due tomorrow',
      ctx,
      roster,
      {},
      { bundle },
    );
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
    assert.equal(res.command.curriculumLessonId, 'l2');
    assert.equal(res.command.unitId, 'u1');
  });
});
