/**
 * Canonical Learnadoodle product guide for Doodle (Ask AI). Used for offline chunk search
 * and can be seeded into Supabase chatbot_knowledge via seedFromGuideMarkdown().
 */

export const APP_GUIDE_MARKDOWN = `## App overview
Learnadoodle is a homeschool planning app: calendar and plans, subjects and materials, family accounts, and optional AI helpers. The main areas are Home, Planner, Subjects, Library (materials), and Family. A floating Ask AI (Doodle) button opens quick chat for how-to questions and light actions.

## Who sees what (roles)
Parents see the full app: all children, Family settings, invites, billing-related UI where shown, and planning tools. Children/students see a simplified experience focused on their own work: Home, calendar, subjects, assignments, and help—without full family admin. Tutors see a lean workspace: Home, My students, Planner, and Library—not full family billing or invites.

## Main navigation (left sidebar)
Use the left rail to switch areas: Home (today and dashboard), Planner (calendar and scheduling), Subjects (learning hub / intelligence), Library (materials and resources), and Family (account, members, courses, preferences, help, feedback). The + New menu (near the top) opens shortcuts to create events, tasks, and other items depending on context.

## Home
Home highlights what is happening today: scheduled items, prompts, and quick entry points. You can switch the active child when your family has multiple learners so Home reflects the right student. Use Home for a daily snapshot before diving into Planner or Subjects.

## Planner: calendar and views
The Planner is your family calendar. Switch month or week views, filter by child or event type, and open individual events to edit or mark attendance. The URL may include view parameters (for example attendance view). Use the right-hand planner toolbar for actions like backlog, rebalance, attendance, export, filters, and planner-related settings—exact tools depend on your account and feature flags.

## How to add a plan for the year (school year cadence)
To **add a plan** or **create a recurring plan** for **this year** or the **school year**: open **Planner** from the left sidebar. On the **right-hand planner toolbar** (vertical icons along the right edge of the planner), click **Build plan**—look for the **calendar-with-plus** icon; hover shows **Build plan**. That flow walks you through choosing **students**, **subjects**, and a **cadence** (how often lessons meet, which **days** of the week, and **times**) so events can be placed on the calendar for the year. If you do not see **Build plan**, check **Subjects** (Intelligence hub) for **Plan the year** or open **Family → Courses** to ensure subjects exist first.

## Plans vs events vs attendance
Plans define recurring structure (for example how often a subject meets). Events are dated instances on the calendar. Edit a single event when only one day should change; edit the underlying plan when the ongoing pattern should change for the future. Attendance records what actually happened and feeds reports; it does not rewrite your plan by itself.

## Planner: backlog
Backlog holds unscheduled work—lessons or tasks not yet placed on the calendar. You can drag or schedule items from backlog onto days when you are ready.

## Planner: rebalance and AI scheduling helpers
Rebalance and related tools suggest or apply schedule adjustments. Pack Week and Catch-up style flows live in the planning/AI surfaces (often from the planner toolbar or Intelligence)—they help fit work into the week when enabled for your account.

## Attendance
Open attendance from the planner context (including attendance view) to mark instructional time per child and per event. Only instructional-style events typically count toward learning totals; appointments and similar event types may be tracked but treated differently for totals. Multiple children can share one event; attendance can still be recorded per child.

## External calendars
You can connect external calendars so outside schedules stay in sync with Learnadoodle where integrations are available. Look in Family for connected accounts or planner-related settings depending on your build.

## Subjects and Intelligence hub
The Subjects area (sometimes routed as Intelligence or /intelligence on the web) is where you manage subjects, see progress-style summaries, and open curriculum tools such as Plan the Year, curriculum generation, or parsing uploaded syllabi—depending on what your family has enabled. Open a subject to see details, pacing, and linked materials.

## Library (materials)
Library holds materials and resources—books, links, files, and similar items. You can tie materials to subjects and use them while planning or assigning work. Navigation from subjects into Library is supported in several flows when a subject or resource is linked.

## Family: where it is
Family is the left sidebar item labeled Family (profile-shaped). It opens the Family panel with sections along the side: Profile, Family Members, User controls (when available), Courses, Planning Preferences, Help, Feedback, and legal links (About, Terms, Privacy) depending on role.

## Family: Profile and account
Profile holds your name, contact info, notification toggles, sensory/display preferences, connected providers (Google and others where integrated), subscription or upgrade messaging when shown, and account safety options such as sign out or account deletion in the danger zone where applicable.

## Family: Family Members and invites
Family Members lists parents, children, and invited roles. You can invite children or tutors, manage invite links, and adjust who can see or edit what when your family uses granular controls.

## Family: Courses (subjects list)
The Courses section lists subjects for your family with editing and organization. This is a primary place to rename subjects, review notes, and jump into deeper subject tooling.

## Family: Planning Preferences
Planning Preferences surfaces planner defaults and schedule-related settings that apply across the planner (for example plan defaults or teaching-time preferences, depending on your version).

## Family: Help and Planner FAQ
Help includes Learnadoodle’s planner FAQ: how plans relate to events, editing rules, backlog, attendance behavior, shared events, and external calendars. Use this when you want official short answers inside the product.

## Family: Feedback
Feedback is a form inside Family to send product feedback and requests. If Doodle or support docs do not cover your question, use Family → Feedback so the team can prioritize it.

## Assignments and Review
Assignments flows let students submit work and let parents review, approve, or comment—depending on role. Parents may see a Review area for incoming submissions; students see assignments under their Assignments experience. Exact labels vary slightly by role and layout.

## Ask AI (Doodle) chat
The floating Ask AI button opens Doodle chat. You can ask where features live, how planner concepts work, and quick scheduling questions. Doodle can also trigger simple navigations or actions when supported (for example opening Planner attendance). It is not a replacement for legal or compliance advice.

## Children: child dashboard
When viewing a specific child from family navigation, you may see a child dashboard with that learner’s affirmations and focused content—scoped to that child.

## Tutor experience
Tutors work with assigned students only. Sidebar items are limited to Home, My students, Planner, and Library so tutors can coach without accessing unrelated family billing or full admin settings.

## What may not exist yet
Some marketing or roadmap ideas may not be released. If you cannot find a feature, use Family → Feedback to describe what you need; that helps the team prioritize.

## Troubleshooting: finding grades or progress
Subject-level progress appears in Subjects when progress data exists for that learner. Planner attendance and instructional marks feed reporting views where enabled. If you do not see numbers yet, add a few scheduled instructional events and mark attendance so totals can accumulate.

## Troubleshooting: schedule looks wrong
Check whether you edited a single event vs the recurring plan, whether blackouts or holidays block time, and whether filters hide some children or event types. Rebalance tools can suggest shifts but review results before accepting.

## Privacy and data
Use Family → Profile and related sections for connected accounts and data export or deletion options where the product exposes them. Children and tutors inherit restricted visibility by design.
`;
