/**
 * Canonical Learnadoodle product guide for Doodle (Ask AI). Used for offline chunk search
 * and can be seeded into Supabase chatbot_knowledge via seedFromGuideMarkdown().
 */

export const APP_GUIDE_MARKDOWN = `## App overview
Learnadoodle is a homeschool planning app for day-to-day scheduling, subjects, materials, attendance, and progress. The main areas are Home, Planner, Learning, Materials, and Settings. A floating Ask AI (Doodle) button opens quick chat for how-to questions and lightweight actions.

## Who sees what (roles)
Parents see the full app: all children, Settings areas, invites, and planning tools. Children/students see a simplified experience focused on their own work: Home, calendar, subjects, assignments, and help. Tutors see a lean workspace focused on assigned learners and planning tasks.

## Main navigation (left sidebar)
Use the left rail to switch areas: Home (today snapshot), Planner (calendar and event editing), Learning (subjects, progress, schedule), Materials (resources library), and Settings (account/member/preferences/help tools). The + New menu opens shortcuts to create events and related items depending on context.

## Home
Home highlights what is happening today: scheduled items, prompts, and quick entry points. You can switch the active child when your family has multiple learners so Home reflects the right student.

## Planner: calendar and views
Planner is your household calendar. Switch month/week/day views, filter by child or event type, and open individual events to edit, reschedule, or mark attendance.

## Learning area and tabs
Open **Learning** in the left sidebar, then use these tabs:
- **Subjects**: your subject list and subject detail entry point
- **Progress**: attendance/progress summaries
- **Schedule**: recurring cadence, target, and schedule controls

## Events vs schedule vs attendance
Events are dated calendar items in Planner. Schedule controls recurring subject cadence in Learning > Schedule. Edit a single event when only one day should change; edit Schedule when the ongoing pattern should change for the future. Attendance records what actually happened and feeds progress/reporting totals.

## Planner: backlog
Backlog holds unscheduled work—lessons or tasks not yet placed on the calendar. You can drag or schedule items from backlog onto days when you are ready.

## Planner: rebalance and AI scheduling helpers
Rebalance and related tools suggest or apply schedule adjustments. Catch-up style flows live in planning/AI surfaces and help fit work into the week when enabled for your account.

## Attendance
Open attendance from Planner (including attendance view) to mark instructional time per child and per event. Only instructional-style events typically count toward learning totals. Multiple children can share one event; attendance is still recorded per child.

## External calendars
You can connect external calendars so outside schedules stay in sync with Learnadoodle where integrations are available. Look in Settings > Connected accounts.

## Subjects workflow
Use Learning > Subjects to open a subject, then move between subject-focused details and schedule/progress views as needed.

## Materials area
Materials holds resources such as books, links, files, and similar items. You can tie materials to subjects and use them while planning or assigning work.

## Settings: where it is
Settings is the left sidebar area for account-level tools and configuration.

## Settings: Profile and account
Profile holds your account identity and related account options.

## Settings: Family Members and invites
Family Members lists parents, children, and invited roles. You can invite children or tutors, manage invite links, and adjust permissions.

## Settings: Subjects
Settings can include a Subjects section for subject-level management shortcuts.

## Settings: Planning Preferences
Planning Preferences controls household defaults used by schedule and planner workflows, including date boundaries, weekday defaults, exclusions, attendance tracking style, and target defaults.

## Settings: Help and FAQ
Help includes Learnadoodle FAQs for workflow guidance and definitions. Use this when you want official in-product answers.

## Settings: Feedback
Feedback is a form inside Settings to send product feedback and requests. If Doodle or support docs do not cover your question, use Settings > Feedback.

## Assignments and Review
Assignments flows let students submit work and let parents review, approve, or comment—depending on role. Parents may see a Review area for incoming submissions; students see assignments under their Assignments experience. Exact labels vary slightly by role and layout.

## Ask AI (Doodle) chat
The floating Ask AI button opens Doodle chat. You can ask where features live, how workflows work, and quick scheduling questions. Doodle can trigger simple navigations or actions when supported (for example opening Planner attendance).

## Children: child dashboard
When viewing a specific child from family navigation, you may see a child dashboard with that learner’s affirmations and focused content—scoped to that child.

## Tutor experience
Tutors work with assigned students only and have limited navigation compared with parent accounts.

## What may not exist yet
Some roadmap ideas may not be released yet. If you cannot find a feature, use Settings > Feedback to describe what you need.

## Troubleshooting: finding grades or progress
Subject-level progress appears in Learning > Subjects when progress data exists for that learner. Planner attendance and instructional marks feed reporting views where enabled. If you do not see numbers yet, add a few scheduled instructional events and mark attendance so totals can accumulate.

## Troubleshooting: schedule looks wrong
Check whether you edited a single event vs recurring schedule settings, whether blackouts or holidays block time, and whether filters hide some children or event types.

## Privacy and data
Use Settings > Profile and related sections for connected accounts and data options where exposed by your build. Children and tutors inherit restricted visibility by design.
`;
