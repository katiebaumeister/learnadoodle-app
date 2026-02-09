# Plan Year Feature Implementation Summary

## Database Schema Reuse Strategy

### Tables Extended (Not Created)
1. **academic_years** - Extended with:
   - `is_draft` (boolean)
   - `mode` (enum: FIXED_END | TARGET_DAYS | TARGET_HOURS)
   - `target_instructional_days` (integer)
   - `target_instructional_hours` (integer)
   - `planned_hours_per_day` (numeric)
   - `allowed_weekdays` (integer array, default [1,2,3,4,5] = Mon-Fri)
   - `state_code` (text)

2. **holidays** - Extended with:
   - `type` (enum: GLOBAL_HOLIDAY | CUSTOM_HOLIDAY | BREAK | BLACKOUT)
   - `source_id` (text) - Stable identifier from global holiday provider
   - Unique index on (academic_year_id, holiday_date, type, source_id) to prevent duplicates

3. **class_days** - Reused for weekday patterns (already has academic_year_id + day_of_week)

### New Tables Created
1. **academic_year_holiday_settings** - Stores global holiday subscription preferences:
   - `academic_year_id` (FK to academic_years)
   - `follow_global_holidays` (boolean)
   - `holiday_country_code` (text, e.g., "US", "AU")
   - `holiday_region` (text, optional state/province)
   - `provider` (enum: NAGER_DATE | GOOGLE_ICS | CALENDARIFIC)
   - `last_synced_at` (timestamp)

### Why Not Reuse blackout_periods?
- `blackout_periods` is for scheduling availability (child-specific, date ranges)
- `holidays` table is the canonical store for academic year holidays (year-level, single dates)
- Different purposes, different data models

## Backend Implementation

### Services Created
1. **holiday_providers.py** - Global holiday provider interface:
   - `NagerDateProvider` - Working implementation (no API key required)
   - `GoogleICSProvider` - Stub for future
   - `CalendarificProvider` - Stub for future (requires API key)

2. **year_calculator.py** - Deterministic calculation engine:
   - `is_instructional_day()` - Check if date is instructional
   - `count_instructional_days()` - Count days in range
   - `compute_end_date()` - Compute end date from target days
   - `recalculate_year()` - Main recalculation function

### API Endpoints
1. **POST /api/academic_year/create_default** - Non-homeschool fast path
2. **POST /api/academic_year/recalculate** - Constraint solver (preview)
3. **POST /api/academic_year/save** - Persist configuration
4. **POST /api/academic_year/sync_global_holidays** - Force resync
5. **GET /api/academic_year/{id}** - Get year with settings and counts

## Frontend Implementation

### Component: PlanYearModal
Located at: `components/planner/PlanYearModal.js`

**Two-Path UX:**

#### Path A: Non-Homeschool Fast Path
- Detects if no homeschooled students
- Shows "Here's your year" with defaults (Aug 15 → Jun 15)
- Inline "Edit dates" affordance
- Toggle: "Follow public holidays" (default ON) with country dropdown
- CTA: Continue

#### Path B: Homeschool Constraint Solver
- Mode toggle:
  - "I know my end date" (FIXED_END)
  - "I need X school days" (TARGET_DAYS)
  - "I need X hours" (TARGET_HOURS) - only show if state requires hours
- Inputs:
  - Start date
  - End date OR target days/hours
  - Weekday pattern chips (Mon–Sun)
  - Toggle "Follow public holidays" + country/region picker
  - Custom holidays editor:
    - "Add custom holiday" date picker + label
    - List of holidays with remove button
    - Visually distinguish Global vs Custom
- On any change: call /recalculate (debounced) and update computed output live
- Buttons: Save, Save Draft, Skip for now

## Onboarding/Constraint Information Needed

### For Non-Homeschool Path:
- Family profile country code (default: "US")
- Whether students are homeschooled (check children table or family settings)

### For Homeschool Path:
- State code (for hours requirement lookup)
- Family profile country code
- Whether state requires instructional hours (from state_requirements.json or similar)

## Testing Requirements

### Backend Unit Tests
- Counting correctness with weekends excluded + holidays
- computeEndDate hits target days correctly
- sync_global_holidays idempotent (2 sync calls yields same row count)
- Turning OFF follow_global_holidays removes GLOBAL_HOLIDAY rows

### Frontend Smoke Tests
- Non-homeschool flow completes without needing recalculation complexity
- Homeschool mode switch preserves inputs and recalculates
- Add/remove custom holiday triggers recalculation
- Toggle follow_global_holidays triggers sync + recalculation

## Next Steps

1. Create frontend PlanYearModal component
2. Add API client methods in lib/services/academicYearClient.js
3. Integrate with WebLayout.js to open modal from "Plan My Year" button
4. Add unit tests for calculation engine
5. Add integration tests for API endpoints
