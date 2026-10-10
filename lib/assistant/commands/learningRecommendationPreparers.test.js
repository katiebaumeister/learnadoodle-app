import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTodayScheduleIntent,
  isCatchUpRecommendIntent,
  isLearningSuggestIntent,
  isExplainRecommendationIntent,
  isParentProgressSummaryIntent,
  isClassesDoneIntent,
} from './learningRecommendationPreparers.js';

describe('recommendation intent detectors', () => {
  it('detects today schedule questions', () => {
    assert.equal(isTodayScheduleIntent("what's on my calendar today?"), true);
    assert.equal(isTodayScheduleIntent('what is on my schedule today'), true);
    assert.equal(isTodayScheduleIntent('show me today schedule'), true);
    assert.equal(isTodayScheduleIntent('create an event today'), false);
  });

  it('detects catch-up recommendations', () => {
    assert.equal(isCatchUpRecommendIntent('catch up on History'), true);
    assert.equal(isCatchUpRecommendIntent('we are falling behind in Math'), true);
    assert.equal(isCatchUpRecommendIntent('how do I catch up attendance?'), false);
  });

  it('detects learning suggest phrasing including named child', () => {
    assert.equal(isLearningSuggestIntent('what should we do today?'), true);
    assert.equal(isLearningSuggestIntent('what should Emma work on today?'), true);
    assert.equal(isLearningSuggestIntent('suggest something for learning today'), true);
    assert.equal(isLearningSuggestIntent('how do I suggest a subject?'), false);
    assert.equal(isLearningSuggestIntent('why did you recommend math?'), false);
  });

  it('detects explainability and parent summary', () => {
    assert.equal(isExplainRecommendationIntent('why did you recommend that?'), true);
    assert.equal(isExplainRecommendationIntent('explain your recommendation'), true);
    assert.equal(isParentProgressSummaryIntent("summarize this week's progress"), true);
    assert.equal(isParentProgressSummaryIntent('how did Emma do this week?'), true);
    assert.equal(isParentProgressSummaryIntent('how do I summarize progress?'), false);
  });

  it('detects classes-done questions', () => {
    assert.equal(isClassesDoneIntent('what classes have I done so far'), true);
    assert.equal(isClassesDoneIntent('how many lessons have we completed'), true);
    assert.equal(isClassesDoneIntent('create a class for today'), false);
  });
});
