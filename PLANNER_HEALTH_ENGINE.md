# Planner Health Engine - Complete Implementation

## Overview

A comprehensive health monitoring system for schedule quality, optimization opportunities, and proactive warnings.

## Files Created

### Backend
1. **`backend/services/planner_health.py`** (728 lines)
   - Core health computation engine
   - 11 metric calculations
   - Warning and insight generation
   - Score normalization (0-100)

2. **`backend/routers/schedule_routes.py`** (updated)
   - Added `GET /api/schedule/health?child=<id>` endpoint

3. **`backend/services/__init__.py`** (created)
   - Services module marker

### Frontend
1. **`app/services/plannerHealth.ts`** (141 lines)
   - Health metrics normalization
   - Warning/insight generators
   - Score computation utilities

2. **`app/state/usePlannerHealthStore.ts`** (88 lines)
   - React Context store
   - `fetchHealth()`, `refreshHealth()`, `setHealth()`
   - Loading and error states

3. **`app/components/schedule/PlannerHealthPanel.tsx`** (438 lines)
   - Full UI component
   - Score display with color coding
   - Warnings and insights sections
   - Expandable metrics grid
   - Clean Learnadoodle styling

4. **`app/components/schedule/PlannerHealth_README.md`**
   - Integration guide

## Metrics Computed

1. **daily_load_balance** (0-1): Workload variance across days
2. **heavy_subject_limit_violations** (count): Days exceeding heavy subject limits
3. **cognitive_load_mismatches** (count): High-load subjects in low-energy periods
4. **theme_alignment_score** (0-1): Alignment with day themes
5. **backlog_pressure_score** (0-1): Pressure from backlog items
6. **overdue_task_count** (count): Overdue tasks/events
7. **reschedule_rate_7_days** (0-1): Rescheduling frequency
8. **unavailability_density** (0-1): Density of unavailable days
9. **override_frequency** (0-1): Schedule override frequency
10. **blackout_frequency** (0-1): Blackout day frequency
11. **catch_up_mode_count** (count): Items in catch-up mode

## Integration

### Step 1: Add Provider to WebLayout

```javascript
import { PlannerHealthProvider } from '../app/state/usePlannerHealthStore';

// Inside WebLayout component, wrap with provider:
<PlannerHealthProvider>
  {/* existing content */}
</PlannerHealthProvider>
```

### Step 2: Add Panel Component

```javascript
import PlannerHealthPanel from '../app/components/schedule/PlannerHealthPanel';

// Use in any view:
<PlannerHealthPanel 
  childId={selectedChildId}  // Optional
  familyId={familyId}
  onRefresh={() => {/* refresh callback */}}
/>
```

### Step 3: Use Store in Components

```javascript
import { usePlannerHealthStore } from '../app/state/usePlannerHealthStore';

const { health, loading, fetchHealth } = usePlannerHealthStore();

useEffect(() => {
  fetchHealth(childId); // Optional child ID
}, [childId]);
```

## API Endpoint

**GET** `/api/schedule/health?child=<child_id>`

**Query Parameters:**
- `child` (optional): Child ID for child-specific health

**Response:**
```json
{
  "score": 85,
  "warnings": [
    "5 overdue tasks need attention"
  ],
  "insights": [
    "Daily workload is well-balanced"
  ],
  "metrics": {
    "daily_load_balance": 0.85,
    "heavy_subject_limit_violations": 2,
    "cognitive_load_mismatches": 1,
    "theme_alignment_score": 0.75,
    "backlog_pressure_score": 0.3,
    "overdue_task_count": 3,
    "reschedule_rate_7_days": 0.15,
    "unavailability_density": 0.1,
    "override_frequency": 0.05,
    "blackout_frequency": 0.08,
    "catch_up_mode_count": 0
  }
}
```

## Features

✅ **Comprehensive Metrics**: 11 health indicators
✅ **Intelligent Warnings**: Proactive alerts for issues
✅ **Actionable Insights**: Positive reinforcement
✅ **Visual Score Display**: Large, color-coded health score
✅ **Expandable Metrics**: Detailed metric grid
✅ **Auto-refresh**: Built-in refresh capability
✅ **Child or Family Level**: Optional child-specific health
✅ **Clean UI**: Pastel Learnadoodle design system
✅ **Loading States**: Graceful loading and error handling

## Score Interpretation

- **80-100**: Excellent - Schedule is well-optimized
- **60-80**: Good - Minor improvements possible
- **40-60**: Fair - Several areas need attention
- **0-40**: Needs Attention - Significant issues detected

## Dependencies

### Required Database Tables/Columns:
- `events` table
- `calendar_days_cache` table
- `backlog` or `backlog_items` table
- `subject` table
- `children` table (with optional cognitive load columns)
- `day_themes` table (optional)
- `subject_cognitive_load` table (optional)
- `schedule_overrides` table
- `blackout_periods` table

All tables are handled gracefully if they don't exist - the engine will simply skip those metrics.

## Next Steps

1. Add `PlannerHealthProvider` to `WebLayout.js`
2. Place `PlannerHealthPanel` in Planner or Dashboard view
3. Test with real data
4. Optionally add health score badge to Planner header

## Testing

To test the health endpoint:

```bash
curl -X GET "http://localhost:8000/api/schedule/health?child=<child_id>" \
  -H "Authorization: Bearer <token>"
```

The frontend will automatically fetch and display health data when the panel is mounted.

