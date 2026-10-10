import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSocraticTutorIntent,
  buildSocraticFallback,
  prepareSocraticTutorAnswer,
} from './socraticTutorPreparers.js';
import { ageBandFromChild } from './openaiChatHelper.js';
import { DOODLE_RESPONSE_TYPES } from './types.js';
import { collectDoodleContext } from './contextCollector.js';

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

describe('socratic intent + age band', () => {
  it('detects tutor phrasing and excludes quiz generation', () => {
    assert.equal(isSocraticTutorIntent('quiz me on fractions'), true);
    assert.equal(isSocraticTutorIntent('help Emma understand fractions'), true);
    assert.equal(isSocraticTutorIntent('walk me through this math problem'), true);
    assert.equal(isSocraticTutorIntent('make a quiz on fractions for Emma'), false);
  });

  it('maps child age to band', () => {
    assert.equal(ageBandFromChild({ age: 6 }).band, 'early');
    assert.equal(ageBandFromChild({ age: 10 }).band, 'elementary');
    assert.equal(ageBandFromChild({ grade_label: '8' }).band, 'middle');
  });
});

describe('prepareSocraticTutorAnswer', () => {
  it('returns guiding questions with parent review footer', async () => {
    const res = await prepareSocraticTutorAnswer(
      'quiz me on fractions for Emma',
      ctx,
      roster,
      {},
      {
        completeChat: async () => 'What do you know about a fraction already?\nWhat is the whole in this problem?',
      },
    );
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ANSWER);
    assert.match(res.message, /fraction/i);
    assert.match(res.message, /Parent review/i);
    assert.ok(res.links?.some((l) => l.href === '#doodle-parent-review'));
  });

  it('uses fallback when LLM returns null', async () => {
    const fallback = buildSocraticFallback({
      childName: 'Emma',
      topic: 'fractions',
      ageBand: ageBandFromChild({ age: 10 }),
    });
    assert.match(fallback, /guiding|questions|together/i);
    const res = await prepareSocraticTutorAnswer(
      'tutor Emma on fractions',
      ctx,
      roster,
      {},
      { completeChat: async () => null },
    );
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ANSWER);
    assert.match(res.message, /together|own words|Parent review/i);
  });
});
