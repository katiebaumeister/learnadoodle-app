/**
 * Shared user-facing copy for School Year Settings (formerly Planning Preferences).
 * Single source so wording stays aligned across Settings, planner toolbar, and subject flows.
 */
export const SCHOOL_YEAR_SETTINGS_UI = {
  pageTitle: 'School Year Settings',
  embeddedTitle: 'School Year Settings',
  navLabel: 'School Year',
  toolbarLabel: 'School Year Settings',
  openCta: 'Open School Year Settings',
  sections: {
    learningDays: 'Learning days',
    defaultLearningDays: 'Default learning days',
    defaultLearningHours: 'Default learning hours',
    /** @deprecated Use defaultLearningHours */
    learningHours: 'Default learning hours',
    attendanceTracking: 'Attendance tracking',
    holidays: 'Holidays',
    breaks: 'Breaks',
    daysOff: 'Days off',
  },
  /** @deprecated Use SCHOOL_YEAR_SETTINGS_UI — kept for imports during migration */
  legacyPlanningPreferencesTitle: 'School Year Settings',
};

/** Subject-level defaults in Add/Edit Subject modal (not global school year). */
export const PLANNING_PREFERENCES_UI = {
  subjectModalAccordionTitle: 'Subject planning defaults',
  customDaysSectionTitle: SCHOOL_YEAR_SETTINGS_UI.sections.daysOff,
  customDaysOffListTitle: 'Custom days off',
  addDayOff: 'Add day off',
  addDay: 'Add day off',
  rangesSectionTitle: SCHOOL_YEAR_SETTINGS_UI.sections.daysOff,
  addRange: 'Add day off',
  dayNamePlaceholder: 'Day name',
  endDatePlaceholder: 'End (optional)',
  rangeNamePlaceholder: 'Day name',
};
