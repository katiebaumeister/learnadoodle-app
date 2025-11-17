// Tool types and definitions

export const TOOL_KEYS = {
  TASKS: 'tasks',
  SEARCH: 'search',
  BACKLOG: 'backlog',
  CALENDAR: 'calendar',
  WEEKLY_OBJECTIVES: 'objectives',
  COMPLETED: 'completed',
  REBALANCE: 'rebalance',
  PACK_THIS_WEEK: 'pack',
  WHAT_IF: 'whatif',
  SCHEDULE_RULES: 'schedule_rules',
  BLACKOUTS: 'blackouts',
  HEATMAP: 'heatmap',
  SETTINGS: 'settings',
  AI_TOOLS: 'ai_tools',
};

export const COMMON_LABELS = ['projects', 'homework', 'lessons'];

export const TOOL_META = {
  [TOOL_KEYS.TASKS]: { label: 'Tasks', desc: 'Manage your tasks and assignments' },
  [TOOL_KEYS.SEARCH]: { label: 'Search', desc: 'Search events and lessons' },
  [TOOL_KEYS.BACKLOG]: { label: 'Backlog', desc: 'View and manage tasks in your backlog' },
  [TOOL_KEYS.CALENDAR]: { label: 'Calendar Integration', desc: 'Connect external calendars' },
  [TOOL_KEYS.WEEKLY_OBJECTIVES]: { label: 'Weekly Objectives', desc: 'Set and track weekly learning objectives' },
  [TOOL_KEYS.COMPLETED]: { label: 'Completed', desc: 'View all completed tasks' },
  [TOOL_KEYS.REBALANCE]: { label: 'Rebalance', desc: 'AI-powered schedule rebalancing' },
  [TOOL_KEYS.PACK_THIS_WEEK]: { label: 'Pack This Week', desc: 'AI-powered week packing' },
  [TOOL_KEYS.WHAT_IF]: { label: 'What-if Analysis', desc: 'Analyze different scheduling scenarios' },
  [TOOL_KEYS.SCHEDULE_RULES]: { label: 'Schedule Rules', desc: 'Configure weekly teaching hours and overrides' },
  [TOOL_KEYS.BLACKOUTS]: { label: 'Blackouts', desc: 'Manage time-off blocks for the calendar' },
  [TOOL_KEYS.HEATMAP]: { label: 'Curriculum Heatmap', desc: 'View weekly subject minutes scheduled vs done' },
  [TOOL_KEYS.SETTINGS]: { label: 'Settings', desc: 'Schedule configuration and settings' },
  [TOOL_KEYS.AI_TOOLS]: { label: 'AI Tools', desc: 'Advanced AI-powered planning tools' },
};

