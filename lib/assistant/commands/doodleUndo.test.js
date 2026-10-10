import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doodleUndo } from './doodleUndo.js';
import { authorizePlannerWrite } from './commandUtils.js';
import { DOODLE_RESPONSE_TYPES } from './types.js';

describe('doodleUndo', () => {
  it('rejects missing token', async () => {
    const res = await doodleUndo({
      context: { householdId: 'f1', userId: 'u1', userRole: 'parent' },
    });
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ERROR);
    assert.match(res.message, /nothing to undo/i);
  });

  it('rejects unsupported token kinds', async () => {
    const res = await doodleUndo({
      undoToken: 'material:abc',
      undoPayload: { kind: 'create' },
      context: { householdId: 'f1', userId: 'u1', userRole: 'parent' },
    });
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ERROR);
    assert.match(res.message, /not supported/i);
  });

  it('blocks undo when canManageEvents is false for non-parents', async () => {
    const res = await doodleUndo({
      undoToken: 'event:abc',
      undoPayload: { kind: 'create' },
      context: { householdId: 'f1', userId: 'u1', userRole: 'child' },
      capabilities: { canManageEvents: false },
    });
    assert.equal(res.type, DOODLE_RESPONSE_TYPES.ERROR);
    assert.match(res.message, /permission/i);
  });
});

describe('authorizePlannerWrite', () => {
  it('allows parents even when canManageEvents is false', () => {
    const res = authorizePlannerWrite(
      { householdId: 'f1' },
      { householdId: 'f1', userRole: 'parent' },
      { canManageEvents: false },
    );
    assert.equal(res.ok, true);
  });

  it('blocks tutors when canManageEvents is false', () => {
    const res = authorizePlannerWrite(
      { householdId: 'f1' },
      { householdId: 'f1', userRole: 'tutor' },
      { canManageEvents: false },
      'edit events',
    );
    assert.equal(res.ok, false);
  });
});
