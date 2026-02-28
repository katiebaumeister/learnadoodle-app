# Unified Curriculum & Planning — Build & Implementation Plan

This plan turns the architecture and UI language specs into shipped behavior. **No new tables.** Order of work is chosen so copy and “slot vs lesson” language land first, then backend/UX links.

---

## Goal & scope

- **Goal:** One coherent system: Plan My Year = slots (capacity), Build Curriculum = units + lessons (content), Magic Extract = draft → attach to curriculum. Users see consistent terms (instructional slot, scheduled lesson, draft lesson) and clear entry points (Course Structure, Planner toolbar, Library).
- **Scope:** Copy/labels, Plan My Year modal redesign, Fill Slot, curriculum commit “prefer slots,” Course Structure section, Library → curriculum (no event-only “Create lesson”). Schema unchanged.

---

## What’s already done

| Item | Location | Notes |
|------|----------|--------|
| Architecture spec | `docs/UNIFIED_CURRICULUM_ARCHITECTURE_SPEC.md` | Primitives, contracts, modal ownership, predicates |
| UI language spec | `docs/UNIFIED_CURRICULUM_UI_LANGUAGE_SPEC.md` | Microcopy, slot/lesson/unit terms |
| Plan My Year heading/layout spec | `docs/PLAN_MY_YEAR_MODAL_HEADING_REDESIGN.md` | Header, section order, preview card, confirmation, toasts |
| Copy constants (JSON) | `lib/constants/curriculumPlanningCopy.json` | All strings for Plan My Year, Build Curriculum, Extract, Course, calendar, backlog |
| Typed strings (TS) | `lib/i18n/strings.ts` | `STRINGS`, `t()`, `s()`, `hasStringKey()`, dot-path types |
| Overwrite lock (backend) | `backend/services/block_regenerator.py` | Placeholder query includes `curriculum_lesson_id IS NULL`; filled slots never touched |

---

## Phase 1 — Copy & Plan My Year modal (language + layout)

**Goal:** Plan My Year uses the new language everywhere and matches the heading/layout spec. Rest of app can still use hardcoded strings until later.

### 1.1 Wire Plan My Year to typed strings

- **Files:** `components/planner/PlanYearModal.js` (or equivalent).
- **Tasks:**
  - Import from `lib/i18n/strings.ts` (or, if app is JS-only, from `lib/constants/curriculumPlanningCopy.json` and use a small `t(str, params)` helper).
  - Replace modal title: “Plan My Year” → `STRINGS.planMyYear.modal.title` or `t('planMyYear.modal.title')`.
  - Replace subtitle and helper with `planMyYear.modal.subtitle`, `planMyYear.modal.helper`.
  - Replace primary button label: “Generate instructional slots” / “Update instructional slots” from `planMyYear.primaryActions.generateSlots` / `updateSlots`.
  - Replace section titles and subtitles from `planMyYear.sections.*` (who, subjects, blocks, dates, targets, breaks, preview).
  - Replace preview card: heading, subtext, metric labels (“Estimated slots”, “Estimated instructional days”, “Estimated instructional hours”), “Update preview”, “Recalculate” from `planMyYear.sections.preview.*`.
  - Replace confirmation modal: title, body, Confirm “Update empty slots”, Cancel from `planMyYear.confirmations.replaceEmptySlots.*`.
  - Replace success toasts with `planMyYear.toasts.generatedWithCounts` / `updatedWithCounts` / `skippedFilled`; interpolate `{count}`, `{updated}`, `{inserted}`, `{deleted}`.
- **Acceptance:** All Plan My Year copy in the modal comes from constants/strings; no “lesson” for slots; “Generate instructional slots” and “Update instructional slots” are the only primary CTA labels.

### 1.2 Plan My Year layout and section order

- **Files:** `components/planner/PlanYearModal.js`.
- **Tasks:**
  - Add helper line under subtitle (smaller, muted): “This creates instructional slots on the calendar. Fill slots with lessons later.”
  - Reorder sections to: (1) Dates, (2) Weekly blocks, (3) Breaks & holidays, (4) Targets (optional), (5) Preview.
  - Style preview as a read-only panel (heading “Preview”, subtext, metrics, “Update preview” secondary, “Recalculate” only when constraint solver is active).
- **Reference:** `docs/PLAN_MY_YEAR_MODAL_HEADING_REDESIGN.md`.
- **Acceptance:** Section order and preview card match spec; header block has title + subtitle + helper.

### 1.3 Planner toolbar and any Plan My Year entry points

- **Files:** Where “Plan My Year” button and success messages live (e.g. `WebLayout.js`, planner header).
- **Tasks:**
  - Ensure button label is “Plan My Year” (can use `STRINGS.planMyYear.modal.title` or same constant).
  - After Apply, show toast from `planMyYear.toasts.generatedWithCounts` or `updatedWithCounts` with real counts; optionally “Scheduled lessons were kept unchanged” when applicable.
- **Acceptance:** No “lessons generated”; only “instructional slots generated” / “updated.”

---

## Phase 2 — Fill Slot (empty slot → curriculum lesson)

**Goal:** From an empty Plan My Year slot on the calendar, user can “Fill slot” and attach a curriculum lesson; backend sets `curriculum_lesson_id` (and optionally `source`, `title`). Filled slots are already protected from Apply by the overwrite lock.

### 2.1 Backend: PATCH event to fill slot

- **Files:** New or existing event PATCH endpoint (e.g. in `backend/routers/` for events/planner).
- **Tasks:**
  - Accept payload that can set `curriculum_lesson_id`, `source`, `title` for an existing event.
  - Validate: event exists, belongs to family, and is an empty slot (`is_placeholder = true`, `generated_by = 'plan_year'`, `curriculum_lesson_id IS NULL`) or allow updating any event’s `curriculum_lesson_id` for “Fill slot” and “Change lesson.”
  - If filling: set `curriculum_lesson_id`, `source = 'curriculum'`, optionally `title` from lesson; leave `start_ts`/`end_ts`/`child_id`/`subject_id` from slot.
  - Return updated event.
- **Reference:** Architecture spec §2.3 Fill Slot operation.
- **Acceptance:** PATCH fills a slot; next Apply does not overwrite that event (already guaranteed by block_regenerator).

### 2.2 UI: “Fill slot” on empty slot event

- **Files:** Event details drawer/modal or week view context menu (e.g. `EventDetails.js`, planner week components).
- **Tasks:**
  - For events that are empty slots (`is_placeholder && generated_by === 'plan_year' && !curriculum_lesson_id`), show primary action **“Fill slot”** (from `STRINGS.calendarSlotActions.emptySlot.primary` or `courseStructure` / `calendarSlotActions` in JSON).
  - “Fill slot” opens a picker: choose curriculum lesson (from curriculum_lessons for this family/subject) or “Create one-off event” (existing flow).
  - On choose lesson: call PATCH with `curriculum_lesson_id`, `source: 'curriculum'`, `title` from lesson.
  - Tooltip/label for empty slot: use `calendarSlotActions.emptySlot.tooltip` / `planMyYear.calendar.slotTooltipEmpty`.
- **Acceptance:** Empty slots show “Fill slot”; user can pick a lesson and slot becomes a scheduled lesson; calendar shows “Scheduled lesson” for filled slot (see Phase 1 or 5 for badge/label).

### 2.3 Filled slot label and “Change lesson”

- **Files:** Same event UI as 2.2.
- **Tasks:**
  - For events with `curriculum_lesson_id` set, show label “Scheduled lesson” and optional “From Unit: X” (resolve unit from lesson).
  - Secondary action “Change lesson” (or “View lesson”): open lesson/event details or pick a different curriculum lesson and PATCH.
  - Tooltip: `calendarSlotActions.filledSlot.tooltip`.
- **Acceptance:** Filled slots are clearly “Scheduled lesson” and not called “slot”; user can change which lesson is in the slot.

---

## Phase 3 — Curriculum commit: prefer Plan My Year slots

**Goal:** When committing a unit from Build Curriculum, if “Use available instructional slots” is on, fill empty Plan My Year slots first (matching child + subject + date range), then create new events for remaining lessons.

### 3.1 Backend: candidate slots query + slot-fill pass

- **Files:** `backend/routers/curriculum_routes.py` (commit flow).
- **Tasks:**
  - Add to commit input: `prefer_placeholder_slots: bool` (default true when client sends it).
  - If `prefer_placeholder_slots`: run candidate-slots query (see architecture spec §2.4): `family_id`, `generated_by = 'plan_year'`, `is_placeholder = true`, `curriculum_lesson_id IS NULL`, `academic_year_id`, `deleted_at IS NULL`, `start_ts` in range, `child_id = ANY(:student_ids)`, `subject_id = :resolved_subject_id`, ORDER BY `start_ts ASC`.
  - Resolve `resolved_subject_id` from unit’s `subject_tags` (1:1 subject) or from user selection if provided in payload.
  - Slot-fill pass: for each lesson in sequence, take next slot from the list; UPDATE that event: `curriculum_lesson_id = lesson.id`, `source = 'curriculum'`, `title = lesson.title`; keep `start_ts`/`end_ts`/`child_id`/`subject_id`.
  - Fallback pass: for lessons that did not get a slot, use existing `load_planning_context` availability logic and INSERT new events with `source = 'curriculum'`, `curriculum_lesson_id`.
- **Reference:** Architecture spec §2.4, exact predicate in doc.
- **Acceptance:** With “Use available instructional slots” on, commit places lessons into empty slots first; remaining lessons get new events; no double-booking.

### 3.2 Build Curriculum UI: toggle and success copy

- **Files:** `components/planner/modals/BuildCurriculumModal.js`.
- **Tasks:**
  - Add placement toggle: “Use available instructional slots” with helper “Fill lessons into your Plan My Year schedule when possible” (from `buildCurriculum.placement.useSlots`).
  - Default toggle to true when the selected date range has any empty slots (optional enhancement) or always true.
  - On success, if slots were used: show notice from `buildCurriculum.notices.usedSlots` / `usedSlotsAndFallback` with `{used}`, `{fallback}`; if no slots: `noSlotsFound`.
  - Use `buildCurriculum.actions.createUnitAndSchedule` / `createUnitAndBacklog` for commit button labels.
- **Acceptance:** User can turn “prefer slots” on/off; success message reflects “Placed X lessons into instructional slots” when applicable.

---

## Phase 4 — Course / Subject “Structure” hub

**Goal:** Course or Subject edit view has a “Course structure” section with three actions: Generate curriculum, Import & extract, Add unit manually. No “Create lesson” that only creates an event.

### 4.1 Add Structure section to Course/Subject edit

- **Files:** Subject edit modal or Course/Subject detail page (e.g. `AddSubjectModal.js`, `SubjectDetailModal.js`, or subject/course overview component).
- **Tasks:**
  - Add section header “Course structure” and subtext “Define what is taught in this course and how it progresses.” (from `courseStructure.section`).
  - Add three actions (buttons or links):
    - **Generate curriculum** — opens BuildCurriculumModal with this subject preselected (and optional children, date range); show “Use available instructional slots” toggle.
    - **Import & extract** — opens Magic Extract (or syllabus/PDF import) with “Attach to this course” flow; after preview, user chooses unit or “Add to backlog.”
    - **Add unit manually** — create curriculum_units + curriculum_lessons (manual entry); then “Schedule” uses same commit logic (slot-fill + fallback).
  - Empty state when no units: “No units yet. Start by generating curriculum, importing a syllabus, or adding your first unit.” (`courseStructure.empty`).
- **Reference:** Architecture spec §4.1, UI language spec §3.
- **Acceptance:** From Course/Subject edit, user can generate curriculum, import/extract, or add a unit manually; no standalone “Create lesson” that only creates an event.

### 4.2 Generate Curriculum pre-scoped to subject

- **Files:** BuildCurriculumModal (and caller that opens it from Course Structure).
- **Tasks:**
  - When opened from Course Structure, pass `subjectId` (and optionally `subjectName`); preselect that subject in the modal and, if possible, set `subject_tags` on the new unit so `resolved_subject_id` is correct for slot-fill.
  - Use “Create unit & schedule lessons” / “Create unit & add to backlog” from strings.
- **Acceptance:** Generating from Course Structure creates a unit tied to that course and schedules into slots when available.

---

## Phase 5 — Library & Magic Extract → curriculum only

**Goal:** Library material right-click and Magic Extract never offer “Create lesson” or “Add to calendar” as the primary path; primary action is “Attach to course” / “Build curriculum from this,” routing through curriculum commit.

### 5.1 Library right-click: Build curriculum from this

- **Files:** `components/materials/MaterialsLibrary.js` (context menu / right-click).
- **Tasks:**
  - Ensure “Build curriculum from this” (or equivalent) opens BuildCurriculumModal with mode **From Material** and the selected material pre-selected.
  - Optionally keep “Extract lessons/assignments” as secondary; its primary action must be “Attach to course” (see 5.2).
- **Acceptance:** Right-click on material leads to Build Curriculum (material preselected) or Extract → Attach.

### 5.2 Magic Extract: primary action “Attach to course”

- **Files:** Magic Extract modal/flow (e.g. `MagicExtract.js` or wherever extract UI lives); Library’s `handleMagicExtract` currently a stub.
- **Tasks:**
  - After extraction, show section “Draft lessons” (and “Draft assignments” if applicable); use `magicExtract.sections.draftLessons` / `draftAssignments`.
  - Primary action: **“Attach to course”** (from `magicExtract.actions.attachToCourse`). On click: choose subject/course, then choose “Add to existing unit” / “Create new unit” / “Add to backlog only”; then call curriculum commit path (create/update curriculum_units/lessons and optionally schedule or backlog).
  - Remove or demote any “Create lesson” / “Add to calendar” that creates only an event and bypasses curriculum tables.
  - Modal title/subtitle from `magicExtract.modal.title` / `subtitle` / `helper`.
- **Reference:** Architecture spec §3.C, §4.3; UI language spec §4.
- **Acceptance:** Extract flow ends in “Attach to course” → unit/backlog; no one-off event creation as primary.

### 5.3 Optional: calendar badges for slot vs scheduled lesson

- **Files:** Planner/week view and event detail components that render event type or badge.
- **Tasks:**
  - For empty slot: show small badge/label “Instructional slot” (e.g. `planMyYear.calendar.slotBadge` or `calendarSlotActions.emptySlot.title`).
  - For filled slot: “Scheduled lesson” (`planMyYear.calendar.filledBadge` or `calendarSlotActions.filledSlot.title`).
  - Optional: backlog and manual-event badges per UI language spec §10.
- **Acceptance:** Calendar clearly distinguishes empty slot vs scheduled lesson by label/badge.

---

## Phase summary and order

| Phase | What | Deps |
|-------|------|-----|
| **1** | Copy + Plan My Year modal (language, layout, section order, toasts) | None |
| **2** | Fill Slot (backend PATCH + UI “Fill slot” on empty slot) | 1 (copy) |
| **3** | Curriculum commit “prefer slots” (backend + Build Curriculum toggle/copy) | None |
| **4** | Course Structure section (Generate / Import / Add unit; BuildCurriculumModal pre-scoped) | 1, 3 |
| **5** | Library + Magic Extract → “Attach to course” only; optional calendar badges | 1 |

Recommended order: **1 → 2 → 3 → 4 → 5**. (1 and 3 can be parallel; 2 and 4 depend on 1.)

---

## Files to touch (checklist)

- **Specs (reference only):** `docs/UNIFIED_CURRICULUM_ARCHITECTURE_SPEC.md`, `docs/UNIFIED_CURRICULUM_UI_LANGUAGE_SPEC.md`, `docs/PLAN_MY_YEAR_MODAL_HEADING_REDESIGN.md`
- **Copy:** `lib/constants/curriculumPlanningCopy.json`, `lib/i18n/strings.ts`
- **Plan My Year:** `components/planner/PlanYearModal.js`; planner header/WebLayout for button and toasts
- **Fill Slot:** Event PATCH endpoint; `EventDetails.js` or week-view event UI
- **Curriculum commit:** `backend/routers/curriculum_routes.py`; `components/planner/modals/BuildCurriculumModal.js`
- **Course hub:** Subject/Course edit modal or detail (e.g. `AddSubjectModal.js`, `SubjectDetailModal.js`, or course overview)
- **Library + Extract:** `components/materials/MaterialsLibrary.js`; Magic Extract modal component(s)

---

## Done criteria (overall)

- Plan My Year never says “lessons” for slots; only “instructional slots”; Apply button and toasts use new copy.
- Empty slots offer “Fill slot”; filled slots show “Scheduled lesson” and are not overwritten by Apply.
- Build Curriculum can “Use available instructional slots” and commit fills slots first, then creates new events.
- Course/Subject edit has “Course structure” with Generate curriculum, Import & extract, Add unit manually.
- Library and Magic Extract route into curriculum (Build curriculum from this / Attach to course); no primary “Create lesson” that bypasses curriculum.

No schema changes; all behavior and copy align with the architecture and UI language specs.
