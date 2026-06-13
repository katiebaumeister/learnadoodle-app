/**
 * Single source of truth for Planner & Calendar FAQs (Help popover + Family → Help & FAQ).
 */
export const PLANNER_FAQ = [
  {
    id: 'pl-1',
    q: 'How does the planner work?',
    a: 'Use Planner as your daily execution calendar: create, edit, move, and complete events there. Use Subjects > Schedule when you need to change recurring lesson cadence for a subject. Use Settings > School Year Settings when you need family-wide defaults (total class days, date ranges, breaks/exclusions, and targets). In short: Planner handles daily action, Schedule handles recurring structure, and School Year Settings handles global rules.',
  },
  {
    id: 'pl-2',
    q: 'When should I edit the schedule vs an event?',
    a: 'Edit a single event when only one date needs a change (time, date, assignees, or type). Edit Subjects > Schedule when the pattern should change for future lessons. A helpful rule: if this is a temporary exception, edit the event in Planner; if this is your new normal, update Schedule.',
  },
  {
    id: 'pl-3',
    q: 'What if schedules change?',
    a: 'For immediate adjustments, open Planner and reschedule, skip, or edit the affected event. If the same change is likely to continue, open Subjects > Schedule and update the recurring cadence so future events stay aligned. Historical records, attendance, and completed items stay intact.',
  },
  {
    id: 'pl-4',
    q: 'How does attendance work?',
    a: 'Attendance is tracked per child, per event. To record it: open Planner, open the event (or day view), then mark each learner\'s attendance status. You can later review attendance trends in records and learner progress views; these updates affect reporting totals without changing recurring schedule setup.',
  },
  {
    id: 'pl-5',
    q: 'How do I edit an event?',
    a: 'In Planner, select the event and choose Edit Event. Update the date, time, event type, assigned learners, or notes, then save. This edit applies only to that event instance; if you intended to change future recurring lessons, use Subjects > Schedule instead.',
  },
  {
    id: 'pl-6',
    q: 'How do I manage Schedule and School Year Settings?',
    a: 'Use this step-by-step path when settings feel buried: (1) open the Subjects tab, (2) choose a subject, and (3) open Schedule to set that subject\'s recurring cadence and metrics. For family-wide rules, open Settings > School Year Settings and set total class days, year boundaries, exclusions/breaks, and targets. Subject Schedule controls one subject; School Year Settings controls household defaults.',
  },
  {
    id: 'pl-7',
    q: 'How do I add a one-off event from a subject?',
    a: 'Go to the Subjects tab, open the subject, then open Schedule. In the Actions area, choose Add event; the event composer opens with that subject preselected. Use this for exceptions, special sessions, or ad-hoc lessons without changing your recurring cadence.',
  },
  {
    id: 'pl-9',
    q: 'What counts toward learning totals?',
    a: 'Instructional events (for example lessons) count toward learning totals. Non-instructional events can still be tracked for planning history, but they typically do not count toward targets. This keeps totals focused on instructional learning time for reporting and compliance workflows.',
  },
  {
    id: 'pl-10',
    q: 'Can multiple children share events?',
    a: 'Yes. One event can include multiple children, and attendance/progress are still stored per learner. Shared events reduce duplicate setup time while preserving child-specific records.',
  },
  {
    id: 'pl-11',
    q: 'Does Learnadoodle integrate with my device calendars?',
    a: 'Yes. To connect calendars, open Settings > Connected accounts and link a supported external calendar. Once connected, your household can coordinate Learnadoodle events alongside other family commitments.',
  },
];
