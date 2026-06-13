/** Smart Actions menu — mirrors AIToolsModal superpowers/modes. */
export const PLANNER_SMART_ACTION_SECTIONS = [
  {
    id: 'fix-my-week',
    title: 'Fix My Week',
    modes: [
      { id: 'rebalance', title: 'Rebalance' },
      { id: 'catch-up', title: 'Catch Up' },
      { id: 'pack-week', title: 'Pack This Week' },
    ],
  },
  {
    id: 'plan-ahead',
    title: 'Plan Ahead',
    modes: [
      { id: 'school-year-settings', title: 'School Year Settings' },
      { id: 'what-if', title: 'What-If Scenarios' },
    ],
  },
  {
    id: 'understand-progress',
    title: 'Understand Our Progress',
    modes: [
      { id: 'summarize-progress', title: 'Progress Snapshot' },
      { id: 'analytics', title: 'Learning Analytics' },
      { id: 'heatmap', title: 'Curriculum Heatmap' },
    ],
  },
];

export const PLANNER_SMART_ACTION_TOOLS = [
  { id: 'bulk-attendance', title: 'Bulk Attendance' },
  { id: 'export-attendance', title: 'Export Attendance' },
];

export const PLANNER_SMART_ACTION_UTILITIES = [
  { id: 'export', title: 'Export Planner' },
];

export function dispatchPlannerSmartAction(modeId) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('plannerSmartAction', { detail: { modeId } }));
}

export function dispatchOpenEditSchoolYearModal(schoolYearLabel = null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('openEditSchoolYearModal', { detail: { schoolYearLabel } }));
}
