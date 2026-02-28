# Unified Curriculum & Planning — Architecture Spec

**Goal:** Collapse multiple “planner/curriculum” modals into a shared architecture where each modal is a different entry point into the same primitives + contracts. No new tables; only consistent behavior and UI boundaries.

---

## 1. Shared Primitives (Exact Tables + Fields + Enums/Constraints)

### A) `events` — single shared surface (slots, scheduled lessons, instructional accounting)

**Fields used by this architecture:**

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK |
| family_id | uuid | |
| child_id | uuid | nullable for whole-family |
| child_ids | uuid[] | optional whole-family participants |
| subject_id | uuid | nullable for some types |
| title | text | |
| start_ts | timestamptz | |
| end_ts | timestamptz | |
| status | text | no DB CHECK; app uses scheduled, done, canceled, in_progress |
| event_type | text | NOT NULL; CHECK below |
| is_placeholder | boolean | default false |
| generated_by | text | e.g. 'plan_year' |
| academic_year_id | uuid | FK academic_years(id) ON DELETE SET NULL |
| source_block_id | uuid | block that produced it |
| generation_batch_id | uuid | regen batch |
| curriculum_lesson_id | uuid | FK curriculum_lessons(id) ON DELETE SET NULL |
| counts_toward_plan | boolean | |
| instructional_status | text | CHECK below |
| source | text | CHECK below |
| deleted_at | timestamptz | soft delete |

**Exact CHECK constraints:**

- **event_type:**
  ```text
  CHECK (event_type IN (
    'Lesson','Activity','Assignment','Sport','Appointment','Extracurricular',
    'Trip','Holiday','Project','Assessment','Homework','Other'
  ))
  ```
- **instructional_status:**
  ```text
  CHECK (instructional_status IS NULL OR instructional_status IN (
    'NONE','MANUAL_COUNTS','PLAN_PLACEHOLDER','PLAN_LOCKED','EXCLUDED'
  ))
  ```
- **source:**
  ```text
  CHECK (source IN ('ai','manual','year_plan_seed','curriculum','system'))
  ```

**Canonical meanings (non-negotiable):**

- **Empty Plan-Year Slot:** `is_placeholder = true` AND `generated_by = 'plan_year'` AND `academic_year_id IS NOT NULL` AND `curriculum_lesson_id IS NULL`
- **Filled Slot:** same row after `curriculum_lesson_id IS NOT NULL` (this is the overwrite lock)
- **Curriculum-scheduled event:** `source = 'curriculum'` AND `curriculum_lesson_id IS NOT NULL` (may or may not be a filled slot)
- **Manual instructional event:** `source = 'manual'`; may set `counts_toward_plan = true` even if `academic_year_id IS NULL`

---

### B) Curriculum — canonical lesson structure

**curriculum_units**

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK |
| family_id | uuid | NOT NULL FK family(id) |
| created_by_uid | text | NOT NULL |
| title | text | NOT NULL |
| source_type | text | NOT NULL CHECK IN ('topic','syllabus','pdf','link','material') |
| source_ref | text | nullable |
| grade_band | text | |
| subject_tags | text[] | default '{}' |
| student_ids | uuid[] | default '{}' |
| total_minutes_est | int | default 0 |
| weeks_est | int | default 1 |
| metadata | jsonb | default '{}' |

**curriculum_lessons**

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK |
| unit_id | uuid | NOT NULL FK curriculum_units(id) |
| sequence_index | int | NOT NULL UNIQUE(unit_id, sequence_index) |
| title | text | NOT NULL |
| objective | text | |
| minutes_est | int | NOT NULL default 60 |
| modality | text | NOT NULL CHECK IN ('reading','video','hands_on','discussion','practice','quiz','project') |
| difficulty | text | NOT NULL CHECK IN ('gentle','standard','stretch') |
| materials | jsonb | default '[]' |
| assessment | jsonb | default '{}' |
| prereqs | text[] | default '{}' |
| links | jsonb | default '[]' |

**curriculum_pacing**

| Column | Type |
|--------|------|
| id | uuid |
| unit_id | uuid |
| start_date | date |
| strategy | text |
| schedule_map | jsonb | e.g. [{ "sequence_index": 1, "recommended_day_offset": 0 }, ...] |

**Calendar link:** `events.curriculum_lesson_id` → `curriculum_lessons.id`

---

### C) Plan My Year — capacity/compliance plan

**academic_years**

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK |
| family_id | uuid | |
| year_name | text | NOT NULL |
| start_date | date | NOT NULL |
| end_date | date | NOT NULL |
| is_current | boolean | NOT NULL default false |
| allowed_weekdays | int[] | default {1,2,3,4,5} (Mon–Fri) |
| mode | text | CHECK IN ('FIXED_END','TARGET_DAYS','TARGET_HOURS') if present |

**academic_year_plan**

| Column | Type | Notes |
|--------|------|--------|
| academic_year_id | uuid | UNIQUE FK academic_years(id) |
| family_id | uuid | |
| start_date | date | |
| end_date | date | |
| constraint_mode | text | CHECK IN ('days','hours','none') |
| target_days | int | nullable |
| target_hours | numeric | nullable |
| blocks | jsonb | NOT NULL default '[]' |

**Block shape (each element of blocks):** `block_id` (uuid), `subject_id` (uuid), `child_ids` (uuid[]), `weekdays` (int[], 0=Sun..6=Sat), `start_time` (time/text e.g. '09:00'), `end_time` (time/text e.g. '10:00'), `all_day` (boolean)

**academic_year_exclusions**

| Column | Type |
|--------|------|
| academic_year_id | uuid |
| start_date | date |
| end_date | date |
| type | text |
| name | text |

---

### D) Supporting primitives (existing; no new tables)

- **backlog_items** — curriculum commit backlog path
- **uploads** — id, storage_path, … (Magic Extract)
- **materials** — id, family_id, notes/text, storage_path, … (Build Curriculum + Extract)
- **subject** — id, family_id, name, … (Plan blocks + events.subject_id)

---

## 2. Behavioral Contract (Exact Predicates + No-Destruction Rules)

### 2.1 Slot definition

**Empty slot (Plan My Year placeholder)** = `events` row satisfying:

- `is_placeholder = true`
- `generated_by = 'plan_year'`
- `academic_year_id IS NOT NULL`
- `curriculum_lesson_id IS NULL`

**Filled slot** = same row after `curriculum_lesson_id = <curriculum_lessons.id>`.

### 2.2 Apply/Replace (Plan My Year) — overwrite lock is curriculum_lesson_id

Plan My Year regeneration must **only touch empty slots**. Filled slots are user-owned and must be invisible to regeneration.

**Exact “existing placeholders to touch” predicate (per block):**

```text
SELECT id, start_ts, end_ts, child_id, child_ids, subject_id, title, deleted_at
FROM events
WHERE family_id = :family_id
  AND academic_year_id = :academic_year_id
  AND source_block_id = :block_id
  AND is_placeholder = true
  AND generated_by = 'plan_year'
  AND curriculum_lesson_id IS NULL
ORDER BY start_ts;
```

**Delete rule:** Only delete placeholders returned by the query above whose (date, child) key is not in the block’s occurrence set. Filled slots never enter the delete set because they never enter the query.

**Soft delete behavior:** Regeneration may “undelete” placeholders by setting `deleted_at = NULL` when reintroduced; filled slots remain unaffected because they’re excluded upstream.

✅ **Implemented in** `block_regenerator.py` via `.is_("curriculum_lesson_id","null")`.

### 2.3 Collision avoidance (Option B) — exact qualifying definition

Before inserting a placeholder slot for (date, child, subject), **skip insert** if a qualifying event already exists on that date.

**Qualifying occupant conditions:**

- `family_id = :family_id`
- `subject_id = :subject_id`
- `counts_toward_plan = true`
- `deleted_at IS NULL`
- `academic_year_id IS NOT NULL` (intentionally ignores “orphan” instructional events)
- `event_type = 'Lesson'`
- `status != 'canceled'`
- `start_ts` in `[min_occ_date 00:00, max_occ_date+1 00:00)`

Then treat that date/child as **occupied** and do not insert a placeholder there.

### 2.4 Curriculum commit placement — “prefer Plan My Year slots”

When committing curriculum lessons with **prefer_placeholder_slots = true**:

**Candidate slots (exact predicate):**

```text
SELECT id, start_ts, end_ts, child_id, subject_id
FROM events
WHERE family_id = :family_id
  AND generated_by = 'plan_year'
  AND is_placeholder = true
  AND curriculum_lesson_id IS NULL
  AND academic_year_id = :academic_year_id
  AND deleted_at IS NULL
  AND start_ts >= :range_start
  AND start_ts <  :range_end
  AND child_id = ANY(:student_ids)
  AND subject_id = :resolved_subject_id
ORDER BY start_ts ASC;
```

**Slot-fill pass:** For each curriculum_lesson in sequence_index order: take next slot; UPDATE slot: `curriculum_lesson_id = lesson.id`, `source = 'curriculum'`, `title = lesson.title` (recommended); keep `start_ts`/`end_ts`/`child_id`/`subject_id` unchanged.

**Fallback pass:** If lessons remain, create new events using current availability logic: set `source = 'curriculum'`, `curriculum_lesson_id`, choose start_ts/end_ts via scheduling context.

### 2.5 Subject resolution (unit → event.subject_id) with current schema

- **curriculum_units** has no `subject_id`; it has **subject_tags** (text[]).
- If **subject_tags** maps to exactly one subject (1:1, family-scoped), use that subject id.
- Otherwise require user selection at commit time (“Which course does this unit belong to?”) and apply subject_id only to the events created/filled. No schema changes.

---

## 3. Modal Unification: What Each Modal Owns (and Must Not Do)

### A) PlanYearModal (capacity/compliance)

**Owns:**

- academic_years, academic_year_plan.blocks, academic_year_exclusions
- Generating **empty slots** in events (`is_placeholder = true`, `generated_by = 'plan_year'`, `curriculum_lesson_id IS NULL`)

**Must not:**

- Create curriculum rows (curriculum_units / curriculum_lessons)
- Overwrite or delete any event with `curriculum_lesson_id IS NOT NULL`

**UI language:** “Instructional slots,” not “lessons.”

### B) BuildCurriculumModal (canonical curriculum builder)

**Owns:**

- Writing curriculum_units, curriculum_lessons, curriculum_pacing
- Committing lessons into calendar: either by **filling slots first** (preferred) or creating new events (fallback)
- Committing backlog-only lessons to backlog_items

**Must not:**

- Write academic_year_plan.blocks or exclusions
- Create “placeholder slots” (that’s Plan My Year)

**UI option:** Toggle “Use Plan My Year slots” (default ON when slots exist in range).

### C) MagicExtract (parsing capability, not a standalone planner)

**Owns:**

- Extracting draft lessons/assignments from an upload or material

**Must not:**

- Directly create events as the **primary** action
- Bypass curriculum tables

**Primary action:** “Add to course/unit…” → routes into curriculum commit path (creates/updates curriculum_* and optionally schedules/fills slots).

---

## 4. Unified UI Entry Points (Consistent Across App)

### 4.1 Course / Subject Edit (the hub for curriculum)

Add a **Structure** section/tab with three actions:

1. **Generate Curriculum** — opens BuildCurriculumModal pre-scoped: subject preselected, children preselected, optional date range; shows “Use Plan My Year slots” toggle.
2. **Import / Parse** (PDF / syllabus / plan) — opens MagicExtract if upload/material exists; after preview, requires: choose/create unit, attach to this subject/course, choose “Backlog” vs “Schedule (fill slots if available)”.
3. **Add manually** — creates curriculum_units + curriculum_lessons (manual entry); then “Schedule” uses the same commit logic (slot-fill then fallback).

Do **not** offer “Create Lesson” that writes only to events unless explicitly “one-off event” type.

### 4.2 Planner Toolbar (time vs content)

- **Plan My Year** → PlanYearModal → creates/updates empty slots
- **Build Curriculum** → BuildCurriculumModal → creates curriculum + schedules lessons (prefer slots)

### 4.3 Library right-click (materials)

- **Build curriculum from this** → BuildCurriculumModal (From Material preselected)
- **Extract lessons/assignments (draft)** → MagicExtract → “Add to course/unit…” (commit path)

No “Create lesson” that bypasses curriculum.

---

## 5. UI Differences (What Users Should See as Distinct)

| Surface | Shows | Primary action |
|---------|--------|-----------------|
| Plan My Year | Schedule blocks, breaks, targets, projected hours/days | “Apply → generate instructional slots” |
| Curriculum | Units + lesson list + pacing | “Commit → fill slots first (or schedule)” |
| Slot event in calendar | Empty vs filled state | “Fill slot” (pick lesson / next lesson / backlog) |
| Magic Extract | Draft extracted items | “Attach to course/unit” (not “create event”) |

---

## 6. MVP Implementation Checklist (No Schema Changes)

| # | Item | Status |
|---|------|--------|
| 1 | **Apply overwrite lock** — Regeneration query includes `curriculum_lesson_id IS NULL` | ✅ Done (block_regenerator.py) |
| 2 | **Fill Slot** — UI action + backend update sets `events.curriculum_lesson_id`, `source = 'curriculum'`, `title` | To do |
| 3 | **Prefer slots in curriculum commit** — Run candidate-slot query first, then fallback | To do |
| 4 | **Course edit becomes hub** — Add Structure section with Generate / Import / Manual actions | To do |
| 5 | **Library routes into curriculum** — Remove event-only creation from extract; require attach/commit | To do |

---

## 7. Summary: Boundaries

| Concern | Owner | Tables / behavior |
|--------|--------|-------------------|
| When can school happen? (capacity, compliance) | Plan My Year | academic_years, academic_year_plan, **events** (empty slots only) |
| What are we teaching? (content, sequencing) | Build Curriculum | curriculum_units, curriculum_lessons, curriculum_pacing |
| Mapping lessons → calendar | Build Curriculum commit + Fill Slot | events.curriculum_lesson_id; prefer slots when enabled |
| Parsing PDFs/links | Magic Extract | Output attaches to curriculum or backlog via same commit path |

All of the above use **current tables and columns only**. This spec is the single source of truth for primitives, contracts, and modal boundaries.

**Companion doc:** [UNIFIED_CURRICULUM_UI_LANGUAGE_SPEC.md](./UNIFIED_CURRICULUM_UI_LANGUAGE_SPEC.md) — microcopy, labels, and tooltips so “slot vs lesson vs curriculum lesson” is consistent everywhere.
