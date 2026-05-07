export const ATTENDANCE_MODES = {
  CLASS_DAY: 'class_day',
  SUBJECT: 'subject',
};

export function getAttendanceMode({
  academicYearMode,
  plannerSettingsMode,
  fallback = ATTENDANCE_MODES.CLASS_DAY,
} = {}) {
  const mode = String(academicYearMode || plannerSettingsMode || fallback || '').trim().toLowerCase();
  return mode === ATTENDANCE_MODES.SUBJECT
    ? ATTENDANCE_MODES.SUBJECT
    : ATTENDANCE_MODES.CLASS_DAY;
}

export function isClassDayMode(input) {
  if (typeof input === 'string') {
    return getAttendanceMode({ academicYearMode: input }) === ATTENDANCE_MODES.CLASS_DAY;
  }
  return getAttendanceMode(input || {}) === ATTENDANCE_MODES.CLASS_DAY;
}

export function isSubjectMode(input) {
  return !isClassDayMode(input);
}

export function shouldWarnAttendanceModeSwitch({
  fromMode,
  toMode,
  isDataRich = false,
} = {}) {
  return Boolean(isDataRich) && isSubjectMode(fromMode) && isClassDayMode(toMode);
}
