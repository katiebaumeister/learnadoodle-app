/**
 * Single source of truth for Planner & Calendar FAQs (Help popover + Family → Help & FAQ).
 */
export const PLANNER_FAQ = [
  {
    id: 'pl-1',
    q: 'How does the planner work?',
    a: 'Think of Planner as your day-to-day execution calendar: create, edit, move, and complete events there. Use Subjects > Schedule for recurring subject cadence and learner-facing schedule metrics. Use Family > Planning Preferences for family-wide defaults (learning days, date ranges, exclusions, and targets).',
  },
  {
    id: 'pl-2',
    q: 'When should I edit the schedule vs an event?',
    a: 'Edit Schedule when the recurring pattern should change for future lessons. Edit an Event when only one date should change (time, date, assignees, or type). If the change is temporary, stay in Planner event edit; if it is structural, update Subjects > Schedule.',
  },
  {
    id: 'pl-3',
    q: 'What if plans change?',
    a: 'Use Planner for immediate adjustments (reschedule, skip, or edit the event). If the same change will continue, update Subjects > Schedule so future cadence stays aligned. Existing history, attendance, and completed records remain intact.',
  },
  {
    id: 'pl-4',
    q: 'How does attendance work?',
    a: 'Attendance is tracked per child per event. Mark attendance from Planner event/day views, then review learner-level progress via schedule metrics and records views. Attendance updates reporting and learning totals without rewriting recurring schedule configuration.',
  },
  {
    id: 'pl-5',
    q: 'How do I edit an event?',
    a: 'Open the event in Planner and choose Edit Event. You can update date, time, event type, child assignment, and details. Event edits apply only to that item; recurring cadence still lives in Subjects > Schedule.',
  },
  {
    id: 'pl-6',
    q: 'How do I manage Schedule and Planning Preferences?',
    a: 'Use Subjects > Schedule for per-subject recurring cadence and schedule metrics. Use Family > Planning Preferences for family-wide guardrails: learning days, year boundaries, exclusions/breaks, and learning targets. In practice, subjects set cadence while preferences set global constraints.',
  },
  {
    id: 'pl-7',
    q: 'How do I add a one-off event from a subject?',
    a: 'In Subjects > Schedule, click Add event in the Actions column. The event composer opens prefilled to that subject so you can quickly add exceptions, special sessions, or ad-hoc lessons without changing recurring cadence.',
  },
  {
    id: 'pl-8',
    q: 'What does Backlog mean?',
    a: 'Backlog is your unscheduled queue. Use it for ideas and future work you do not want to lose, then move items into Planner when ready to schedule. It helps separate planning capture from calendar commitment.',
  },
  {
    id: 'pl-9',
    q: 'What counts toward learning totals?',
    a: 'Instructional events (for example lessons) count toward learning totals. Non-instructional events can still be tracked for planning/history but usually do not count toward targets. This keeps compliance-style totals focused on instructional learning time.',
  },
  {
    id: 'pl-10',
    q: 'Can multiple children share events?',
    a: 'Yes. A single event can include multiple children, while attendance and progress are still recorded per child. Shared events reduce duplicate setup while preserving learner-specific records.',
  },
  {
    id: 'pl-11',
    q: 'Does Learnadoodle integrate with my device calendars?',
    a: 'Yes. Connect supported external calendars from Family > Connected Accounts to keep schedules aligned. This helps families coordinate Learnadoodle planning with household calendars.',
  },
];
