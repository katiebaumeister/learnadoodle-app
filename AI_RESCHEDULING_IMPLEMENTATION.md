# AI Rescheduling System - Implementation Summary

## Overview

The AI Rescheduling System enables intelligent schedule optimization with adaptive pacing, blackout periods, and proposal-based rescheduling. Parents can create blackout periods (trips, absences), and the system will propose optimized schedules that respect availability, syllabus pacing, and learning velocity.

## ✅ What's Been Implemented

### 1. Database Schema (`ai_rescheduling_system.sql`)

#### Tables Created:
- **`learning_velocity`** - Tracks adaptive learning speed per child/subject (0.6-1.5 range)
- **`blackout_periods`** - Stores planned absences/trips (family or child-specific)
- **`ai_plans`** - Proposal store with status (draft/applied/discarded/partial)
- **`ai_plan_changes`** - Diff store for each proposed change (add/move/delete)

#### RPC Functions:
- **`get_required_minutes`** - Returns velocity-adjusted weekly minutes per subject
- **`done_minutes_for_week`** - Calculates completed minutes for a week
- **`scheduled_minutes_for_week`** - Calculates scheduled minutes for a week

#### RLS Policies:
- All tables have proper RLS policies for family-scoped access

### 2. Backend API Routes (`lib/aiReschedulingRoutes.js`)

#### Endpoints:

**POST `/api/ai/blackout`**
- Creates a blackout period
- Automatically creates `schedule_overrides` for each day in range
- Refreshes `calendar_days_cache`
- Parameters: `familyId`, `childId?`, `startsOn`, `endsOn`, `reason?`

**POST `/api/ai/propose-reschedule`**
- Generates AI plan proposal (does NOT apply changes)
- Computes deficits using velocity-adjusted required minutes
- Finds free gaps using `calendar_days_cache` and existing events
- Packs events using greedy algorithm (respects blackouts, day caps, block sizes)
- Creates `ai_plans` and `ai_plan_changes` records
- Parameters: `familyId`, `weekStart`, `childIds`, `horizonWeeks?`, `reason?`

**PATCH `/api/ai/approve`**
- Applies approved changes atomically
- Updates events table (insert/update/delete)
- Marks changes as applied
- Updates plan status (applied/partial)
- Parameters: `planId`, `approvals: [{changeId, approved, edits?}]`

**POST `/api/ai/recompute-velocity`**
- Computes learning velocity from done/expected ratios
- Uses EMA (Exponential Moving Average): `new_v = 0.7*old + 0.3*ratio`
- Clamps to [0.6, 1.5] range
- Parameters: `familyId`, `sinceWeeks?`

### 3. Core Logic

#### Free Gaps Calculator (`computeFreeGaps`)
- Reads `calendar_days_cache` for teach days
- Subtracts blackout periods
- Subtracts existing events
- Returns sorted non-overlapping gaps with available minutes

#### Greedy Packer (`packEventsIntoGaps`)
- Orders needs by priority: (1) hard-due, (2) largest deficit, (3) standard weekly
- Respects constraints:
  - Max 240 minutes per day
  - Max 90 minutes per block
  - Min 30 minutes per block
- Prefers moving existing flexible events before adding new ones

### 4. Frontend Components

#### `BlackoutDialog.js`
- Modal for creating blackout periods
- Child selection (all children or specific child)
- Date range picker with quick buttons ("Today", "Next Week")
- Optional reason field
- Creates blackout and refreshes calendar

#### `RescheduleModal.js`
- Modal for reviewing and approving plan proposals
- Tabs: All | Adds | Moves | Deletes
- Per-change approval toggles
- Quick time editor for each change
- Shows formatted change details (subject, time, duration)
- Footer shows approval count and "Apply" button

#### `RebalanceButton.js`
- Simple button component
- Appears when blackout exists in current week
- Triggers reschedule proposal

### 5. API Client Methods (`lib/apiClient.js`)

- `createBlackout(params)` - Create blackout period
- `proposeReschedule(params)` - Generate plan proposal
- `approvePlan(params)` - Apply approved changes
- `recomputeVelocity(params)` - Update learning velocities

### 6. Integration (`PlannerWeek.js`)

- Added "Add Blackout" button in header
- Shows "Rebalance Week" button when blackout exists
- Wired up `handleRebalance4Weeks` to call `proposeReschedule`
- Opens `RescheduleModal` with proposal
- Auto-detects blackouts in current week
- Refreshes week data after applying changes

## Usage Flow

### 1. Create Blackout Period
1. Click "Add Blackout" in PlannerWeek header
2. Select child (or "All Children")
3. Choose date range
4. Optional: Add reason
5. Click "Create Blackout"
6. System creates overrides and refreshes cache

### 2. Propose Reschedule
1. Click "Rebalance Week" (shown when blackout exists) or use AI menu
2. System computes:
   - Deficits per subject (expected - done, velocity-adjusted)
   - Free gaps in calendar
   - Proposed events to meet deficits
3. Modal opens with proposal (adds/moves/deletes)

### 3. Review & Approve
1. Review changes in tabs (All/Adds/Moves/Deletes)
2. Toggle approval per change
3. Optionally edit times/minutes
4. Click "Apply X Changes"
5. System applies changes atomically
6. Calendar refreshes

### 4. Adaptive Velocity (Automatic)
- Call `recomputeVelocity` weekly (or after plan application)
- System computes done/expected ratios
- Updates `learning_velocity` table
- Future proposals automatically adjust for slower/faster learners

## Key Features

✅ **Auditable** - All proposals stored in `ai_plans` and `ai_plan_changes`
✅ **Reversible** - Changes tracked with before/after states
✅ **Non-destructive** - Proposals don't modify events until approved
✅ **Adaptive** - Learning velocity adjusts pacing over time
✅ **Blackout-aware** - Never schedules on blackout days
✅ **Guardrails** - Respects day caps, block sizes, availability windows
✅ **Idempotent** - Plans can only be applied once

## Files Created/Modified

### New Files:
- `ai_rescheduling_system.sql` - Database schema
- `lib/aiReschedulingRoutes.js` - API routes
- `components/planner/BlackoutDialog.js` - Blackout creation UI
- `components/planner/RescheduleModal.js` - Plan review/approval UI
- `components/planner/RebalanceButton.js` - Rebalance trigger button

### Modified Files:
- `lib/apiRoutes.js` - Added AI rescheduling routes
- `lib/apiClient.js` - Added AI rescheduling methods
- `components/planner/PlannerWeek.js` - Integrated UI components

## Next Steps

1. **Run SQL Migration**: Execute `ai_rescheduling_system.sql` in Supabase SQL Editor
2. **Test Blackout Creation**: Create a blackout period and verify overrides
3. **Test Proposal**: Trigger a rebalance and review the proposal
4. **Test Approval**: Approve changes and verify events are created/updated
5. **Set Up Velocity Updates**: Call `recomputeVelocity` weekly (cron job or manual)

## Notes

- The system uses `calendar_days_cache` for efficient availability lookup
- Blackouts create `schedule_overrides` with `override_kind='off'`
- Proposals are stored in draft status until approved
- Changes can be edited before approval (time adjustments)
- All operations are family-scoped and respect RLS policies

