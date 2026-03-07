# Learnadoodle app guide — for chatbot (vector store / RAG)

This document describes where to find and how to do everything in the app. Use it so the chatbot can direct users (e.g. “Go to the Subjects screen to see details on grades”) and answer “where do I…?” and “how do I…?” questions.

---

## Main navigation (sidebar)

The app has five main areas in the left sidebar:

- **Home** — Dashboard and today’s schedule
- **Planner** — Calendar, to-do lists, and attendance
- **Subjects** — Subjects, progress, and grades
- **Library** — Materials (books, links, PDFs)
- **Family** — Children, settings, and profile

**How to direct users:** “Open the **Planner** (or **Subjects**, **Library**, **Family**) from the left sidebar.”

---

## Home

**What it is:** The main dashboard. Shows a greeting, the date, today’s schedule, and quick actions.

**What you can do:**
- See **today’s schedule** (learning events and blocks).
- Use **View To-Dos** to jump to the Planner’s to-do list focused on today.
- **Add event** to create a new event (opens the same form as Planner).
- See notifications and digest in the right rail (when shown).

**Where to send users:**
- “Go to **Home** to see today’s schedule.”
- “On **Home**, use **View To-Dos** to open your to-do list for today.”

---

## Planner

**What it is:** The calendar and task hub. You can switch between Month, Board, To-do lists, and Attendance.

**How to get there:** Click **Planner** in the left sidebar. Optionally add `?view=month`, `?view=board`, `?view=tasks`, or `?view=attendance` to the URL to open a specific view.

### Planner — Month view

**What it is:** A month grid with events on each day. You can click a day to see or add events.

**What you can do:**
- See all events for the month.
- Click a day to see that day’s events and add new ones.
- Click **+ NEW** (or equivalent) to add an event; the form asks for event type, date, time, assignee (child), and optional subject.

**Where to send users:**
- “Go to **Planner** and use the **Month** view to see your calendar.”
- “In **Planner** → **Month**, click a day to add an event.”

### Planner — Board view

**What it is:** A board (e.g. week) showing events by day. Good for moving blocks around.

**What you can do:**
- See events in a board layout.
- Click events to open details; add events from the board.

**Where to send users:**
- “Open **Planner** and switch to the **Board** view to see your week.”

### Planner — To-do lists (Tasks view)

**What it is:** Lists of tasks/to-dos (e.g. by today, backlog, or other sections).

**What you can do:**
- See and manage to-do items.
- Add items, mark complete, move between sections.
- Use **View To-Dos** from Home to land here focused on today.

**Where to send users:**
- “Go to **Planner** and open the **To-do lists** (or **Tasks**) view.”
- “Use **Planner** → **To-do lists** to manage your tasks.”

### Planner — Attendance view

**What it is:** Attendance tracking by child and date. Calendar-style view and day-level marking.

**What you can do:**
- See which days each child had learning/attendance.
- Mark days or events as attended/absent.
- Use filters and date ranges; export for records.

**Where to send users:**
- “Go to **Planner**, then switch to the **Attendance** view to log or check attendance.”
- “Open **Planner** → **Attendance** to see attendance by child and day.”

**Navigation phrase for chatbot:** When the user asks for “attendance” or “attendance page”, navigate them to Planner with view=attendance (e.g. “Taking you to the Planner attendance view.”).

---

## Subjects

**What it is:** List of all subjects (e.g. Math, ELA) for the family or per child. From here you open a subject to see progress, grades, and details.

**What you can do:**
- See all subjects; filter by child or year.
- Click a subject to open **Subject detail** (progress, grades, lessons, assignments).
- Add a subject, add events for a subject, or open the subject in the Planner or Library.

**Where to send users:**
- “Go to **Subjects** in the sidebar to see all your subjects.”
- “Open **Subjects**, then click a subject to see its details and grades.”

### Subject detail page (inside Subjects)

**What it is:** One subject’s page: name, grade, students, progress, grades, lessons, and links to Planner/Library.

**What you can do:**
- See **progress** (e.g. percent complete) and **grades** for that subject.
- See recent lessons, assignments, and attendance for the subject.
- Use **View in Planner** to open the Planner filtered for that subject.
- Use **Edit subject** to change name, grade, or students.
- Add events, materials, or syllabus from this page (depending on UI).

**Where to send users:**
- “Go to the **Subjects** screen, then open the subject (e.g. Math) to see **details on grades** and progress.”
- “On **Subjects**, click the subject name to see grades and progress.”

---

## Library (Materials)

**What it is:** Central place for learning materials — books, links, PDFs, attachments — that can be linked to subjects or events.

**What you can do:**
- Browse and search materials.
- Add new materials (book, link, PDF, etc.) and attach them to subjects or events.
- Open materials from events or subject detail when linked.

**Where to send users:**
- “Go to **Library** in the sidebar to see and manage your materials.”
- “In **Library** you can add books, links, or PDFs and attach them to subjects or events.”

---

## Family

**What it is:** Family and profile area: children, settings, and sometimes printable portfolio or notes.

**What you can do:**
- See and manage **children** (add child, edit name/grade, etc.).
- Open a **child’s profile/dashboard** (overview, subjects, progress).
- Access **settings** (account, family, academics, integrations).
- Use **printable portfolio** or notes pages when available.

**Where to send users:**
- “Go to **Family** in the sidebar to add or edit a child.”
- “In **Family**, click a child to see their profile and progress.”

### Child profile / dashboard (inside Family)

**What it is:** A single child’s overview: their subjects, progress, and key stats.

**What you can do:**
- See that child’s subjects and progress.
- Navigate to their subjects, planner, or assignments from there.

**Where to send users:**
- “Open **Family**, then click the child’s name to see their dashboard and progress.”

---

## Adding and editing things

### Add an event (lesson, appointment, etc.)

**Where:** Planner (Month or Board) or Home (“Add event”). Same event form everywhere.

**Steps:** Use **+ NEW** (or “Add event”) → choose event type (Lesson, Project, Exam, Assignment, Activity, **Appointment**) → set date, time, assignee (child) → optionally subject, placement (calendar vs backlog) → **Add Event**.

**Chatbot:** “Add an event from **Planner** (Month or Board) or from **Home** with **Add event**. Choose the type (e.g. Appointment), date, time, and who it’s for.”

### Add a subject

**Where:** Subjects screen, or Family/settings flow depending on app.

**Steps:** On **Subjects**, use the add/subject button → enter name, grade, assign students → save.

**Chatbot:** “Go to **Subjects** and use the option to add a new subject; enter name, grade, and which child(ren) it’s for.”

### Add a child

**Where:** Family area.

**Steps:** Open **Family** → add child (e.g. “Add child” or “+” ) → enter name and details → save.

**Chatbot:** “Go to **Family** in the sidebar and add a new child from there.”

### Log or check attendance

**Where:** Planner → Attendance view.

**Steps:** Open **Planner** → switch to **Attendance** → select child and date → mark attended/absent or adjust event-level attendance.

**Chatbot:** “Go to **Planner**, then open the **Attendance** view to log or check attendance.”

### See grades

**Where:** Subjects → open a subject → subject detail page (grades section).

**Chatbot:** “Go to the **Subjects** screen, open the subject (e.g. Math), and you’ll see **grades** and progress there.”

### See progress (percent complete, etc.)

**Where:** Subjects → subject detail page; or child dashboard under Family.

**Chatbot:** “For subject progress, go to **Subjects** and click the subject. For a child’s overall progress, go to **Family** and open that child’s profile.”

---

## Quick reference: “Where do I…?”

| User goal              | Where to go                          |
|------------------------|--------------------------------------|
| See today’s schedule   | Home                                 |
| Add an event/appointment | Planner (Month/Board) or Home, + NEW / Add event |
| See or manage to-dos   | Planner → To-do lists (Tasks view)   |
| Log or view attendance | Planner → Attendance view            |
| See subjects list      | Subjects                             |
| See grades for a subject | Subjects → click subject → subject detail |
| See progress for a subject | Subjects → click subject → subject detail |
| Add or manage materials | Library                              |
| Add or edit a child    | Family                               |
| Add a subject          | Subjects → add subject               |
| Open settings          | Family (or profile/settings entry)   |
| View in Planner (from subject) | Subject detail → “View in Planner” |

---

## Navigation phrases the chatbot can use

Use these when directing users so they match how the app is structured:

- “Go to **Home** to see today’s schedule.”
- “Open **Planner** from the left sidebar, then switch to **Attendance** to log attendance.”
- “Go to the **Subjects** screen to see all subjects; click a subject to see **details on grades** and progress.”
- “In **Planner**, use the **Month** view to see your calendar, or **To-do lists** to manage tasks.”
- “Go to **Family** to add or edit a child.”
- “Use **Library** to add or manage materials (books, links, PDFs).”
- “From **Home**, use **View To-Dos** to open the Planner to-do list for today.”

---

## Document purpose

This guide is intended for embedding in a vector store (or RAG) so the chatbot can:

1. Answer “where do I…?” and “how do I…?” with the correct screen and steps.
2. Direct users with clear phrases (e.g. “Go to Subjects screen to see details on grades”).
3. Support new users as a tutorial for where to find and how to do everything in the app.

Keep sections and headings consistent so chunking and retrieval work well.
