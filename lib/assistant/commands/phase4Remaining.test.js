import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdaptivePracticeIntent,
  prepareAdaptivePractice,
} from './practiceAdaptivePreparers.js';
import {
  isPortfolioOrganizeIntent,
  groupEvidenceBySubject,
  preparePortfolioOrganize,
} from './portfolioOrganizePreparers.js';
import {
  isThemeProjectWeekIntent,
  extractThemeFromMessage,
  buildThemeWeekCommands,
  prepareThemeProjectWeek,
} from './themeProjectPreparers.js';
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
  children: [{ id: 'c1', first_name: 'Lilly', age: 10 }],
  subjects: [
    { id: 's1', name: 'History' },
    { id: 's2', name: 'Math' },
    { id: 's3', name: 'Science' },
  ],
};

describe('adaptive practice', () => {
  it('detects adaptive phrasing', () => {
    assert.equal(isAdaptivePracticeIntent('adaptive practice for Lilly on Math'), true);
    assert.equal(isAdaptivePracticeIntent('easier practice based on struggles'), true);
    assert.equal(isAdaptivePracticeIntent('make a quiz on fractions'), false);
  });

  it('previews assignment from continuity signals', async () => {
    const res = await prepareAdaptivePractice(
      'adaptive practice for Lilly on Math due tomorrow',
      ctx,
      roster,
      {},
      {
        continuityBundle: {
          assignments: [{
            id: 'a1',
            title: 'Fractions worksheet',
            related_subject: 's2',
            due_date: '2020-01-01',
            need_help: true,
            status: 'open',
          }],
          outcomes: [],
          upcoming: [],
          interests: [],
          planHealth: null,
        },
        completeChat: async () => 'Practice\n1. Warm-up\n2. Core\n3. Stretch',
      },
    );
    assert.ok(
      res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW
      || res.type === DOODLE_RESPONSE_TYPES.CLARIFICATION,
    );
    if (res.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
      assert.equal(res.command.type, 'assignment.create');
      assert.match(res.command.title, /Practice/i);
      assert.match(res.message, /easier|harder|Adaptive/i);
    }
  });
});

describe('portfolio organize', () => {
  it('detects organize intent', () => {
    assert.equal(isPortfolioOrganizeIntent('organize portfolio evidence for Lilly'), true);
    assert.equal(isPortfolioOrganizeIntent('delete portfolio'), false);
  });

  it('groups evidence and answers', async () => {
    const grouped = groupEvidenceBySubject([
      { id: '1', subject_id: 's2', caption: 'Math worksheet' },
      { id: '2', subject_id: null, caption: 'Field trip photo' },
    ], roster);
    assert.equal(grouped.total, 2);
    assert.equal(grouped.untagged, 1);

    const res = await preparePortfolioOrganize(
      'organize portfolio for Lilly',
      ctx,
      roster,
      {},
      {
        evidenceItems: [
          { id: '1', subject_id: 's2', caption: 'Math worksheet' },
          { id: '2', subject_id: null, caption: 'Field trip photo' },
        ],
      },
    );
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ANSWER);
    assert.match(res.message, /Untagged|Math/i);
    assert.ok(res.links?.some((l) => /portfolio/i.test(l.href)));
  });
});

describe('theme project week', () => {
  it('extracts theme and detects intent', () => {
    assert.equal(isThemeProjectWeekIntent('Plan an ocean-themed project week for Lilly'), true);
    assert.equal(extractThemeFromMessage('ocean-themed week'), 'ocean');
    assert.equal(isThemeProjectWeekIntent('plan my week'), false);
  });

  it('builds batch learning days', () => {
    const { commands, preview } = buildThemeWeekCommands({
      theme: 'Ocean',
      subjects: roster.subjects,
      childIds: ['c1'],
      householdId: 'family-1',
      weekStartYmd: '2026-10-12',
    });
    assert.equal(commands.length, 3);
    assert.equal(commands[0].type, 'learning_day.create');
    assert.match(commands[0].title, /Ocean/);
    assert.equal(preview.length, 3);
  });

  it('returns batch preview from preparer', async () => {
    const res = await prepareThemeProjectWeek(
      'Plan an ocean-themed project week for Lilly',
      ctx,
      roster,
      { weekStartYmd: '2026-10-12' },
    );
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.BATCH_ACTION_PREVIEW);
    assert.ok(res.commands?.length >= 2);
    assert.match(res.message, /Ocean|ocean/i);
  });
});
