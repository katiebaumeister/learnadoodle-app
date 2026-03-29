/**
 * Run: npm run test:assistant  (Node built-in test runner, no extra deps)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triageIntentKeyword } from './intentClassifier.js';

test('rename Emma to Emily → update_child when Emma is on the roster', () => {
  const ctx = { children: [{ first_name: 'Emma', name: 'Emma', archived: false }] };
  assert.equal(triageIntentKeyword('rename Emma to Emily', ctx).intent, 'update_child');
});

test('rename subject … still → rename_subject even if a child is named Emma', () => {
  const ctx = { children: [{ first_name: 'Emma', archived: false }] };
  assert.equal(
    triageIntentKeyword('rename subject Algebra to Geometry for Emma', ctx).intent,
    'rename_subject'
  );
});

test('log grade wins over add_activity', () => {
  assert.equal(triageIntentKeyword('log grade A for Emma', {}).intent, 'log_grade');
});

test('list grades wins over log_grade phrasing', () => {
  assert.equal(triageIntentKeyword('show grades for Emma', {}).intent, 'list_grades');
});

test('rename two tokens without roster match still can hit update_event via later rules', () => {
  const ctx = { children: [{ first_name: 'Sam', archived: false }] };
  const r = triageIntentKeyword('rename Dentist to Doctor visit', ctx);
  assert.notEqual(r.intent, 'update_child');
});

test('https URL + add to library → add_material', () => {
  assert.equal(
    triageIntentKeyword('add https://example.org/course to our library', {}).intent,
    'add_material'
  );
});
