# Year Planning Feature Implementation - Phase 1

## Overview

This document tracks the implementation of Phase 1 - Year-Round Intelligence Core, a comprehensive year planning system with AI functions for planning, pacing, and rebalancing.

## Implementation Status

### ✅ Chunk A: Database & RPC Scaffolding (COMPLETE)

**Files Created:**
- `2025-11-13_year_plans.sql` - Creates year_plans table with RLS
- `2025-11-13_year_plan_children.sql` - Creates year_plan_children table with RLS
- `2025-11-13_term_milestones.sql` - Creates term_milestones table with RLS
- `2025-11-13_calendar_cache_flags.sql` - Adds is_frozen and is_shiftable columns
- `2025-11-13_rpc_create_year_plan.sql` - RPC to create year plans with children and milestones
- `2025-11-13_rpc_get_curriculum_heatmap.sql` - RPC to get heatmap data
- `2025-11-13_rpc_rebalance_schedule.sql` - RPC to preview rebalance moves

**Key Features:**
- All tables include proper RLS policies
- RPCs use SECURITY DEFINER with family validation
- Auto-generated weekly milestones
- Date validation (max 370 days)
- Break array length limit (max 40)

### ✅ Chunk B: Backend HTTP Layer (COMPLETE)

**Files Created:**
- `backend/routers/year_routes.py` - FastAPI routes for year planning
- Updated `backend/main.py` to include year_router

**Endpoints:**
- `POST /api/year/create` - Create a new year plan
- `GET /api/year/heatmap` - Get curriculum heatmap data
- `POST /api/year/rebalance` - Preview rebalance moves
- `GET /api/year/prefill` - Get prefilled data for year plan creation

**Features:**
- All routes behind `require_parent` (get_current_user)
- Structured error responses with request IDs
- Mock mode support via `?mock=1`
- Retry logic with exponential backoff
- Family ID hashing for privacy in logs

### ✅ Chunk C: Shared Types + Client SDK (COMPLETE)

**Files Created:**
- `lib/types/year.js` - JSDoc type definitions
- `lib/services/yearClient.js` - API client with mock support

**Features:**
- Type-safe client methods
- Mock mode support
- Feature flag checking
- Batch rebalance application (10 at a time)

### ✅ Chunk D: UI Wizard (COMPLETE)

**Files Created:**
- `components/year/PlanYearWizard.js` - Comprehensive multi-step wizard

**Wizard Steps:**
1. **Students & Scope** - Select children and plan scope (current/next/custom)
2. **Dates & Breaks** - Set start/end dates and add break periods
3. **Subjects & Targets** - Configure subjects and weekly minute targets per child
4. **Milestones** - Auto-generated weekly milestones (editable)
5. **Review** - Review all settings before creating plan

**Features:**
- Feature flag gating
- Autosave draft support (ready for onboarding_task.payload integration)
- Progressive rendering with skeletons
- Error handling with retry
- Keyboard shortcuts (Esc to close)
- Prefill data from last year
- Auto-generate milestones from date range

### ⏳ Chunk E: Heatmap Visualization (PENDING)

**Required:**
- Create `components/year/CurriculumHeatmap.js`
- Integrate with chart library (Recharts or Victory)
- Display scheduled vs done minutes
- Empty state for new users
- Pagination/virtualization for large ranges (≤54 weeks)

**Integration Points:**
- Add to Planner right sidebar
- Show when `heatmap_v1` feature flag is enabled

### ⏳ Chunk F: Rebalance (PENDING)

**Required:**
- Add context menu item to events: "Rebalance subject from here..."
- Create `components/year/RebalanceModal.js`
- Preview moves before applying
- Batch apply with progress indicator
- Undo functionality
- Skip frozen/non-shiftable days

**Integration Points:**
- Event context menu in PlannerWeek
- Event details modal

### ⏳ Chunk G: Holiday/Blackout Sync (PENDING)

**Required:**
- Create `backend/routers/blackout_routes.py` with `/api/year/sync_blackouts`
- Create storage bucket `state_blackouts` (public read)
- Upsert into calendar_days_cache with is_shiftable=false
- Optional confirmation in wizard: "Add state holidays?"

## Entry Points (To Be Integrated)

The wizard should be accessible from:

1. **Planner Right Toolbar** → "AI Tools" → "Plan the Year" (primary)
   - Location: `components/planner/PlannerWeek.js` or `components/planner/AIActions.js`
   - Add menu item to AIActions dropdown

2. **Child Home CTA** (secondary)
   - Location: `components/home/` or child profile screens
   - Add button/CTA to trigger wizard

3. **+New Menu** → "Year Plan" (utility)
   - Location: Wherever the "+New" menu exists
   - Add option to create year plan

## Feature Flags

Set these environment variables to enable features:

```bash
REACT_APP_YEAR_PLANS_V1=true    # Enable year planning wizard
REACT_APP_HEATMAP_V1=true        # Enable heatmap visualization
REACT_APP_REBALANCE_V1=true      # Enable rebalance functionality
```

## Database Migration Order

Run migrations in this order:

1. `2025-11-13_year_plans.sql`
2. `2025-11-13_year_plan_children.sql`
3. `2025-11-13_term_milestones.sql`
4. `2025-11-13_calendar_cache_flags.sql`
5. `2025-11-13_rpc_create_year_plan.sql`
6. `2025-11-13_rpc_get_curriculum_heatmap.sql`
7. `2025-11-13_rpc_rebalance_schedule.sql`

## Testing Checklist

### Chunk A Acceptance
- [ ] All migrations apply cleanly on dev DB
- [ ] RLS allows service-role reads/writes
- [ ] User reads/writes from same family succeed
- [ ] RPCs return data from mock/test rows

### Chunk B Acceptance
- [ ] cURL/Postman calls succeed end-to-end with 200/4xx codes
- [ ] Heatmap returns empty but valid shape for new users
- [ ] Rebalance with nonexistent IDs returns 404 JSON (not HTML)

### Chunk C Acceptance
- [ ] Type-check passes
- [ ] yearClient can hit mock endpoints without server

### Chunk D Acceptance
- [ ] Opening/closing wizard never white-screens
- [ ] Cancelling leaves no DB writes
- [ ] Creating a plan shows toast "Plan created" and nothing else breaks
- [ ] Feature flag OFF hides wizard completely

### Chunk E Acceptance (When Implemented)
- [ ] Chart renders with zero rows
- [ ] Large ranges (≤54 weeks) paginate or virtualize

### Chunk F Acceptance (When Implemented)
- [ ] Moving a future Math event shifts only future Math events
- [ ] Skips frozen days
- [ ] No overlapping events after write
- [ ] Undo restores original timestamps

### Chunk G Acceptance (When Implemented)
- [ ] Blackout days show as disabled
- [ ] Creating an event warns "Blackout day"

## Safety Features

- ✅ Feature flags default OFF
- ✅ Progressive rendering (never blocks existing Planner)
- ✅ Error surfacing (toast + console + Sentry breadcrumb)
- ✅ Mock mode support for development
- ✅ RLS policies on all tables
- ✅ Family validation in all RPCs
- ✅ Date validation (start ≤ end, ≤ 370 days)
- ✅ Break array length limit (≤ 40)

## Next Steps

1. **Integrate Entry Points** - Add wizard triggers to PlannerWeek, AIActions, and other locations
2. **Implement Chunk E** - Create CurriculumHeatmap component
3. **Implement Chunk F** - Add rebalance functionality to event context menu
4. **Implement Chunk G** - Create blackout sync job
5. **Add Autosave** - Integrate draft saving to onboarding_task.payload
6. **Add Telemetry** - Track year_plan_created, rebalance_preview, rebalance_applied events
7. **Test End-to-End** - Verify all acceptance criteria

## Rollback Plan

If issues occur:

1. **Disable Feature Flags** - Set all `REACT_APP_*_V1` to `false`
2. **Revert Migrations** - Run down scripts (to be created) in reverse order
3. **Remove Routes** - Comment out year_router in `backend/main.py`
4. **Remove UI** - Wizard won't show if feature flag is OFF

## Notes

- The wizard uses a sheet/modal pattern that works on both desktop and mobile
- All database operations are behind RLS for security
- The system is designed to never break existing Planner functionality
- Mock mode allows UI development without backend dependencies

