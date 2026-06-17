import { isHomeschoolPlanningMode } from './planningMode';

export function getSubjectsNavLabel(storedPlanningMode) {
  return isHomeschoolPlanningMode(storedPlanningMode) ? 'Subjects' : 'Learning';
}

export function getSubjectsYearHeaderLabel(year, storedPlanningMode) {
  if (!year) return null;
  return isHomeschoolPlanningMode(storedPlanningMode)
    ? `${year} School Year`
    : String(year);
}

export function getSubjectsCatalogEmptyCopy(storedPlanningMode, { isSearch = false } = {}) {
  if (isSearch) {
    return {
      title: 'No results found',
      text: 'Please try something else',
      primaryAction: null,
      secondaryAction: null,
    };
  }
  if (isHomeschoolPlanningMode(storedPlanningMode)) {
    return {
      title: 'No subjects yet',
      text: 'Create subjects to organize learning for your school year.',
      primaryAction: 'add_subject',
      secondaryAction: null,
    };
  }
  return {
    title: 'No subjects yet',
    text: 'Add subjects to track reading, practice, or enrichment.',
    primaryAction: 'add_subject',
    secondaryAction: null,
  };
}

export function getSubjectsEditSchoolYearLabel(storedPlanningMode) {
  return isHomeschoolPlanningMode(storedPlanningMode) ? 'Edit School Year' : 'Calendar settings';
}

export function shouldShowSubjectsYearTargets(storedPlanningMode) {
  return isHomeschoolPlanningMode(storedPlanningMode);
}

export function getSubjectsPlanEmptyScheduleText(storedPlanningMode, { overviewLoading = false } = {}) {
  if (overviewLoading) return 'Loading schedule status...';
  if (isHomeschoolPlanningMode(storedPlanningMode)) {
    return 'No subjects for this school year yet. Add a subject, then start scheduling.';
  }
  return 'No subjects yet. Add one from Learning or schedule events in Planner.';
}

export function getSubjectsPlanEditSettingsLabel(storedPlanningMode) {
  return isHomeschoolPlanningMode(storedPlanningMode)
    ? 'Edit School Year Settings'
    : 'Calendar settings';
}
