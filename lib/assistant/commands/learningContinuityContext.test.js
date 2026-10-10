import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankContinuityRecommendations,
  formatRecommendationDigest,
  explainRecommendation,
} from './learningContinuityContext.js';

const roster = {
  subjects: [
    { id: 's-math', name: 'Math' },
    { id: 's-hist', name: 'History' },
  ],
  children: [{ id: 'c1', first_name: 'Emma' }],
};

describe('rankContinuityRecommendations', () => {
  it('prioritizes overdue and needs-help assignments', () => {
    const today = new Date();
    const overdue = new Date(today);
    overdue.setDate(overdue.getDate() - 3);
    const ymd = `${overdue.getFullYear()}-${String(overdue.getMonth() + 1).padStart(2, '0')}-${String(overdue.getDate()).padStart(2, '0')}`;

    const recs = rankContinuityRecommendations({
      assignments: [
        {
          id: 'a1',
          title: 'Fractions worksheet',
          due_date: ymd,
          related_subject: 's-math',
          need_help: true,
          status: 'open',
        },
        {
          id: 'a2',
          title: 'History essay',
          due_date: null,
          related_subject: 's-hist',
          status: 'open',
        },
      ],
      outcomes: [],
      upcoming: [],
      interests: [],
      planHealth: null,
    }, roster);

    assert.ok(recs.length >= 2);
    assert.equal(recs[0].assignmentId, 'a1');
    assert.match(recs[0].why, /overdue|needs help/i);
  });

  it('surfaces review from struggle outcomes', () => {
    const recs = rankContinuityRecommendations({
      assignments: [],
      outcomes: [
        {
          struggles: 'still confused on fractions',
          rating: 2,
          event: { id: 'e1', subject_id: 's-math', title: 'Math lesson' },
        },
      ],
      upcoming: [],
      interests: [],
      planHealth: null,
    }, roster);

    const review = recs.find((r) => r.kind === 'review');
    assert.ok(review);
    assert.match(review.why, /fractions|struggle/i);
    assert.equal(review.subjectId, 's-math');
  });

  it('includes pace catch-up when behind', () => {
    const recs = rankContinuityRecommendations({
      assignments: [],
      outcomes: [],
      upcoming: [],
      interests: [],
      planHealth: {
        plan_exists: true,
        constraint_mode: 'days',
        delta_days: -4,
        target_days: 180,
      },
    }, roster);
    assert.ok(recs.some((r) => r.action === 'catch-up'));
  });
});

describe('formatRecommendationDigest + explain', () => {
  it('formats digest with why lines', () => {
    const { message, top } = formatRecommendationDigest([
      {
        title: 'Fractions worksheet',
        subjectName: 'Math',
        why: 'overdue; marked needs help',
        kind: 'assignment',
      },
    ], 'Emma');
    assert.match(message, /Emma/);
    assert.match(message, /Fractions worksheet/);
    assert.match(message, /overdue/);
    assert.equal(top.title, 'Fractions worksheet');
  });

  it('explains a recommendation by subject mention', () => {
    const line = explainRecommendation([
      { title: 'Review Math', subjectName: 'Math', why: 'recent struggle noted: “fractions”' },
    ], 'why math?');
    assert.match(line, /fractions|struggle/i);
  });
});
