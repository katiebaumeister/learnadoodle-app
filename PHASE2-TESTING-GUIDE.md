# Phase 2 Testing Guide

## Quick Test Checklist

### ✅ Prerequisites
- [ ] Backend server running (`cd backend && python -m uvicorn main:app --reload`)
- [ ] Frontend running
- [ ] Database migrations applied (especially `2025-11-17_ai_task_runs_and_progress_snapshot.sql`)
- [ ] At least one child in your family
- [ ] At least one year plan created (optional but recommended for pack_week)

---

## 1. Summarize Progress (`/api/ai/summarize_progress`)

### Test via UI:
1. **Open Planner** → Click **"Summarize Progress"** button in right toolbar
2. **Modal opens** with date range picker
3. **Set dates:**
   - Start: 7 days ago
   - End: Today
4. **Click "Generate Summary"**
5. **Expected:** 
   - Loading spinner appears
   - Summary text displays showing progress by child/subject
   - Format: "Child Name: Subject: X/Y done, Z missed, W upcoming"

### Test via API (curl):
```bash
curl -X POST http://localhost:8000/api/ai/summarize_progress \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "rangeStart": "2025-11-10",
    "rangeEnd": "2025-11-17"
  }'
```

### What to Verify:
- ✅ Summary loads without errors
- ✅ Shows correct child names
- ✅ Shows correct subject names
- ✅ Counts match actual events in database
- ✅ Task logged in `ai_task_runs` table

### Edge Cases:
- [ ] Empty date range (no events) → Shows "No events found"
- [ ] Future dates → Shows upcoming events count
- [ ] Invalid date format → Shows error message

---

## 2. Pack Week (`/api/ai/pack_week`)

### Prerequisites:
- Have at least one **active year plan** with subject targets
- Year plan should overlap with the week you're packing

### Test via UI:
1. **Open Planner** → Click **"Pack Week"** button in right toolbar
2. **Modal opens** with week start date picker
3. **Set week start** to next Monday (or any Monday)
4. **Optionally select children** (or leave empty for all)
5. **Click "Pack Week"**
6. **Expected:**
   - Loading spinner appears
   - LLM analyzes context (may take 5-15 seconds)
   - Events appear in result section
   - Notes show rationale

### Test via API:
```bash
curl -X POST http://localhost:8000/api/ai/pack_week \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "weekStart": "2025-11-24",
    "childIds": null
  }'
```

### What to Verify:
- ✅ Events created in database
- ✅ Events appear on calendar immediately
- ✅ Events respect availability windows
- ✅ Events avoid blackout days
- ✅ Events meet year plan targets (if year plan exists)
- ✅ Calendar cache refreshed
- ✅ Task logged in `ai_task_runs` table

### Check Database:
```sql
-- Verify events were created
SELECT id, title, start_ts, end_ts, source, status
FROM events
WHERE source = 'ai'
  AND start_ts >= '2025-11-24'::date
  AND start_ts < '2025-11-24'::date + interval '7 days'
ORDER BY start_ts;

-- Check task run
SELECT id, kind, status, result, error
FROM ai_task_runs
WHERE kind = 'pack_week'
ORDER BY created_at DESC
LIMIT 1;
```

### Edge Cases:
- [ ] No year plan → LLM still creates events (may be fewer)
- [ ] Week with blackouts → Events avoid blackout days
- [ ] Week already packed → May create duplicates (check for conflicts)
- [ ] No children selected → Packs for all children
- [ ] LLM API error → Shows error message, doesn't crash

---

## 3. Catch Up (`/api/ai/catch_up`)

### Prerequisites:
- Have at least one **missed or overdue event** in the last 30 days

### Create Test Data:
```sql
-- Create a missed event for testing
INSERT INTO events (family_id, child_id, title, start_ts, end_ts, status, source)
VALUES (
  'YOUR_FAMILY_ID',
  'YOUR_CHILD_ID',
  'Test Missed Event',
  NOW() - interval '2 days',
  NOW() - interval '2 days' + interval '60 minutes',
  'missed',
  'manual'
);
```

### Test via UI:
1. **Open Planner** → Click **"Catch Up"** button in right toolbar
2. **Modal opens** showing missed events from last 30 days
3. **Select one or more events** (checkboxes)
4. **Click "Catch Up (X selected)"**
5. **Expected:**
   - Loading spinner appears
   - LLM analyzes future windows (may take 5-15 seconds)
   - Events rescheduled to future dates
   - Notes show rationale

### Test via API:
```bash
curl -X POST http://localhost:8000/api/ai/catch_up \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "missedEventIds": ["EVENT_ID_1", "EVENT_ID_2"]
  }'
```

### What to Verify:
- ✅ Events updated with new start_ts and end_ts
- ✅ Status changed from `missed`/`overdue` to `scheduled`
- ✅ New times are in the future (next 2-4 weeks)
- ✅ New times don't conflict with existing events
- ✅ New times respect availability windows
- ✅ Calendar cache refreshed
- ✅ Task logged in `ai_task_runs` table

### Check Database:
```sql
-- Verify events were rescheduled
SELECT id, title, start_ts, end_ts, status
FROM events
WHERE id IN ('EVENT_ID_1', 'EVENT_ID_2');

-- Check task run
SELECT id, kind, status, result, error
FROM ai_task_runs
WHERE kind = 'catch_up'
ORDER BY created_at DESC
LIMIT 1;
```

### Edge Cases:
- [ ] No missed events → Shows empty state message
- [ ] All future slots full → LLM may return fewer rescheduled events
- [ ] Event already rescheduled → Updates to new time
- [ ] LLM API error → Shows error message, doesn't crash

---

## 4. Daily Insights Card

### Test:
1. **Go to Home screen**
2. **Look for "Daily insights" card**
3. **Expected:**
   - Shows loading spinner initially
   - Automatically loads AI summary for last 7 days
   - Displays formatted progress summary
   - Falls back to default text if API fails

### What to Verify:
- ✅ Summary loads automatically on page load
- ✅ Summary updates when navigating between children
- ✅ Loading state shows spinner
- ✅ Error state doesn't break the page

---

## 5. Integration Tests

### Test Flow: Pack Week → View Calendar → Catch Up
1. **Pack a week** → Events appear on calendar
2. **Mark some events as missed** (manually or wait)
3. **Use Catch Up** → Events rescheduled
4. **Verify calendar updates** automatically

### Test Flow: Year Plan → Pack Week
1. **Create a year plan** with subject targets (e.g., Math 3 hr/week)
2. **Pack a week** that overlaps with year plan
3. **Verify** events created match year plan targets

### Test Flow: Summarize → Pack → Summarize Again
1. **Summarize progress** for last week
2. **Pack next week** with new events
3. **Summarize progress** again (should include new events)

---

## 6. Error Scenarios

### Test LLM Failure:
1. **Temporarily break OpenAI API** (wrong key or network issue)
2. **Try Pack Week** → Should show error message, not crash
3. **Try Catch Up** → Should show error message, not crash
4. **Check `ai_task_runs`** → Status should be `failed` with error message

### Test Missing Context:
1. **Pack week without year plan** → Should still work (may create fewer events)
2. **Catch up with no future availability** → Should handle gracefully
3. **Summarize with no events** → Should show "No events found"

### Test Database Errors:
1. **Try to pack week with invalid child ID** → Should show error
2. **Try to catch up with non-existent event ID** → Should show 404

---

## 7. Performance Tests

### Test Token Usage:
- **Check OpenAI dashboard** for token usage
- **Pack Week**: Should use ~5k-15k input tokens
- **Catch Up**: Should use ~3k-10k input tokens

### Test Response Times:
- **Pack Week**: 5-15 seconds (LLM call + event creation)
- **Catch Up**: 5-15 seconds (LLM call + event updates)
- **Summarize Progress**: < 1 second (no LLM, just RPC)

### Test Cache Refresh:
- **After Pack Week**: Calendar should update immediately
- **After Catch Up**: Calendar should update immediately
- **Check `calendar_days_cache`** table for updated entries

---

## 8. Database Verification

### Check Task Runs:
```sql
-- View all AI task runs
SELECT 
  id,
  kind,
  status,
  created_at,
  started_at,
  completed_at,
  error,
  result->>'notes' as notes
FROM ai_task_runs
ORDER BY created_at DESC
LIMIT 10;
```

### Check Events Created:
```sql
-- View AI-created events
SELECT 
  id,
  title,
  start_ts,
  end_ts,
  source,
  status,
  child_id
FROM events
WHERE source = 'ai'
ORDER BY created_at DESC
LIMIT 20;
```

### Check Progress Snapshot:
```sql
-- Test the RPC directly
SELECT *
FROM get_progress_snapshot(
  'YOUR_FAMILY_ID'::uuid,
  '2025-11-10'::date,
  '2025-11-17'::date
);
```

---

## 9. UI/UX Tests

### Modal Behavior:
- [ ] Modals open smoothly
- [ ] Modals close on X button
- [ ] Modals close on overlay click
- [ ] Modals don't break page scrolling
- [ ] Loading states show spinners
- [ ] Error messages are user-friendly

### Toolbar Buttons:
- [ ] All three AI buttons visible in Planner right toolbar
- [ ] Buttons have correct icons
- [ ] Buttons show tooltips on hover
- [ ] Buttons trigger correct modals

### Daily Insights:
- [ ] Card appears on Home screen
- [ ] Summary loads automatically
- [ ] Summary is readable and formatted
- [ ] Loading state doesn't break layout

---

## 10. Regression Tests

### Verify Existing Features Still Work:
- [ ] Year plan wizard still works
- [ ] Calendar views (Month/Week/Day/Board) still work
- [ ] Event creation/editing still works
- [ ] Rebalance modal still works
- [ ] Heatmap still works

### Verify No Breaking Changes:
- [ ] No console errors
- [ ] No white screens
- [ ] No database constraint violations
- [ ] No API 500 errors (except intentional LLM failures)

---

## Common Issues & Fixes

### Issue: "LLM call failed: Invalid API key"
**Fix:** Check `OPENAI_API_KEY` in backend `.env` file

### Issue: "No children found for this family"
**Fix:** Ensure you have at least one child with `archived = false`

### Issue: "load_planning_context failed"
**Fix:** This is handled gracefully - falls back to `get_week_view` RPC

### Issue: "Events not appearing on calendar"
**Fix:** 
1. Check `refresh_calendar_days_cache` RPC exists
2. Manually refresh calendar (reload page)
3. Check events were actually created in database

### Issue: "Pack Week creates no events"
**Possible causes:**
- No year plan with targets
- No availability windows
- All days are blackouts
- LLM returned empty events array

**Debug:** Check `ai_task_runs.result` for LLM response

---

## Success Criteria

✅ **All three endpoints work end-to-end**
✅ **Events created/updated correctly**
✅ **Calendar refreshes automatically**
✅ **Error handling is graceful**
✅ **Task logging works**
✅ **UI modals are functional**
✅ **Daily Insights loads automatically**

---

## Next Steps After Testing

1. **Monitor token usage** in OpenAI dashboard
2. **Review LLM outputs** - tune prompts if needed
3. **Check `ai_task_runs` table** for error patterns
4. **Gather user feedback** on event quality
5. **Consider adding preview mode** before applying changes

