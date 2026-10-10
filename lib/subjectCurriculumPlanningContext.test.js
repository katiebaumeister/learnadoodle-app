import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubjectCurriculumPlanningContext } from './subjectCurriculumPlanningContext.js';

describe('buildSubjectCurriculumPlanningContext', () => {
  it('returns null targets without family/subject', async () => {
    const ctx = await buildSubjectCurriculumPlanningContext({});
    assert.equal(ctx.lesson_count_target, null);
    assert.equal(ctx.planning_context, null);
  });

  it('computes slot count from plan block weekdays and dates', async () => {
    const subject = {
      id: 's1',
      name: 'Dinosaurs',
      school_year: '2025/26',
      school_term: 'full_year',
    };
    const planData = {
      plan: {
        blocks: [{
          subject_id: 's1',
          weekdays: [1, 3], // Mon + Wed
          start_time: '09:00',
          end_time: '10:00',
          schedule_start_date: '2025-09-01',
          schedule_end_date: '2025-09-30',
        }],
      },
    };
    const ctx = await buildSubjectCurriculumPlanningContext({
      familyId: 'f1',
      subject,
      academicYearId: 'ay1',
      planData,
    });
    assert.ok(ctx.lesson_count_target > 0);
    assert.equal(ctx.typical_lesson_minutes, 60);
    assert.match(ctx.planning_context, /Dinosaurs/);
    assert.match(ctx.planning_context, /Mon, Wed/);
    assert.match(ctx.special_instructions, /multi-unit/i);
  });
});
