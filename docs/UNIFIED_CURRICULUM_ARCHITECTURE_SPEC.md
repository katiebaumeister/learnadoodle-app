# Unified Curriculum & Planning — Architecture Spec (Exact Schema + Contracts)

Single-page spec: **exact** shared primitives (tables + fields + enums/constraints), behavioral contract between Plan My Year and Curriculum, precise query predicates for apply/replace and slot selection, and UI entry points. **No new tables.**

---

## 1. Shared Primitives (Exact Tables + Fields)

### A) `events` — single shared surface for slots, scheduled lessons, instructional accounting

**Fields used (must exist as named):**

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid | PK |
| `family_id` | uuid | |
| `child_id` | uuid | nullable for some event types (e.g. whole-family) |
| `child_ids` | uuid[] | optional; whole-family events |
| `subject_id` | uuid | nullable for some event types |
| `title` | text | |
| `start_ts` | timestamptz | |
| `end_ts` | timestamptz | |
| `status` | text | No CHECK in migrations; app uses e.g. `scheduled`, `done`, `canceled`, `in_progress` |
| `event_type` | text | NOT NULL; see enum below |
| `is_placeholder` | boolean | default false |
| `generated_by` | text | e.g. `'plan_year'` |
| `academic_year_id` | uuid | FK academic_years(id) ON DELETE SET NULL |
| `source_block_id` | uuid | block that produced this event |
| `generation_batch_id` | uuid | |
| `curriculum_lesson_id` | uuid | FK curriculum_lessons(id) ON DELETE SET NULL — **overwrite lock when set** |
| `counts_toward_plan` | boolean | |
| `instructional_status` | text | see enum below |
| `source` | text | see enum below |
| `deleted_at` | timestamptz | nullable; soft delete |

**Exact constraints (from migrations):**

- **event_type** (latest after `2025_rename_exam_to_assessment.sql`):
  ```text
  CHECK (event_type IN (
    'Lesson', 'Activity', 'Assignment', 'Sport', 'Appointment',
    'Extracurricular', 'Trip', 'Holiday', 'Project', 'Assessment', 'Homework', 'Other'
  ))
  ```
- **instructional_status** (`20260228_instructional_status_and_progress_cache.sql`):
  ```text
  CHECK (instructional_status IS NULL OR instructional_status IN (
    'NONE', 'MANUAL_COUNTS', 'PLAN_PLACEHOLDER', 'PLAN_LOCKED', 'EXCLUDED'
  ))
  ```
- **source** (`20260220_events_source_system.sql`):
  ```text
  CHECK (source IN ('ai', 'manual', 'year_plan_seed', 'curriculum', 'system'))
  ```
- **Instructional invariant** (`20260228`, `20260235`): when `counts_toward_plan = true`, `academic_year_id` may be NULL (e.g. instructional time without a specific plan).

**Canonical meanings:**

- **Slot (Plan My Year placeholder):** `is_placeholder = true`, `generated_by = 'plan_year'`, `academic_year_id IS NOT NULL`, `source_block_id IS NOT NULL`, **`curriculum_lesson_id IS NULL`**, typically `counts_toward_plan = true`, `instructional_status = 'PLAN_PLACEHOLDER'`.
- **Filled slot:** same row after **`curriculum_lesson_id`** is set; never overwritten by Apply.
- **Curriculum-scheduled event:** `source = 'curriculum'`, `curriculum_lesson_id IS NOT NULL` (may or may not have been a slot).

---

### B) Curriculum — canonical lesson structure

**curriculum_units** (from `2025_curriculum_tables.sql`):

| Column | Type | Constraint / notes |
|--------|------|--------------------|
| id | uuid | PK |
| family_id | uuid | NOT NULL, FK family(id) |
| created_by_uid | text | NOT NULL |
| title | text | NOT NULL |
| source_type | text | NOT NULL, CHECK IN ('topic','syllabus','pdf','link','material') |
| source_ref | text | nullable |
| grade_band | text | |
| subject_tags | text[] | default '{}' |
| student_ids | uuid[] | default '{}' |
| total_minutes_est | int | default 0 |
| weeks_est | int | default 1 |
| metadata | jsonb | default '{}' |

**curriculum_lessons:**

| Column | Type | Constraint / notes |
|--------|------|--------------------|
| id | uuid | PK |
| unit_id | uuid | NOT NULL, FK curriculum_units(id) |
| sequence_index | int | NOT NULL, UNIQUE(unit_id, sequence_index) |
| title | text | NOT NULL |
| objective | text | |
| minutes_est | int | NOT NULL default 60 |
| modality | text | NOT NULL, CHECK IN ('reading','video','hands_on','discussion','practice','quiz','project') |
| difficulty | text | NOT NULL, CHECK IN ('gentle','standard','stretch') |
| materials | jsonb | default '[]' |
| assessment | jsonb | default '{}' |
| prereqs | text[] | default '{}' |
| links | jsonb | default '[]' |

**curriculum_pacing:**

| Column | Type |
|--------|------|
| id | uuid |
| unit_id | uuid |
| start_date | date |
| strategy | text |
| schedule_map | jsonb | e.g. `[{ "sequence_index": 1, "recommended_day_offset": 0 }, ...]` |

**Link to calendar:** `events.curriculum_lesson_id` → `curriculum_lessons.id` (existing).

---

### C) Plan My Year — capacity/compliance plan

**academic_years** (from `20260202_plan_year_feature.sql` + alter):

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK |
| family_id | uuid | |
| year_name | text | NOT NULL |
| start_date | date | NOT NULL |
| end_date | date | NOT NULL |
| is_current | boolean | NOT NULL default false |
| allowed_weekdays | int[] | default ARRAY[1,2,3,4,5] (Mon–Fri) |
| mode | text | CHECK IN ('FIXED_END','TARGET_DAYS','TARGET_HOURS') (optional) |

**academic_year_plan** (from `20260218_academic_year_plan_blocks.sql`, later `20260232`):

| Column | Type | Notes |
|--------|------|--------|
| academic_year_id | uuid | UNIQUE, FK academic_years(id) |
| family_id | uuid | |
| start_date | date | |
| end_date | date | |
| constraint_mode | text | CHECK IN ('days','hours','none') |
| target_days | int | nullable |
| target_hours | numeric | nullable |
| blocks | jsonb | NOT NULL default '[]' |

**Block shape (each element of `blocks`):**

- `block_id` (uuid)
- `subject_id` (uuid)
- `child_ids` (uuid[])
- `weekdays` (int[] or array; 0=Sun … 6=Sat)
- `start_time` (time/text e.g. '09:00')
- `end_time` (time/text e.g. '10:00')
- `all_day` (boolean)

**academic_year_exclusions:**

| Column | Type |
|--------|------|
| academic_year_id | uuid |
| start_date | date |
| end_date | date |
| type | text |
| name | text |

---

### D) Supporting primitives (no new tables)

- **backlog_items** — used by curriculum commit for “add to backlog” path (fields not enumerated here).
- **uploads** — at least `id`, `storage_path` (Magic Extract / PDF).
- **materials** — at least `id`, family_id, text/notes, storage_path for PDF (Build Curriculum / Extract).
- **subject** — at least `id`, `name` (or title), `family_id` (course/subject; `events.subject_id`, blocks.`subject_id`).

---

## 2. Behavioral Contract: Plan My Year Slots ↔ Curriculum Placement

### 2.1 Slot definition (no new tables)

**Empty slot** = `events` row where:

- `is_placeholder = true`
- `generated_by = 'plan_year'`
- `academic_year_id IS NOT NULL`
- **`curriculum_lesson_id IS NULL`**

**Filled slot** = same row after:

- `curriculum_lesson_id = <curriculum_lessons.id>`

### 2.2 Overwrite / replace rules (critical invariant)

**Invariant:** Plan My Year Apply (replace placeholders) must **never** delete or overwrite an event that has been filled.

**Concrete rule for apply/replace:**  
When selecting rows to **update** or **delete** for an academic year (e.g. in block_regenerator), include **only** events that satisfy:

- `family_id = :family_id`
- `academic_year_id = :academic_year_id`
- `source_block_id = :block_id` (per-block regen)
- `is_placeholder = true`
- `generated_by = 'plan_year'`
- **`curriculum_lesson_id IS NULL`** ✅ **(overwrite lock)**
- `deleted_at IS NULL` (optional; current code includes soft-deleted so they can be “undeleted” on re-apply; **filled** slots must still be excluded by `curriculum_lesson_id IS NULL`)

**Exact predicate for “existing placeholders to touch” (block_regenerator):**

```text
SELECT id, start_ts, end_ts, child_id, child_ids, subject_id, title, deleted_at
FROM events
WHERE family_id = :family_id
  AND academic_year_id = :academic_year_id
  AND source_block_id = :block_id
  AND is_placeholder = true
  AND generated_by = 'plan_year'
  AND curriculum_lesson_id IS NULL   -- lock: never touch filled slots
ORDER BY start_ts;
```

**Delete candidate:** among the rows returned above, only those whose `(date, child_id)` (or whole-family key) are **no longer** in the block’s occurrence set. Do **not** add to delete list any event that has `curriculum_lesson_id IS NOT NULL` (they will not be in the SELECT above once the predicate is applied).

### 2.3 “Fill Slot” operation (API semantics)

From an empty slot event `E`:

**Fill from curriculum lesson `L`:**

- Set `E.curriculum_lesson_id = L.id`
- Set `E.source = 'curriculum'` (recommended for reporting)
- Optionally set `E.title` from `L.title`
- Keep `E.start_ts`, `E.end_ts`, `E.child_id`, `E.subject_id` (slot is the time anchor)
- Optionally set `instructional_status` to a “filled” value if you add one (e.g. keep `PLAN_PLACEHOLDER` or introduce a convention); **overwrite lock is `curriculum_lesson_id IS NOT NULL`**
- Recommended: keep `is_placeholder` as-is for provenance; **rely on `curriculum_lesson_id IS NOT NULL` as the overwrite lock**

**Fill from backlog:** create or attach a curriculum_lesson if it represents lesson structure (preferred); otherwise create a normal event with `source = 'manual'` (not curriculum-tracked).

### 2.4 Curriculum commit placement: prefer slots first

When committing a unit’s lessons to the calendar with **prefer_placeholder_slots = true**:

**Slot-fill pass:**

1. **Candidate slots query (exact predicate):**

   ```text
   SELECT id, start_ts, end_ts, child_id, subject_id
   FROM events
   WHERE family_id = :family_id
     AND generated_by = 'plan_year'
     AND is_placeholder = true
     AND curriculum_lesson_id IS NULL
     AND academic_year_id = :academic_year_id   -- or IN (ids for plans in date range)
     AND (deleted_at IS NULL)
     AND start_ts >= :range_start
     AND start_ts < :range_end
     AND child_id = ANY(:student_ids)
     AND subject_id = :resolved_subject_id
   ORDER BY start_ts ASC;
   ```

2. For each lesson in sequence order, take the next matching slot and:
   - UPDATE that event: set `curriculum_lesson_id = lesson.id`, `title` from lesson, `source = 'curriculum'`, and any other fields per 2.3.

**Fallback pass:** for lessons that did not get a slot, use existing `load_planning_context` availability logic; INSERT new events with `source = 'curriculum'`, `curriculum_lesson_id`, etc.

### 2.5 Subject resolution for unit → event.subject_id

- **curriculum_units** has no `subject_id`; it has **subject_tags** (text[]).
- Rule: if `subject_tags` has exactly one tag that maps 1:1 to a **subject** row (e.g. by name) for this family, use that `subject.id` as `resolved_subject_id`.
- If ambiguous or empty: at commit time, require user to choose “Which course does this unit belong to?” and use the chosen subject id only on the **events** created/filled (no new columns/tables).

---

## 3. UI Entry Points (Consistent)

### 3.1 Course / Subject edit (“home” for curriculum)

**Where:** Edit Subject modal or Subject detail page.

**Add a “Structure” section with 3 primary actions:**

1. **Generate curriculum** — open BuildCurriculumModal pre-scoped to this subject + chosen children + optional date range; include toggle **“Use Plan My Year slots (recommended)”** → `prefer_placeholder_slots = true`.
2. **Import / Parse** (PDF / syllabus / plan) — if from upload: Magic Extract flow; after preview, require “Attach to this course” + “Choose/Make unit” and route through curriculum commit (no ad-hoc event-only creation).
3. **Add manually** (units/lessons) — write to curriculum_units + curriculum_lessons (manual is still curriculum-owned); optional “Add to backlog” vs “Schedule” using same commit logic.

Do **not** offer a “Create lesson” that writes only an event without a curriculum link (unless explicitly a one-off event type).

### 3.2 Planner toolbar

- **Plan My Year** — PlanYearModal; Apply creates **slots** (events as in §2.1). UI copy: “Generate instructional slots” / “X slots created.”
- **Build Curriculum** — BuildCurriculumModal; option **“Use Plan My Year slots”** (on by default when slots exist in range); commit fills slots first (§2.4), then creates additional events as needed.

### 3.3 Library right-click (materials)

- **Build curriculum from this** — open BuildCurriculumModal with mode **From Material** and this material preselected; on commit, use slot preference if available.
- **Extract lessons/assignments (draft)** — Magic Extract preview; primary action **“Add to Course…”** (pick subject + unit) → route through curriculum commit/backlog.

Do **not** ship a “Create Lesson” that creates only events and bypasses curriculum.

### 3.4 Decision tree (in-context)

- “I need to meet state requirements / set my year schedule” → **Plan My Year**
- “I have a book/syllabus/video and want a plan” → **Build Curriculum**
- “I uploaded a PDF and want to pull assignments/lessons out” → **Extract / Import** (inside course or Build Curriculum)

---

## 4. MVP Checklist (No Schema Changes)

1. **Apply overwrite lock** — In Plan My Year apply/replace (block_regenerator), **exclude** rows with `curriculum_lesson_id IS NOT NULL`: only fetch and touch empty placeholders (add `AND curriculum_lesson_id IS NULL` to the existing placeholder query).
2. **Fill Slot action** — From an empty placeholder event, allow user to select a curriculum lesson and set `events.curriculum_lesson_id` (and optionally `source = 'curriculum'`, title).
3. **Commit prefers slots** — In curriculum commit, when `prefer_placeholder_slots` is true, run the slot-fill pass (§2.4) first, then fall back to availability.
4. **Course edit = curriculum hub** — Expose “Generate / Import / Add manually” under “Structure” on Course/Subject edit.
5. **Library routes into curriculum** — Right-click material → Build curriculum from this, or Extract → Attach to course/unit → commit.

---

## 5. Summary: Boundaries

| Concern | Owner | Tables / behavior |
|--------|--------|-------------------|
| When can school happen? (capacity, compliance) | Plan My Year | academic_years, academic_year_plan, **events** (placeholder slots only when curriculum_lesson_id IS NULL) |
| What are we teaching? (content, sequencing) | Build Curriculum | curriculum_units, curriculum_lessons, curriculum_pacing |
| Mapping lessons → calendar | Build Curriculum commit + Fill Slot | events.curriculum_lesson_id; placement prefers empty slots when prefer_placeholder_slots |
| Parsing PDFs/links | Magic Extract | Output attaches to curriculum or backlog via same commit path |

All of the above use **current tables and columns only**. The exact predicates and enums above are the single source of truth for implementers.
