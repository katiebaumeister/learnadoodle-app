// Pastel system for Learnadoodle attendance (diverse colors for heatmap/calendar)
export const ATTENDANCE_COLORS = {
  present: '#7ECF9A',   // attended (soft green)
  unmarked: '#BFDBFE',  // upcoming (slightly darker than previous #DBEAFE)
  absent: '#F5A6A2',   // unattended
  noEvents: '#F8FAFC',  // no events
};

// Design tokens for attendance page (mirrors :root tokens)
export const TOKENS = {
  contentMax: 1200,
  contentPadX: 32,
  contentPadY: 24,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,
  s9: 48,
  rMd: 16,
  rLg: 20,
  text: 'rgba(15, 23, 42, 0.92)',
  textMuted: 'rgba(15, 23, 42, 0.62)',
  textFaint: 'rgba(15, 23, 42, 0.44)',
  border: 'rgba(15, 23, 42, 0.08)',
  bgSubtle: 'rgba(15, 23, 42, 0.03)',
  bgSurface: '#ffffff',
  bg: '#ffffff',
  accent: '#887DEE',
  shadow1: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 0, elevation: 1 },
  shadow2: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 28, elevation: 4 },
  fontSizeH2: 16,
  fontSizeCaption: 12,
  hmCell: 26,
  hmGap: 6,
  hmRadius: 7,
  /** Smaller year grid for Learning subject attendance (not Planner Year view). */
  hmCellCompact: 20,
  hmGapCompact: 4,
  hmRadiusCompact: 5,
  barH: 6,
  barRadius: 999,
  studentColumnWidth: 360,
};

export const STATUS_LABELS = {
  on_track: '● On Track',
  slightly_behind: '▲ Slightly Behind',
  at_risk: '◆ At Risk',
};
