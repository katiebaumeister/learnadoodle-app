import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCasualText,
  titleCaseWords,
  inferAssignmentTitleFromMessage,
  resolveInterpretedSlots,
  interpretDoodleTurn,
  interpretClarificationValue,
  dispatchInterpretedTurn,
} from './conversationalInterpret.js';
import { DOODLE_RESPONSE_TYPES } from './types.js';
import { collectDoodleContext } from './contextCollector.js';
import './registerAll.js';

const roster = {
  children: [{ id: 'c1', first_name: 'Lilly' }, { id: 'c2', first_name: 'Max' }],
  subjects: [{ id: 's1', name: 'History' }, { id: 's2', name: 'Math' }],
};

const ctx = collectDoodleContext({
  activeTab: 'planner',
  familyId: 'family-1',
  userId: 'user-1',
  userRole: 'parent',
  enabledFeatures: ['assignments', 'learningAreas'],
  schoolYearLabel: '2025/26',
});

describe('normalizeCasualText', () => {
  it('expands common shorthand', () => {
    assert.match(normalizeCasualText('mak a quizz nxt fri'), /make a quiz next friday/i);
  });
});

describe('titleCaseWords / inferAssignmentTitleFromMessage', () => {
  it('title-cases short labels', () => {
    assert.equal(titleCaseWords('quiz'), 'Quiz');
    assert.equal(titleCaseWords('fractions quiz'), 'Fractions Quiz');
  });

  it('infers Quiz: Math from casual wording', () => {
    assert.equal(
      inferAssignmentTitleFromMessage('mak a quizz for lilly on math nxt fri'),
      'Quiz: Math',
    );
  });
});

describe('resolveInterpretedSlots', () => {
  it('maps names to ids and due hints', () => {
    const overrides = resolveInterpretedSlots({
      childName: 'Lilly',
      subjectName: 'Math',
      dueHint: 'tomorrow',
      title: 'Fractions quiz',
    }, roster);
    assert.deepEqual(overrides.childIds, ['c1']);
    assert.equal(overrides.subjectId, 's2');
    assert.ok(overrides.dueAt);
    assert.equal(overrides.title, 'Fractions Quiz');
  });
});

describe('interpretDoodleTurn', () => {
  it('returns structured preparer from injected LLM JSON', async () => {
    const interpreted = await interpretDoodleTurn({
      message: 'mak a quizz for lilly on math',
      roster,
      ctx,
      completeChat: async () => JSON.stringify({
        preparerKey: 'practice.generate',
        confidence: 0.9,
        normalizedMessage: 'make a quiz for Lilly on Math due next week Friday',
        slots: {
          childName: 'Lilly',
          subjectName: 'Math',
          dueHint: 'next week Friday',
        },
      }),
    });
    assert.equal(interpreted.preparerKey, 'practice.generate');
    assert.equal(interpreted.overrides.subjectId, 's2');
    assert.deepEqual(interpreted.overrides.childIds, ['c1']);
    assert.match(interpreted.normalizedMessage, /make a quiz/i);
  });

  it('returns null when LLM unavailable', async () => {
    const interpreted = await interpretDoodleTurn({
      message: 'hello',
      roster,
      ctx,
      completeChat: async () => null,
    });
    assert.equal(interpreted, null);
  });
});

describe('interpretClarificationValue', () => {
  it('parses nxt fri offline without LLM', async () => {
    const repaired = await interpretClarificationValue({
      message: 'nxt fri',
      pendingClarification: { intent: 'practice.generate', field: 'dueAt' },
      roster,
      completeChat: async () => null,
    });
    assert.ok(repaired?.value);
    assert.match(repaired.value, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(repaired.usedLlm, false);
  });
});

describe('dispatchInterpretedTurn', () => {
  it('routes practice.generate to preparer', async () => {
    const interpreted = {
      preparerKey: 'practice.generate',
      confidence: 0.9,
      normalizedMessage: 'make a quiz from next Math lesson for Lilly due tomorrow',
      overrides: { childIds: ['c1'], subjectId: 's2' },
    };
    const res = await dispatchInterpretedTurn(interpreted, {
      ctx,
      roster,
      trackPreview: (x) => x,
      preparePracticeGeneration: async () => ({
        type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
        message: 'ok',
        command: { type: 'assignment.create' },
      }),
    });
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
  });
});
