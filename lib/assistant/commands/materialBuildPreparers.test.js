import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCurriculumFromMaterialIntent,
  isPracticeFromMaterialIntent,
  isLessonFromLinkIntent,
} from './materialBuildIntents.js';

describe('material build intents', () => {
  it('detects curriculum from material / doc', () => {
    assert.equal(isCurriculumFromMaterialIntent('build units from this material'), true);
    assert.equal(isCurriculumFromMaterialIntent('parse this pdf into lessons for Math'), true);
    assert.equal(isCurriculumFromMaterialIntent('create curriculum from our syllabus doc'), true);
    assert.equal(isCurriculumFromMaterialIntent('build from material'), true);
    assert.equal(isCurriculumFromMaterialIntent('make a quiz on fractions'), false);
  });

  it('detects practice from material', () => {
    assert.equal(isPracticeFromMaterialIntent('make a quiz based on this doc'), true);
    assert.equal(isPracticeFromMaterialIntent('create a worksheet from “Science Lab” material'), true);
    assert.equal(isPracticeFromMaterialIntent('make a quiz for Lilly on math'), false);
    assert.equal(isPracticeFromMaterialIntent('quiz me on fractions'), false);
  });

  it('detects lesson from youtube / link', () => {
    assert.equal(
      isLessonFromLinkIntent('build a lesson around https://www.youtube.com/watch?v=abc123'),
      true,
    );
    assert.equal(isLessonFromLinkIntent('make a lesson from this youtube video for Math'), true);
    assert.equal(isLessonFromLinkIntent('schedule a field trip tomorrow'), false);
  });
});
