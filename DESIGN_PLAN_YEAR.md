# Plan My Year — Design & Implementation Plan

## 1. Core Concepts

| Concept | Definition |
|--------|------------|
| **Blocks** | Recurring schedule templates: when learning *can* happen. (e.g. "Math Mon/Wed/Fri 9–11") |
| **Constraints** | How much learning *must* happen. (e.g. 180 instructional days or 1000 hours) |
| **Calendar events** | Materialized instances from blocks (placeholders you can edit/convert to manual) |
| **Drift** | Gap between planned and required when parents delete lessons, add breaks, travel, etc. |

The system continuously reconciles **planned** vs **required** and warns when you drift.

---

## 2. Day Counting

**Rule:** If Math and Science both happen Mon/Wed/Fri, that's **3 instructional days/week**, not 6.

**Definition:** For a given date, if at least one qualifying learning event exists (any subject) → that date counts as **1 instructional day**. This is a set/union operation.

```
Instructional days = count(distinct date) where date has ≥ 1 qualifying learning event
```

**Qualifying events (filter):**
- `event_type` in qualifying set (e.g. `'lesson'`)
- `status != 'canceled'`
- Either `is_placeholder = true` OR manual (both count)

---

## 3. Hours Counting

**Definition:** Independent of day count. Overlapping blocks (e.g. Math 9–11, Science 10–11) require an overlap policy.

**Policy options:**
- **H1 — Sum event durations:** Simple but double-counts overlaps. Can inflate hours if parents stack subjects.
- **H2 — Unique instructional minutes per day (union of time intervals):** Matches real "hours in the day." More defensible for "1000 hours" compliance.

**Recommendation:** Use H2 (union-of-intervals) for compliance. You can still show both:
- "Scheduled subject-hours" (sum)
- "Scheduled clock-hours" (union) ← use this for compliance

**Union-of-intervals algorithm (exact logic):**

For each date:
1. Collect intervals `[(start, end), (start, end), ...]` from qualifying events
2. Sort intervals by start
3. Merge overlapping intervals:
   - `merged = []`
   - For each interval:
     - If merged empty OR `interval.start > merged[-1].end`: append interval
     - Else: `merged[-1].end = max(merged[-1].end, interval.end)`
4. `total_minutes = sum(interval.end - interval.start for interval in merged)`

Total hours = sum across all days. Prevents double-counting overlaps.

---

## 4. Start/End Date Roles

- **Placeholder generation window:** Only generate events inside [start, end].
- **Compliance measurement window:** Planned days/hours are counted only inside [start, end].

---

## 5. Two Preview Types (Critical Distinction)

**Schedule potential** (from blocks + exclusions)
- "If we materialize your blocks, you'll schedule ~X days and ~Y hours."
- Computed **without** inserting events.
- Uses **only**: blocks, start/end, exclusions. **Never query events.**
- Used in **Plan My Year modal** before/after Apply.
- Implementation must never read from events; otherwise preview becomes inconsistent with actual Apply.

**Actual compliance** (from events in DB)
- After Apply—and during drift—compute from **existing events**, not blocks.
- Used in **health/drift** banner and Fix-it flow.
- Crucial: after parents edit/delete/convert, **blocks are no longer the truth**.

---

## 6. Plan My Year — Current vs Target

### Current (existing)

- Start date / End date
- Who (whole family / specific child)
- Which subjects (multi-select)
- Custom breaks (date ranges)
- Holidays (academic year holidays)
- Apply → creates 2 lessons/day rotating subjects
- Remove → clears placeholders

### Target (to build)

| Input | Description |
|-------|-------------|
| Start date / End date | Window for generation + compliance |
| **Constraint mode** | `( ) I need X instructional days` / `( ) I need X instructional hours` |
| **Target** | 180 days, 1000 hours, etc. |
| **Blocks** | Subject + Days of week (multi-select) + Start/end time (or "all day") + Children |
| Exclusions | Unified range-based model (see §12.3) |

| Output (live in modal) | Description |
|------------------------|-------------|
| Projected instructional days | Unique-date union from blocks (schedule potential) |
| Projected instructional hours | Union-of-intervals from blocks (H2) or sum (H1) |
| Delta vs requirement | "30 days under" / "10 days over" |
| Inline warnings | Under/over schedule |

---

## 7. Instructional Dates Under Blocks (No Generic "School Days")

Under a pure block model, the only scheduled days are those produced by blocks (minus exclusions). There is no generic "get_instructional_dates_list()."

**Instead:**
- `get_block_occurrence_dates(block, start, end, exclusions)` → dates this block produces
- **Planned days** = union of all occurrence dates across blocks
- **Planned hours** = union-of-intervals across occurrences (H2)

---

## 8. Generation: Blocks → Datetimes (DST correctness)

Blocks use `weekdays`, `start_time`, `end_time`. During Apply, generation must produce real timestamps:

```
start_ts = datetime.combine(date, start_time)  # with family timezone
end_ts   = datetime.combine(date, end_time)    # with family timezone
```

Use family timezone for DST correctness. Do not rely on naive time-only values.

---

## 9. Auto-Add for Under-Schedule

When delta < 0, the system needs a policy to fill gaps.

**Strategy A (MVP):** Add ONE Flex Learning block suggestion

- Suggest: "Flex Learning / Catch-up" on least-loaded weekday(s), default time (e.g. 10–11)
- Show **predicted improvement** (e.g. "+15 days toward requirement")
- User clicks **"Apply suggestion"** → block is added, preview recomputes
- **No auto-add-until-gap-closes** — that could add 30 flex blocks and overwhelm the UI
- Parents can rename Flex Learning block after adding

**Strategy B (future):** Extend existing blocks into additional weekdays (more opinionated).

---

## 10. Drift Detection

Parents delete lessons, add breaks, travel. **Plan Health** recomputes from events in DB (actual compliance), not blocks.

**Implementation:**
- Reusable server function: `compute_plan_health(plan_id)` or `compute_plan_health(academic_year_id)`
- Called by: event mutation endpoints (delete/cancel/convert), holiday/break update endpoints, plan update endpoints; optionally a periodic job later
- Store result: `academic_year_plan.health_cache` jsonb (see §12.1) so UI renders instantly

**Drift warning behavior (asymmetric):**
- **Under schedule:** Warning + action ("You're 12 days under your 180-day requirement") — buttons: "Fix it" / "Ignore for now"
- **Over schedule:** Informational only ("You're scheduled for 10 extra days") with optional "tighten schedule" — parents rarely mind overage

**Fix-it flow (suggestions):**

1. Add 1 extra learning day per week for the next 12 weeks
2. Add a catch-up week in April
3. Extend the school year end date by 3 weeks

Apply uses the same placeholder semantics (Replace deletes only untouched placeholders).

---

## 11. Day Constraint Nuance

"If one class is skipped the day still counts" — any qualifying event on that date counts the day. If a parent deletes Math but keeps Science, day counts. If they delete all lessons (or add a break), day no longer counts → drift.

**Canceled events:** `status != 'canceled'` in the qualifying filter. If all lessons on a day are marked canceled but remain on calendar, that day does **not** count.

---

## 12. Data Model

### 12.1 New: `academic_year_plan`

Stored plan definition, separate from placeholder events. **1-to-1 with academic year:** `UNIQUE(academic_year_id)`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `academic_year_id` | uuid | FK, **UNIQUE** |
| `family_id` | uuid | FK |
| `start_date` | date | Window start |
| `end_date` | date | Window end |
| `constraint_mode` | text | `'days'` \| `'hours'` |
| `target_days` | int | When mode = days |
| `target_hours` | numeric | When mode = hours |
| `blocks` | jsonb | Array of block defs |
| `qualifying_event_types` | text[] | e.g. `['lesson']` |
| `current_generation_id` | uuid | Every Apply creates new id; events use this; enables plan history and drift debug |
| `health_cache` | jsonb | `{ planned_days, planned_hours, delta_days, delta_hours, percent_complete, computed_at }` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Block schema (jsonb):** Each block must include a stable `block_id` uuid.

```json
{
  "block_id": "uuid",
  "subject_id": "uuid",
  "child_ids": ["uuid"],
  "weekdays": [1, 3, 5],
  "start_time": "09:00",
  "end_time": "11:00",
  "all_day": false
}
```

### 12.2 Existing: `events` (placeholders)

- `is_placeholder`, `generated_by`, `academic_year_id`, `generation_batch_id`
- **`source_block_id`** — **real column, first-class relational link**

```sql
ALTER TABLE events ADD COLUMN source_block_id uuid NULL;
CREATE INDEX idx_events_source_block_id ON events(source_block_id);
```

**Why a real column (not jsonb):** Needed for updating events when a block changes; drift analysis; future "edit block → update only untouched events from that block"; debugging; performance. Core relational link.

### 12.3 New: `academic_year_exclusions` (unified exclusion model)

One unified model — no per-day holiday expansion elsewhere.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `academic_year_id` | uuid | FK |
| `start_date` | date | Range start |
| `end_date` | date | Range end |
| `type` | text | `'holiday'` \| `'break'` \| `'blackout'` |

**Rule:** `is_excluded(date) = any(exclusion.start_date <= date <= exclusion.end_date)`

Range-based is simpler and faster than per-day expansion.

---

## 13. Apply / Replace Strategy

**When Apply runs (replace_placeholders = true):**

1. **Delete** only events where:
   - `is_placeholder = true`
   - `generated_by = 'plan_year'`
   - `academic_year_id = :academic_year_id`
   - **Do NOT filter by block_id or source_block_id**

2. Create new `current_generation_id` for this Apply

3. Regenerate all blocks cleanly

**Reason:** Parents may remove blocks. If you only delete per block, orphan placeholder events remain. Deleting by `(academic_year_id, is_placeholder, generated_by)` keeps Replace behavior correct and consistent with the placeholder conversion system.

---

## 14. Key Computations

**From blocks (schedule potential):**
- `get_block_occurrence_dates(block, start, end, exclusions)` → dates this block produces
- Projected days = union of occurrence dates across blocks
- Projected hours = union-of-intervals across occurrences (H2) or sum (H1)

**From events (actual compliance):**
- `events` in `[start, end]` that qualify

| Metric | Formula |
|--------|---------|
| **Planned days** | `count(distinct date(start_ts))` for qualifying events |
| **Planned hours** | Union-of-intervals per day, summed (H2); or `sum(duration_hours(event))` (H1) |
| **Delta (days)** | `planned_days - target_days` |
| **Delta (hours)** | `planned_hours - target_hours` |

**Warnings:** Under = warning + action; Over = informational only.

**Preview payload (backend must compute, not frontend):**

```json
{
  "projected_days": 175,
  "projected_hours": 920,
  "target_days": 180,
  "target_hours": 1000,
  "delta_days": -5,
  "delta_hours": -80
}
```

---

## 15. Blocks → Days Example

**Blocks:**

- Math: Mon/Wed/Fri 9–11
- Science: Mon/Wed/Fri 10–11
- Geography: Tue/Thu 9–10
- Writing: Tue/Thu 10–11

**Projected planned days/week:** Mon ✅ Tue ✅ Wed ✅ Thu ✅ Fri ✅ = **5 days/week** (not 10).

**Projected hours/week:** Union-of-intervals (H2) or sum of block durations (H1).

---

## 16. Implementation Phases

**Phase order:** Apply-from-blocks must exist before constraint/delta, so blocks drive all scheduling math first.

### Phase 1: Blocks Model & Preview Math (schedule potential)

1. Add `academic_year_plan` table (UNIQUE academic_year_id) + `academic_year_exclusions` + `events.source_block_id` migration
2. Extend PlanYearModal UI: blocks (subject + weekdays + time range + children), each with `block_id`
3. Backend: `get_block_occurrence_dates(block, start, end, exclusions)` — no generic "instructional dates"
4. Backend: `compute_schedule_potential(blocks, start, end, exclusions)` → projected days (union of dates), projected hours (union-of-intervals per day). **Never query events.**
5. Preview in modal: "If we materialize your blocks, you'll schedule ~X days and ~Y hours"

**Dependencies:** None (builds on existing academic year + events)

---

### Phase 2: Apply Uses Blocks (replace current rotation)

1. Refactor `apply_to_calendar`: delete by (academic_year_id, is_placeholder, generated_by) — no block filter; regenerate all blocks
2. One event per block occurrence; stamp `source_block_id` (real column) from block
3. Generate timestamps with `datetime.combine(date, time)` + family timezone for DST
4. New `current_generation_id` per Apply; events use `generation_batch_id` (or equivalent) linked to that

**Dependencies:** Phase 1

---

### Phase 3: Constraint Mode & Delta

1. Add constraint mode (days vs hours) + target to PlanYearModal
2. Store in `academic_year_plan`
3. Backend preview response: `{ projected_days, projected_hours, target_days, target_hours, delta_days, delta_hours }` — compute delta server-side, not frontend
4. Inline warnings: under = "30 days under" (action); over = "10 days over" (informational)

**Dependencies:** Phases 1, 2 — constraint/delta meaningless until blocks drive scheduling

---

### Phase 4: Auto-Add (Strategy A)

1. When delta < 0, add "Suggest Flex Learning" (or similar) button
2. Propose ONE "Flex Learning / Catch-up" block on least-loaded weekday(s), default time
3. Show predicted improvement (e.g. "+15 days")
4. User clicks "Apply suggestion" → block added, preview recomputes (no max-guard loop)

**Dependencies:** Phases 2, 3

---

### Phase 5: Drift Detection (actual compliance)

1. `compute_plan_health(academic_year_id)`: query events in [start, end], compute planned days/hours (union-of-intervals), delta, percent_complete
2. Store in `health_cache`: `{ planned_days, planned_hours, delta_days, delta_hours, percent_complete, computed_at }`; call from event mutation endpoints, holiday/break updates, plan updates
3. Non-blocking banner: under = warning + "Fix it" / "Ignore"; over = informational
4. "Fix it" / "Ignore for now" buttons

**Dependencies:** Phases 2, 3

---

### Phase 6: Fix-It Suggestions (later)

1. Suggest: add 1 extra day/week for N weeks, catch-up week, extend end date
2. Apply suggestion → regenerate placeholders with same semantics

**Dependencies:** Phase 5

---

## 17. Architectural Layers

The system is cleanly separated into three layers (as used in scalable scheduling systems):

| Layer | Contents |
|-------|----------|
| **Definition** | `academic_year_plan`, blocks, constraints, exclusions |
| **Materialization** | `events` (placeholders + manual), `source_block_id` link |
| **Compliance** | `compute_plan_health(events)` → actual vs required, drift detection |

---

## 18. File / Component Map

| Area | Files |
|------|-------|
| Migration | `supabase/migrations/YYYYMMDD_academic_year_plan.sql` — plan, exclusions, `events.source_block_id` + index |
| Backend routes | `backend/routers/academic_year_routes.py` |
| Year calculator / blocks | `backend/services/year_calculator.py` — `get_block_occurrence_dates`, `compute_schedule_potential` |
| Plan health | `compute_plan_health(academic_year_id)` — called from event/holiday/plan mutation endpoints |
| Plan modal | `components/planner/PlanYearModal.js` |
| Client | `lib/services/academicYearClient.js` |
| Drift banner | New: `components/planner/PlanHealthBanner.js` (Phase 5) |

---

## 19. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration affects existing families | Make `academic_year_plan` optional; current flow works without it |
| Blocks UI complexity | Start with simple block form; iterate |
| Drift triggers too often | Debounce; call `compute_plan_health` from mutation endpoints; store in `health_cache` for instant UI |
| "Qualifying" filter ambiguity | Define once in config; document clearly |
| Hours overlap double-count | Use H2 (union-of-intervals) for compliance |

---

## 20. Out of Scope (for now)

- Strategy B (extend blocks into new weekdays)
- Per-day hour cap (can add later if needed)
- "Over schedule" warnings (lower priority)
