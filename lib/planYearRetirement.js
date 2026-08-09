import { Platform } from 'react-native';

const CURRICULUM_METHODS = new Set(['manual', 'generate', 'upload', 'paste_plain', 'paste']);

export const SUBJECTS_PENDING_PLAN_OPEN_STORAGE_KEY = 'ld_pending_subject_schedule_plan_open';
export const MAGIC_EXTRACT_PASTE_STORAGE_KEY = 'learnadoodle:magicExtractPasteDraft';

export const PLANNER_DEFAULT_CALENDAR_VIEW = 'board';

export function sanitizeLegacyPlanYearView(view) {
  const raw = String(view || '').trim().toLowerCase();
  // Legacy "week" is the same calendar surface as "board" (Week chip).
  if (!raw || raw === 'plan-year' || raw === 'edit-year' || raw === 'week') {
    return PLANNER_DEFAULT_CALENDAR_VIEW;
  }
  return raw;
}

export function shouldOpenSubjectUnitsEditorInsteadOfPlanYear(detail) {
  if (!detail?.subjectId) return false;
  const method = String(detail.initialUnitStructureMethod || '').trim().toLowerCase();
  if (!method) return false;
  if (detail.skipPlanSummary !== true) return false;
  if (detail.openToEditList === true && detail.openDirectlyToScope !== true) return false;
  const normalized = method === 'paste' ? 'paste_plain' : method;
  return CURRICULUM_METHODS.has(normalized);
}

export function normalizeSubjectUnitsEditorMethod(method) {
  const raw = String(method || '').trim().toLowerCase();
  if (raw === 'paste') return 'paste_plain';
  if (CURRICULUM_METHODS.has(raw)) return raw === 'paste' ? 'paste_plain' : raw;
  return 'manual';
}

export function dispatchOpenSubjectUnitsEditor(detail = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const rawMethod = detail.method ?? detail.initialUnitStructureMethod ?? null;
  const method = rawMethod ? normalizeSubjectUnitsEditorMethod(rawMethod) : null;
  window.dispatchEvent(
    new CustomEvent('openSubjectUnitsEditor', {
      detail: {
        subjectId: detail.subjectId ?? null,
        subjectName: detail.subjectName ?? null,
        method,
        childIds: Array.isArray(detail.childIds) ? detail.childIds : [],
        academicYearId: detail.academicYearId ?? detail.academic_year_id ?? null,
        initialMaterialId: detail.initialMaterialId ?? detail.materialId ?? null,
        autoContinueOnOpen: detail.autoContinueOnOpen === true,
        hasExistingContent:
          typeof detail.hasExistingContent === 'boolean'
            ? detail.hasExistingContent
            : (typeof detail.subjectHasCurriculumContent === 'boolean'
              ? detail.subjectHasCurriculumContent
              : null),
      },
    })
  );
  return true;
}

export function dispatchOpenSchoolYearSettings() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent('openPlanningPreferences'));
  window.dispatchEvent(new CustomEvent('openSchoolYearSettings'));
  return true;
}

/** Opens School Year Settings as an overlay modal (stays on current page). */
export function dispatchOpenSchoolYearSettingsModal(schoolYearLabel = null) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const label = schoolYearLabel != null ? String(schoolYearLabel).trim() || null : null;
  window.dispatchEvent(new CustomEvent('openEditSchoolYearModal', { detail: { schoolYearLabel: label } }));
  return true;
}

/** Opens the standalone Day off create/edit modal (no School Year Settings backdrop). */
export function dispatchOpenDayOffModal(defaultDate = null, schoolYearLabel = null, editRow = null) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent('openDayOffModal', {
    detail: {
      defaultDate: defaultDate || null,
      schoolYearLabel: schoolYearLabel != null ? String(schoolYearLabel).trim() || null : null,
      editRow: editRow || null,
    },
  }));
  return true;
}

/**
 * Planner chip click → Edit day off for family exclusions; School Year Settings for US public holidays.
 */
export async function dispatchOpenDayOffForPlannerEvent(event, {
  familyId = null,
  exclusions = [],
  schoolYearLabel = null,
} = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !event) return false;

  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  if (holidayType === 'GLOBAL_HOLIDAY') {
    return dispatchOpenSchoolYearSettingsModal(schoolYearLabel);
  }

  const {
    dayOffRowFromExclusion,
    matchPlannerExclusionForDayOffEvent,
    fetchPlannerExclusionForDayOffEvent,
  } = await import('./create/saveDayOffHelpers');

  let exclusion = matchPlannerExclusionForDayOffEvent(event, exclusions);
  if (!exclusion && familyId) {
    exclusion = await fetchPlannerExclusionForDayOffEvent(event, familyId);
  }

  const editRow = exclusion ? dayOffRowFromExclusion(exclusion) : null;
  const dateStr = String(event.date_local || event.date || '').slice(0, 10)
    || String(event.start_ts || event.start || '').slice(0, 10);
  const defaultDate = dateStr ? new Date(`${dateStr}T12:00:00`) : null;
  return dispatchOpenDayOffModal(defaultDate, schoolYearLabel, editRow);
}

/** @deprecated Use dispatchOpenDayOffModal */
export function dispatchOpenSchoolYearSettingsAddDayOff(defaultDate = null, schoolYearLabel = null) {
  return dispatchOpenDayOffModal(defaultDate, schoolYearLabel);
}

export function storePendingMagicExtractPaste(rawText) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const text = String(rawText || '').trim();
  if (!text) return;
  try {
    window.sessionStorage.setItem(
      MAGIC_EXTRACT_PASTE_STORAGE_KEY,
      JSON.stringify({ rawText: text, at: Date.now() })
    );
  } catch (_) {}
}

export function consumePendingMagicExtractPaste() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(MAGIC_EXTRACT_PASTE_STORAGE_KEY);
    window.sessionStorage.removeItem(MAGIC_EXTRACT_PASTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return String(parsed?.rawText || '').trim() || null;
  } catch (_) {
    return null;
  }
}

function inferUnitsEditorMethod(detail) {
  if (detail?.initialUnitStructureMethod) {
    return normalizeSubjectUnitsEditorMethod(detail.initialUnitStructureMethod);
  }
  if (detail?.materialId) return 'upload';
  const from = String(detail?.from || '').trim();
  if (from === 'generate_curriculum') return 'generate';
  if (from === 'library') return 'paste_plain';
  if (from === 'magic_extract') return 'paste_plain';
  return null;
}

/**
 * Route legacy Plan Year requests to School Year Settings, subject page, or units editor.
 */
export function handleLegacyPlanYearRequest(detail = {}, handlers = {}) {
  const { handleTabChange } = handlers;
  const yearIdFromEvent =
    detail.academicYearId ||
    detail.academic_year_id ||
    detail.yearPlanId ||
    detail.year_plan_id ||
    null;

  if (shouldOpenSubjectUnitsEditorInsteadOfPlanYear(detail)) {
    dispatchOpenSubjectUnitsEditor({
      subjectId: detail.subjectId,
      subjectName: detail.subjectName,
      method: detail.initialUnitStructureMethod,
      childIds: detail.childIds,
      academicYearId: yearIdFromEvent,
      hasExistingContent: detail.subjectHasCurriculumContent,
    });
    return 'subject_units';
  }

  if (detail.openInSubjectsSchedule === true && detail.subjectId) {
    const pendingPayload = {
      from: 'event_details',
      subjectId: detail.subjectId != null ? String(detail.subjectId) : null,
      subjectName: detail.subjectName != null ? String(detail.subjectName) : null,
      academicYearId: yearIdFromEvent || null,
      schoolYear: detail.schoolYear ?? detail.subjectSchoolYear ?? null,
      schoolTerm: detail.schoolTerm ?? detail.subjectSchoolTerm ?? null,
      openToEditList: detail.openToEditList === true || !yearIdFromEvent,
      skipPlanSummary: detail.skipPlanSummary === true,
    };
    try {
      window.sessionStorage.setItem(
        SUBJECTS_PENDING_PLAN_OPEN_STORAGE_KEY,
        JSON.stringify(pendingPayload)
      );
    } catch (_) {}
    handleTabChange?.('subjects');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    return 'subjects_schedule';
  }

  const subjectId = detail.subjectId != null ? String(detail.subjectId).trim() : '';
  const from = String(detail.from || '').trim();

  if (from === 'magic_extract') {
    handleTabChange?.('subjects');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    return 'subjects_magic_extract';
  }

  if (subjectId) {
    dispatchOpenSubjectUnitsEditor({
      subjectId,
      subjectName: detail.subjectName,
      method: inferUnitsEditorMethod(detail),
      childIds: detail.childIds,
      academicYearId: yearIdFromEvent,
      hasExistingContent: detail.subjectHasCurriculumContent,
    });
    handleTabChange?.(`subject-${subjectId}`);
    return 'subject_units';
  }

  dispatchOpenSchoolYearSettings();
  return 'school_year_settings';
}

export function dispatchNavigateToTab(tab) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent('openNavigateTab', { detail: { tab: String(tab || '').trim() } }));
  return true;
}

export function handleLegacyBuildCurriculumRequest(detail = {}, handlers = {}) {
  return handleLegacyPlanYearRequest(
    {
      ...detail,
      from: detail.from || 'generate_curriculum',
      skipPlanSummary: true,
      openDirectlyToScope: true,
      initialUnitStructureMethod: detail.initialUnitStructureMethod || 'generate',
    },
    handlers
  );
}
