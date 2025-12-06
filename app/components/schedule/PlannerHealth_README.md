# Planner Health Engine

Complete health monitoring system for schedule quality and optimization opportunities.

## Components

### Backend
- **`backend/services/planner_health.py`**: Core health computation engine
- **`backend/routers/schedule_routes.py`**: `/api/schedule/health` endpoint

### Frontend
- **`app/services/plannerHealth.ts`**: Health normalization and utilities
- **`app/state/usePlannerHealthStore.ts`**: State management store
- **`app/components/schedule/PlannerHealthPanel.tsx`**: UI component

## Setup

### 1. Wrap App with Provider

In your root component (e.g., `WebLayout.js`):

```tsx
import { PlannerHealthProvider } from './app/state/usePlannerHealthStore';
import PlannerHealthPanel from './app/components/schedule/PlannerHealthPanel';

function App() {
  return (
    <PlannerHealthProvider>
      {/* Your app components */}
      
      {/* Use the panel anywhere */}
      <PlannerHealthPanel childId={selectedChildId} familyId={familyId} />
    </PlannerHealthProvider>
  );
}
```

### 2. Use in Components

```tsx
import { usePlannerHealthStore } from '../app/state/usePlannerHealthStore';

function MyComponent() {
  const { health, loading, fetchHealth } = usePlannerHealthStore();
  
  useEffect(() => {
    fetchHealth('child-id'); // Optional: omit for family-level health
  }, []);
  
  if (loading) return <Loading />;
  if (!health) return <Empty />;
  
  return <div>Health Score: {health.score}</div>;
}
```

## Metrics Computed

1. **daily_load_balance**: Variance in daily workload (0-1, higher = better balance)
2. **heavy_subject_limit_violations**: Days where heavy subject limits exceeded
3. **cognitive_load_mismatches**: Events with high cognitive load in low-energy periods
4. **theme_alignment_score**: How well events align with day themes (0-1)
5. **backlog_pressure_score**: Pressure from backlog items (0-1, lower = better)
6. **overdue_task_count**: Number of overdue tasks/events
7. **reschedule_rate_7_days**: Rate of rescheduling in last 7 days (0-1)
8. **unavailability_density**: Density of unavailable days (0-1)
9. **override_frequency**: Frequency of schedule overrides (0-1)
10. **blackout_frequency**: Frequency of blackout days (0-1)
11. **catch_up_mode_count**: Number of items in catch-up mode

## API

### GET `/api/schedule/health?child=<child_id>`

Returns:
```json
{
  "score": 85,
  "warnings": [
    "5 overdue tasks need attention",
    "Backlog is under high pressure"
  ],
  "insights": [
    "Daily workload is well-balanced across the week",
    "Schedule is stable with low rescheduling"
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

## Health Score Calculation

The overall score (0-100) is computed from weighted metrics:
- 80-100: Excellent
- 60-80: Good
- 40-60: Fair
- 0-40: Needs Attention

## Features

- ✅ Real-time health computation
- ✅ Warnings and insights generation
- ✅ Expandable metrics grid
- ✅ Auto-refresh capability
- ✅ Child-specific or family-level health
- ✅ Clean, pastel Learnadoodle UI

## Usage Examples

### Family-Level Health
```tsx
<PlannerHealthPanel familyId={familyId} />
```

### Child-Specific Health
```tsx
<PlannerHealthPanel childId={childId} familyId={familyId} />
```

### Manual Refresh
```tsx
const { refreshHealth } = usePlannerHealthStore();

<button onClick={() => refreshHealth(childId)}>Refresh Health</button>
```

