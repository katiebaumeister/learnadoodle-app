# Phase 2: LLM Implementation Complete

## Summary

All LLM stubs have been replaced with real OpenAI API calls. The system now uses GPT-4o to intelligently pack weeks and reschedule missed events.

---

## Implementation Details

### 1. LLM Helper Functions (`backend/llm.py`)

**Added two new functions:**

- **`llm_pack_week(context)`**
  - Input: Week start, children, year plans, availability, existing events, blackouts, required minutes
  - Output: JSON with `events` array and `rationale` array
  - Model: `gpt-4o` (deterministic, temperature=0.0)
  - Constraints: Per-day caps, preferred block sizes, blackout avoidance, year plan targets

- **`llm_catch_up(context)`**
  - Input: Missed events, future windows, existing events, blackouts
  - Output: JSON with `rescheduled` array and `rationale` array
  - Model: `gpt-4o` (deterministic, temperature=0.0)
  - Constraints: Find slots in next 2-4 weeks, avoid conflicts, preserve duration, balance across days

Both functions include:
- Retry logic with exponential backoff (`@backoff.on_exception`)
- JSON parsing with fallback regex extraction
- Error handling and logging

---

### 2. Pack Week Endpoint (`/api/ai/pack_week`)

**Full Implementation:**

1. **Context Building:**
   - Loads planning context (availability, events, blackouts, required minutes) via `load_planning_context()`
   - Falls back to `get_week_view` RPC if `load_planning_context` fails
   - Queries active year plans that overlap with the week
   - Builds comprehensive LLM context

2. **LLM Call:**
   - Calls `llm_pack_week()` with full context
   - Handles LLM errors gracefully (returns 500 with error message)

3. **Event Creation:**
   - Parses LLM response to extract events
   - Creates events in `events` table with:
     - `source = 'ai'` (matches constraint)
     - Calculated `end_ts` from `start_ts + minutes`
     - Status `'scheduled'`
   - Continues on individual event creation errors (logs but doesn't fail entire operation)

4. **Cache Refresh:**
   - Calls `refresh_calendar_days_cache` RPC for the week
   - Logs errors but doesn't fail if cache refresh fails

5. **Response:**
   - Returns created events with IDs, titles, times
   - Includes rationale from LLM
   - Logs task completion to `ai_task_runs`

---

### 3. Catch Up Endpoint (`/api/ai/catch_up`)

**Full Implementation:**

1. **Context Building:**
   - Loads missed events by IDs
   - Extracts child IDs from missed events
   - Loads planning context for next 4 weeks
   - Falls back to `get_week_view` if `load_planning_context` fails
   - Queries existing scheduled events in future window

2. **LLM Call:**
   - Calls `llm_catch_up()` with missed events, future windows, existing events, blackouts
   - Handles LLM errors gracefully

3. **Event Updates:**
   - Parses LLM response to extract rescheduling moves
   - Updates events with new `start_ts` and `end_ts`
   - Resets status from `'missed'`/`'overdue'` to `'scheduled'`
   - Continues on individual update errors

4. **Cache Refresh:**
   - Calls `refresh_calendar_days_cache` RPC for the 4-week window
   - Logs errors but doesn't fail

5. **Response:**
   - Returns rescheduled events with new times and reasons
   - Includes rationale from LLM
   - Logs task completion

---

## Error Handling

**Graceful Degradation:**
- If `load_planning_context` fails (e.g., `blackout_periods` table doesn't exist), falls back to `get_week_view` RPC
- If LLM call fails, returns 500 with clear error message
- If individual event creation/update fails, logs error and continues with others
- If cache refresh fails, logs warning but doesn't fail the operation

**Logging:**
- All errors logged to `ai_task_runs` table
- Structured logging via `log_event()` for debugging
- Task status tracked: `pending` → `running` → `succeeded`/`failed`

---

## Token Usage

**Estimated Costs (per call):**
- **Pack Week**: ~5,000-15,000 input tokens, ~500-2,000 output tokens
  - Context includes: availability windows, existing events, year plans, blackouts
  - Cost: ~$0.05-0.20 per call (gpt-4o pricing)

- **Catch Up**: ~3,000-10,000 input tokens, ~300-1,500 output tokens
  - Context includes: missed events, future windows, existing events
  - Cost: ~$0.03-0.15 per call

**Rate Limiting:**
- Already implemented via `rate_limiter` dependency (60 requests/minute)
- LLM functions have retry logic (max 3 attempts with exponential backoff)

---

## Testing Checklist

- [ ] Pack Week: Creates events based on year plan targets
- [ ] Pack Week: Respects availability windows
- [ ] Pack Week: Avoids blackout days
- [ ] Pack Week: Doesn't create duplicates
- [ ] Pack Week: Refreshes calendar cache
- [ ] Catch Up: Reschedules missed events to future slots
- [ ] Catch Up: Avoids conflicts with existing events
- [ ] Catch Up: Preserves event duration
- [ ] Catch Up: Refreshes calendar cache
- [ ] Error handling: Graceful fallback if `load_planning_context` fails
- [ ] Error handling: Clear error messages if LLM fails
- [ ] Error handling: Partial success if some events fail

---

## Optional: Weekly Cron Email

**Status:** Documented but not implemented (see `PHASE2-CRON-EMAIL.md`)

**What's Needed:**
1. Supabase Edge Function (Deno) that runs weekly
2. Email service integration (SendGrid or Resend)
3. Cron schedule configuration in Supabase Dashboard
4. Email template design
5. Unsubscribe mechanism

**Implementation Estimate:** 2-4 hours

The `summarize_progress` endpoint is already working and can be called from the cron job.

---

## Files Modified

**Backend:**
- `backend/llm.py` - Added `llm_pack_week()` and `llm_catch_up()` functions
- `backend/routers/ai_routes.py` - Replaced stubs with full LLM implementation

**No Frontend Changes Required** - The modals already handle the responses correctly.

---

## Next Steps

1. **Test the endpoints** with real data
2. **Monitor token usage** and costs
3. **Tune LLM prompts** based on results
4. **Implement weekly cron email** (optional)
5. **Add rate limiting per family** (if needed)

---

## Notes

- LLM calls are **deterministic** (temperature=0.0) - same input = same output
- Events are created **immediately** (not preview-only) - consider adding preview mode in future
- Cache refresh happens **after** events are created/updated
- Task logging allows **audit trail** of all AI operations

