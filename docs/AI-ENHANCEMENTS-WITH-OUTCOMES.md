# AI Enhancements with Outcomes & Attendance Data

## Overview

This document describes how outcomes and attendance data are now integrated into AI features to provide more intelligent, adaptive scheduling and progress summaries.

## Database Enhancements

### Enhanced `get_progress_snapshot` RPC

**File:** `2025-11-18_enhance_progress_snapshot_with_outcomes.sql`

The RPC now includes:
- `avg_rating` - Average rating (1-5) from outcomes for done events
- `recent_strengths` - Array of recent strength tags (from last 10 outcomes)
- `recent_struggles` - Array of recent struggle tags (from last 10 outcomes)

**Query Logic:**
- Aggregates outcomes by child + subject
- Only includes outcomes from events in the date range
- Deduplicates tags across multiple outcomes
- Returns empty arrays if no outcomes exist

## AI Feature Enhancements

### 1. Summarize Progress (`/api/ai/summarize_progress`)

**Enhancement:** Now uses LLM to generate natural language summaries that reference strengths/struggles.

**LLM Function:** `llm_summarize_progress(context)`

**Input:**
- `snapshot_rows` - Enhanced rows from `get_progress_snapshot` with outcomes
- `range_start`, `range_end` - Date range

**Output:** Natural language summary string

**Example Output:**
```
Math: 8/10 sessions completed. Average rating 4.2/5. Trending up but repeated struggles in time management. Strengths: strong problem-solving, worked independently.

Reading: 6/8 sessions completed. Average rating 3.8/5. Struggles: concept confusion, needed more support.
```

**Fallback:** If LLM fails, falls back to simple text format that still includes strengths/struggles.

### 2. Pack Week (`/api/ai/pack_week`)

**Enhancement:** Reads recent struggles and adjusts scheduling strategy.

**Planning Context Enhancement:**
- `load_planning_context` now queries `event_outcomes` for struggles from last 30 days
- Groups struggles by `child_id:subject_id` key
- Deduplicates struggles per child/subject

**LLM Prompt Update:**
- Added constraint: "If recent_struggles are provided for a child/subject, prefer shorter, more frequent sessions (e.g., 30-45 min instead of 60 min)"

**Behavior:**
- If child has struggles with "fractions" in Math, AI will schedule shorter Math sessions
- More frequent sessions help reinforce concepts where child struggles
- Still respects weekly targets from year plans

**Example Context:**
```json
{
  "recent_struggles": {
    "child-uuid:math-uuid": ["fractions", "time management"],
    "child-uuid:reading-uuid": ["comprehension"]
  }
}
```

### 3. Catch Up (`/api/ai/catch_up`)

**Enhancement:** Same adaptive scheduling based on struggles.

**LLM Prompt Update:**
- Same constraint as pack_week: prefer shorter sessions for subjects with struggles

**Behavior:**
- When rescheduling missed events, AI considers recent struggles
- If a missed Math event had struggles tagged, reschedule as shorter sessions
- Helps prevent repeating the same struggles

## Implementation Details

### Backend Changes

1. **`backend/llm.py`:**
   - Added `llm_summarize_progress()` function
   - Updated `llm_pack_week()` prompt to include struggles constraint
   - Updated `llm_catch_up()` prompt to include struggles constraint

2. **`backend/routers/util.py`:**
   - Enhanced `load_planning_context()` to query `event_outcomes` for struggles
   - Returns `recent_struggles` dictionary in context

3. **`backend/routers/ai_routes.py`:**
   - Updated `summarize_progress` to use LLM with outcomes data
   - Updated `pack_week` to include `recent_struggles` in LLM context
   - Updated `catch_up` to include `recent_struggles` in LLM context

### Database Migration

**Run:** `2025-11-18_enhance_progress_snapshot_with_outcomes.sql`

This updates the `get_progress_snapshot` function to include outcomes data.

## Usage Examples

### Example 1: Adaptive Pack Week

**Scenario:** Child has struggled with "fractions" in Math (tagged in recent outcomes)

**Before:** AI schedules 60-minute Math sessions

**After:** AI schedules 30-45 minute Math sessions, more frequently

**Result:** More focused, shorter sessions help reinforce fractions without overwhelming the child

### Example 2: Enhanced Progress Summary

**Before:**
```
Math: 8/10 done, 2 missed, 0 upcoming
```

**After:**
```
Math: 8/10 sessions completed. Average rating 4.2/5. Trending up but repeated struggles in time management. Strengths: strong problem-solving, worked independently.
```

**Result:** More actionable insights for parents

### Example 3: Adaptive Catch Up

**Scenario:** Missed Math events need rescheduling, child has "fractions" struggles

**Before:** Reschedules as 60-minute sessions

**After:** Reschedules as 30-45 minute sessions, split across multiple days

**Result:** Better catch-up strategy that addresses learning gaps

## Future Enhancements

### Analytics Dashboard

**Planned Features:**
- Subject performance trends (avg rating over time)
- Common struggles by subject
- Strengths patterns
- Attendance rates vs. performance correlation

### AI Recommendations

**Planned Features:**
- "Based on recent struggles with fractions, consider adding extra practice sessions"
- "Child excels in problem-solving—consider advanced topics"
- "Attendance rate is 90% but ratings declining—check for burnout"

### Progress Reports

**Planned Features:**
- Weekly/monthly reports aggregating outcomes by subject
- Trend analysis (improving/declining)
- Recommendations based on patterns

## Testing

### Test Scenarios

1. **Create outcomes with struggles:**
   - Mark event as done
   - Add outcome with struggles: ["fractions", "time management"]
   - Run "Pack Week" → verify shorter sessions scheduled

2. **Test progress summary:**
   - Create multiple outcomes with ratings and struggles
   - Run "Summarize Progress" → verify LLM mentions struggles

3. **Test catch up:**
   - Mark events as missed
   - Ensure child has recent struggles
   - Run "Catch Up" → verify adaptive rescheduling

## Notes

- Struggles are queried from last 30 days (configurable)
- Only struggles from completed events with outcomes are considered
- LLM prompts are designed to be adaptive but not overly restrictive
- Falls back gracefully if outcomes data is unavailable

