import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import './registerAll.js';
import {
  isAssignmentMoveIntent,
  isAssignmentUpdateIntent,
  isAssignmentDeleteIntent,
  resolveAssignmentFromMessage,
  prepareAssignmentMove,
} from './assignmentIntentPreparers.js';
import { DOODLE_RESPONSE_TYPES } from './types.js';

const roster = {
  children: [
    { id: 'c1', first_name: 'Emma' },
    { id: 'c2', first_name: 'Noah' },
  ],
  subjects: [
    { id: 'math', name: 'Math' },
    { id: 'hist', name: 'History' },
  ],
};

const fixtures = [
  {
    id: 'a1',
    title: 'Multiplication Practice',
    due_date: '2026-10-13',
    child_id: 'c1',
    related_subject: 'math',
    linked_event_ids: ['e1'],
  },
  {
    id: 'a2',
    title: 'Fractions Worksheet',
    due_date: '2026-10-14',
    child_id: 'c1',
    related_subject: 'math',
    linked_event_ids: ['e2'],
  },
  {
    id: 'a3',
    title: 'Ocean Essay',
    due_date: '2026-10-20',
    child_id: 'c2',
    related_subject: 'hist',
    linked_event_ids: [],
  },
];

describe('assignment intent detectors', () => {
  it('detects move / update / delete', () => {
    assert.equal(isAssignmentMoveIntent("Move Emma's math assignment to Friday"), true);
    assert.equal(isAssignmentMoveIntent('move field trip to Friday'), false);
    assert.equal(isAssignmentUpdateIntent('rename Fractions Worksheet assignment to Fraction Practice'), true);
    assert.equal(isAssignmentDeleteIntent('delete the Fractions Worksheet assignment'), true);
    assert.equal(isAssignmentDeleteIntent('delete History learning day'), false);
  });
});

describe('resolveAssignmentFromMessage', () => {
  it('asks which when Emma has two math assignments', () => {
    const resolved = resolveAssignmentFromMessage(
      "Move Emma's math assignment to Friday",
      fixtures,
      roster,
    );
    assert.equal(resolved.ok, false);
    assert.ok(resolved.candidates.length >= 2);
    assert.ok(resolved.candidates.every((c) => c.child_id === 'c1'));
  });

  it('picks a unique title match', () => {
    const resolved = resolveAssignmentFromMessage(
      'move Fractions Worksheet assignment to Friday',
      fixtures,
      roster,
    );
    assert.equal(resolved.ok, true);
    assert.equal(resolved.assignment.id, 'a2');
  });
});

describe('prepareAssignmentMove', () => {
  const ctx = {
    householdId: 'family-1',
    userId: 'user-1',
    userRole: 'parent',
    enabledFeatures: ['assignments'],
  };

  it('clarifies which assignment then previews move after pick + date', async () => {
    const first = await prepareAssignmentMove(
      "Move Emma's math assignment to Friday",
      ctx,
      roster,
      { _assignments: fixtures },
    );
    assert.equal(first.type, DOODLE_RESPONSE_TYPES.CLARIFICATION);
    assert.equal(first.clarification?.intent, 'assignment.move');
    assert.ok(first.options?.length >= 2);

    const pick = first.options.find((o) => o.value === 'a2');
    assert.ok(pick);

    // Date already in original message — after pick should preview
    const second = await prepareAssignmentMove(
      first.clarification.originalMessage,
      ctx,
      roster,
      {
        _assignments: fixtures,
        assignmentId: pick.value,
        assignmentTitle: 'Fractions Worksheet',
      },
    );
    assert.equal(second.type, DOODLE_RESPONSE_TYPES.ACTION_PREVIEW);
    assert.equal(second.command.type, 'assignment.update');
    assert.equal(second.command.assignmentId, 'a2');
    assert.ok(second.command.dueYmd);
    assert.match(second.preview.map((f) => f.value).join(' '), /→/);
  });
});
