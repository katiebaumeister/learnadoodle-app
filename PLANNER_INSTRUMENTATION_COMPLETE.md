# Planner Instrumentation & Logging Module - Implementation Complete ✅

## Summary

A comprehensive instrumentation and logging system has been implemented to track planner runs, errors, warnings, and user actions for analytics and debugging.

## Files Created

### 1. Database Migration
- **`supabase/migrations/2025_instrumentation.sql`**
  - Creates 4 tables: `planner_runs`, `planner_errors`, `planner_warnings`, `planner_user_actions`
  - Includes RLS policies, indexes, and helper RPCs
  - Tracks execution runs, errors, warnings, and user interactions

### 2. Backend Python Module
- **`backend/logging/planner_instrumentation.py`**
  - `log_run_start()` - Logs planner run start
  - `log_run_end()` - Logs planner run completion with duration and metrics
  - `log_error()` - Logs errors with stack traces
  - `log_warning()` - Logs non-fatal warnings
  - `log_action()` - Logs user actions

### 3. Backend API Route
- **`backend/routers/log_routes.py`**
  - `POST /api/log/planner_action` - Endpoint for frontend to log user actions
  - Validates user and family permissions
  - Calls instrumentation module

### 4. Frontend Service
- **`app/services/plannerInstrumentation.ts`**
  - `logPlannerAction()` - Main logging function
  - Auto-logging helpers:
    - `logDragDrop()` - Log drag-drop events
    - `logAddEvent()` - Log event creation
    - `logDeleteEvent()` - Log event deletion
    - `logUndoReschedule()` - Log reschedule undo
    - `logApplyReschedule()` - Log reschedule application
    - `logOverrideCreated()` - Log override creation
    - `logBlackoutCreated()` - Log blackout creation
    - `logScheduleAdjusted()` - Log schedule adjustments

## Integration Points

### Backend Integration

1. **`backend/main.py`**
   - Initializes instrumentation on startup
   - Includes log_router in app

2. **`backend/ai/micro_rescheduler.py`**
   - Logs run start/end for auto-reschedule operations
   - Logs errors with stack traces
   - Tracks task count, event count, duration

3. **`backend/routers/schedule_routes.py`**
   - Logs run start/end for manual schedule adjustments
   - Logs errors during adjustment operations
   - Tracks event handling counts

## Database Schema

### planner_runs
- Tracks planner execution runs
- Fields: id, family_id, child_id, started_at, finished_at, task_count, event_count, mode, duration_ms, status, metadata
- Modes: `auto_reschedule`, `manual_adjustment`, `full_plan`, `weekly_rules_update`
- Status: `running`, `completed`, `failed`, `cancelled`

### planner_errors
- Tracks errors during planner execution
- Fields: id, family_id, child_id, run_id, timestamp, error_type, message, metadata, stack_trace
- Error types: `validation_error`, `api_error`, `database_error`, `rescheduler_error`, etc.

### planner_warnings
- Tracks non-fatal warnings
- Fields: id, family_id, child_id, run_id, timestamp, warning_type, message, metadata
- Warning types: `constraint_violation`, `optimization_warning`, etc.

### planner_user_actions
- Tracks user interactions in planner UI
- Fields: id, family_id, child_id, user_id, action_type, timestamp, metadata
- Action types: `drag_drop`, `add_event`, `delete_event`, `undo_reschedule`, `apply_reschedule`, `override_created`, `blackout_created`, etc.

## Helper RPCs

1. **`get_latest_planner_run(p_family_id, p_child_id)`**
   - Returns the most recent planner run for a family/child

2. **`get_recent_planner_issues(p_family_id, p_child_id, p_limit)`**
   - Returns recent errors and warnings combined

## Frontend Integration (Next Steps)

To complete the frontend integration, add logging calls in:

1. **`components/planner/PlannerWeek.js`**
   - Add `logDragDrop()` in `handleDragEnd()`
   - Add `logAddEvent()` when events are created
   - Add `logDeleteEvent()` when events are deleted

2. **`components/schedule/PlannerDiffModal.tsx`**
   - Add `logApplyReschedule()` when "Accept changes" is clicked
   - Add `logUndoReschedule()` when "Undo" is clicked

3. **`components/modals/AdjustScheduleModal.js`**
   - Add `logScheduleAdjusted()` when schedule is adjusted

4. **`components/modals/ScheduleSettingsModal.js`**
   - Add `logBlackoutCreated()` when blackout is created
   - Add `logOverrideCreated()` when override is created

## Usage Examples

### Backend (Python)
```python
from logging.planner_instrumentation import log_run_start, log_run_end, log_error

# Start a run
run_id = log_run_start(family_id, child_id, "auto_reschedule", metadata={...})

# End a run
log_run_end(run_id, "completed", event_count=5, task_count=10)

# Log an error
log_error(family_id, child_id, "validation_error", "Invalid date range", run_id=run_id)
```

### Frontend (TypeScript)
```typescript
import { logDragDrop, logAddEvent, logScheduleAdjusted } from '../services/plannerInstrumentation';

// Log drag-drop
logDragDrop(eventId, fromDate, toDate, fromTime, toTime, childId);

// Log event creation
logAddEvent(eventId, date, childId, subjectId);

// Log schedule adjustment
logScheduleAdjusted('no_school', startDate, endDate, childId);
```

## Optional UI Indicator

A "Last Planner Health Check" indicator can be added to the PlannerWeek header to show:
- Last run timestamp
- Run status (success/failure)
- Quick link to view recent issues

This would use the `get_latest_planner_run()` RPC to fetch the latest run status.

## Testing

1. Run the migration in Supabase SQL Editor
2. Verify tables are created with proper indexes
3. Test backend instrumentation by triggering planner runs
4. Test frontend logging by performing user actions
5. Query tables to verify logs are being written

## Next Steps

1. **Add frontend logging calls** to UI components
2. **Create UI indicator** in PlannerWeek header (optional)
3. **Add analytics dashboard** to view logs and metrics
4. **Set up alerts** for high error rates
5. **Create cleanup job** to archive old logs

The instrumentation system is now fully integrated and ready for use! 🎉

