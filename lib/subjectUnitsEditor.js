/**
 * Canonical subject units editor entry points.
 *
 * Do not add alternate unit/lesson modal UIs — route everything through:
 *   EditSubjectUnitsModal → ManualCurriculumBuilderModal
 *
 * On web, prefer dispatchOpenSubjectUnitsEditor() so SubjectUnitsEditorHost opens the flow.
 */

export {
  dispatchOpenSubjectUnitsEditor,
  normalizeSubjectUnitsEditorMethod,
  storePendingMagicExtractPaste,
  consumePendingMagicExtractPaste,
} from './planYearRetirement';

/** @deprecated Legacy modal names — kept as redirect stubs only. */
export const DEPRECATED_SUBJECT_UNITS_MODALS = Object.freeze([
  'ParsePlainTextModal',
  'GenerateCurriculumModal',
]);

export const SUBJECT_UNITS_EDITOR_COMPONENTS = Object.freeze({
  orchestrator: 'components/subjects/EditSubjectUnitsModal.js',
  draftEditor: 'components/ManualCurriculumBuilderModal.js',
  host: 'components/subjects/SubjectUnitsEditorHost.js',
});
