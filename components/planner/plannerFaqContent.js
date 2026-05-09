/**
 * Single source of truth for Planner & Calendar FAQs (Help popover + Family → Help & FAQ).
 */
export const PLANNER_FAQ = [
  {
    id: 'pl-1',
    q: 'How does the planner work?',
    a: 'Plans define recurring structure (e.g. “Biographies 3×/week”). Events are the scheduled instances on your calendar. Attendance records what actually happened. Editing a plan updates many future events; editing one event overrides just that day; marking attendance records reality without breaking the plan.',
  },
  {
    id: 'pl-2',
    q: 'When should I edit a plan vs an event?',
    a: 'Edit an event when only this day should be different. Edit the plan when the recurring pattern or cadence should change for the future.',
  },
  {
    id: 'pl-3',
    q: 'What if plans change?',
    a: 'Reschedule to move an event, Skip when it will not happen, or adjust weekly rhythm in Schedule and Planning Preferences. Your history stays intact while future scheduling adapts.',
  },
  {
    id: 'pl-4',
    q: 'How does attendance work?',
    a: 'Tracked per child, per day, per event. Open a day to see events and toggle attended or not attended. Only instructional events (like lessons) roll into learning totals. Shared events can count for multiple children; attendance updates reports and records, not the plan itself.',
  },
  {
    id: 'pl-5',
    q: 'How do I edit an event?',
    a: 'Click the event, then Edit Event. You can change time, assignee, event type, or date. If the event comes from a plan, you will see a notice: changes here are one-off overrides and do not change the full plan.',
  },
  {
    id: 'pl-6',
    q: 'How do I edit a plan?',
    a: 'Use Schedule and Planning Preferences to adjust recurring structure and cadence. Changes update future scheduled events while past events and attendance are preserved.',
  },
  {
    id: 'pl-7',
    q: 'What does “Backlog” mean?',
    a: 'Backlog is your unscheduled pool: ideas, lessons not yet on the calendar, overflow work. Drag or add items to the calendar anytime—unscheduled, not forgotten.',
  },
  {
    id: 'pl-8',
    q: 'What counts toward learning totals?',
    a: 'Lessons and instructional activities count toward required learning totals. Appointments, trips, and extracurriculars are still tracked but do not count toward those totals.',
  },
  {
    id: 'pl-9',
    q: 'Can multiple children share events?',
    a: 'Yes. One event can apply to multiple children; you can still mark attendance per child, and reports reflect each child separately.',
  },
  {
    id: 'pl-10',
    q: 'Does Learnadoodle integrate with my device calendars?',
    a: 'You can connect external calendars so family schedules stay in sync with Learnadoodle.',
  },
];
