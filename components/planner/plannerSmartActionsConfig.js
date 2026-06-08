/** Smart Actions menu — mirrors AIToolsModal superpowers/modes. */
export const PLANNER_SMART_ACTION_SECTIONS = [
  {
    id: 'fix-my-week',
    title: 'Fix My Week',
    description: 'Things got messy. Help me tidy and catch up.',
    modes: [
      { id: 'rebalance', title: 'Rebalance' },
      { id: 'catch-up', title: 'Catch Up' },
      { id: 'pack-week', title: 'Pack This Week' },
    ],
  },
  {
    id: 'plan-ahead',
    title: 'Plan Ahead',
    description: 'Help me think beyond just this week.',
    modes: [
      { id: 'plan-year', title: 'Plan the Year' },
      { id: 'what-if', title: 'What-If Scenarios' },
    ],
  },
  {
    id: 'understand-progress',
    title: 'Understand Our Progress',
    description: 'Are we on track? What\'s working? What needs a tweak?',
    modes: [
      { id: 'summarize-progress', title: 'Progress Snapshot' },
      { id: 'analytics', title: 'Learning Analytics' },
      { id: 'heatmap', title: 'Curriculum Heatmap' },
    ],
  },
];

export function dispatchPlannerSmartAction(modeId) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('plannerSmartAction', { detail: { modeId } }));
}
