/**
 * Pure material chat parsers. Run via npm run test:assistant
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHttpUrl,
  parseAddMaterialLinkIntent,
  parseRenameMaterialTitles,
  resolveMaterialFromUserMessage,
} from './materialParse.js';

const emma = { id: 'c1', first_name: 'Emma', name: 'Emma Smith', archived: false };
const algebra = { id: 's1', name: 'Algebra' };

test('extractHttpUrl: strips trailing punctuation', () => {
  assert.equal(extractHttpUrl('see https://example.com/path.,'), 'https://example.com/path');
});

test('parseAddMaterialLinkIntent: need_url when no URL', () => {
  const r = parseAddMaterialLinkIntent('add this to our library', [], []);
  assert.deepEqual(r, { kind: 'need_url' });
});

test('parseAddMaterialLinkIntent: ready with title in quotes', () => {
  const r = parseAddMaterialLinkIntent(
    'save material "Khan unit 2" https://khanacademy.org/foo for Emma in Algebra',
    [emma],
    [algebra]
  );
  assert.ok(r && r.kind === 'ready');
  assert.equal(r.title, 'Khan unit 2');
  assert.match(r.providerUrl, /^https:\/\/khanacademy\.org/);
  assert.equal(r.childId, 'c1');
  assert.equal(r.subjectId, 's1');
});

test('parseAddMaterialLinkIntent: null when URL but no library context', () => {
  assert.equal(
    parseAddMaterialLinkIntent('email me at https://x.com/y unrelated text here please', [], []),
    null
  );
});

test('parseRenameMaterialTitles: unquoted', () => {
  const r = parseRenameMaterialTitles('rename old workbook to Algebra workbook');
  assert.deepEqual(r, { oldHint: 'old workbook', newTitle: 'Algebra workbook' });
});

test('resolveMaterialFromUserMessage: quoted title', () => {
  const mats = [{ id: 'm1', title: 'Science Lab PDF', type: 'other' }];
  const r = resolveMaterialFromUserMessage('delete "Science Lab"', mats);
  assert.equal(r.ok, true);
  assert.equal(r.material.id, 'm1');
});
