# Add-Remove Math Scheduling Rules - Testing Guide

## 🎯 **Acceptance Criteria Testing**

This document provides step-by-step testing instructions to verify the Add-Remove math scheduling system works correctly.

---

## **Prerequisites**

1. **Run the SQL Migration**:
   ```sql
   -- Execute in Supabase SQL Editor
   \i 20251018_add_remove_rules.sql
   ```

2. **Update Frontend Components**:
   - Replace `ScheduleRulesManager.js` with `ScheduleRulesManagerNew.js`
   - Add `AddRuleForm.js` component
   - Update imports in `WebContent.js`

---

## **Test 1: Basic Add-Remove Math**

### **Setup**
1. Go to **Planner → Schedule Rules**
2. Ensure **Specificity Cascade** is **OFF** (default)

### **Steps**
1. **Create Teach Rule**:
   - Click "Add Rule"
   - Title: "Max's School Days"
   - Rule Type: **"+ Add Teaching Time"**
   - Child: Select Max
   - Days: Mon-Fri
   - Time: 9:00 AM - 3:00 PM
   - Click "Save Rule"

2. **Create Off Rule**:
   - Click "Add Rule"
   - Title: "Max's Friday Break"
   - Rule Type: **"− Block Time (Off)"**
   - Child: Select Max
   - Days: Friday only
   - Time: 12:00 PM - 3:00 PM
   - Click "Save Rule"

3. **Check Preview**:
   - Go to **Preview** tab
   - Select Max as child
   - Look at Friday's availability

### **Expected Result**
- **Monday-Thursday**: 9:00 AM - 3:00 PM (full teaching time)
- **Friday**: 9:00 AM - 12:00 PM (teaching time minus blocked time)
- **Saturday-Sunday**: OFF (no rules)

### **Verification**
```sql
-- Check cache computation
SELECT date, day_status, start_time, end_time, teach_minutes
FROM calendar_days_cache 
WHERE child_id = 'max-uuid' 
  AND date >= CURRENT_DATE 
  AND date <= CURRENT_DATE + INTERVAL '7 days'
ORDER BY date;
```

---

## **Test 2: Specificity Cascade**

### **Setup**
1. Go to **Planner → Schedule Rules**
2. Turn **Specificity Cascade** **ON**

### **Steps**
1. **Create Family Off Rule**:
   - Click "Add Rule"
   - Title: "Family Quiet Time"
   - Rule Type: **"− Block Time (Off)"**
   - Apply To: **Entire Family**
   - Days: Tuesday
   - Time: 9:00 AM - 11:00 AM
   - Click "Save Rule"

2. **Create Child Teach Rule**:
   - Click "Add Rule"
   - Title: "Max's Tuesday Tutoring"
   - Rule Type: **"+ Add Teaching Time"**
   - Child: Select Max
   - Days: Tuesday
   - Time: 9:00 AM - 12:00 PM
   - Click "Save Rule"

3. **Check Preview**:
   - Go to **Preview** tab
   - Select Max as child
   - Look at Tuesday's availability

### **Expected Result**
- **With Cascade ON**: Max gets 11:00 AM - 12:00 PM (child rule beats family rule, but Off beats Teach within same level)
- **With Cascade OFF**: Max gets 9:00 AM - 12:00 PM (simple Add-Remove math)

### **Verification**
```sql
-- Check family settings
SELECT specificity_cascade FROM family_settings WHERE family_id = 'family-uuid';

-- Check effective availability
SELECT date, day_status, start_time, end_time
FROM calendar_days_cache 
WHERE child_id = 'max-uuid' 
  AND date = CURRENT_DATE + INTERVAL '1 day'; -- Tuesday
```

---

## **Test 3: Overrides Take Precedence**

### **Setup**
1. Ensure you have a Teach rule for Max (Mon-Fri 9-3)
2. Go to **Overrides** tab

### **Steps**
1. **Add Override**:
   - Click "Add Override"
   - Date: Tomorrow
   - Type: **Late Start**
   - Start Time: 11:00 AM
   - Click "Save"

2. **Check Preview**:
   - Go to **Preview** tab
   - Select Max as child
   - Look at tomorrow's availability

### **Expected Result**
- **Tomorrow**: 11:00 AM - 3:00 PM (override applied after Add-Remove math)
- **Other days**: 9:00 AM - 3:00 PM (normal rule)

### **Verification**
```sql
-- Check overrides
SELECT * FROM schedule_overrides 
WHERE scope_id = 'max-uuid' 
  AND date = CURRENT_DATE + INTERVAL '1 day';

-- Check final availability
SELECT date, day_status, start_time, end_time
FROM calendar_days_cache 
WHERE child_id = 'max-uuid' 
  AND date = CURRENT_DATE + INTERVAL '1 day';
```

---

## **Test 4: Soft Warnings**

### **Setup**
1. Create a Teach rule: Max, Mon-Fri, 9-3
2. Create an Off rule: Max, Fri, 12-3

### **Steps**
1. **Try to Create Conflicting Rule**:
   - Click "Add Rule"
   - Title: "Max's Friday Morning"
   - Rule Type: **"+ Add Teaching Time"**
   - Child: Select Max
   - Days: Friday
   - Time: 10:00 AM - 2:00 PM
   - Click "Save Rule"

### **Expected Result**
- **Warning Dialog**: "Heads up: 1 existing rule(s) have time that may be masked by Off rules"
- **Options**: Cancel or Save Anyway
- **If Save Anyway**: Rule saves but some time may be masked

### **Verification**
```sql
-- Check conflict detection
SELECT * FROM detect_rule_conflicts('family-uuid');
```

---

## **Test 5: AI Planner Integration**

### **Setup**
1. Ensure you have Teach/Off rules set up
2. Go to **Planner → AI Planner**

### **Steps**
1. **Generate AI Plan**:
   - Select Max as child
   - Set date range: Next week
   - Add a goal: Math, 180 min/week
   - Click "Generate Plan"

2. **Check Results**:
   - Review proposed events
   - Verify they only fall within available time slots
   - Check that blocked times are avoided

### **Expected Result**
- **AI only schedules in available slots** (respects Add-Remove math)
- **No events in blocked times** (respects Off rules)
- **Events respect overrides** (late starts, etc.)

### **Verification**
```sql
-- Check AI-generated events
SELECT title, start_ts, end_ts, status
FROM events 
WHERE child_id = 'max-uuid' 
  AND source = 'ai'
  AND start_ts >= CURRENT_DATE
ORDER BY start_ts;
```

---

## **Test 6: Edge Cases**

### **6.1: Overlapping Teach Rules**
- Create: Max, Mon, 9-12 (Teach)
- Create: Max, Mon, 11-2 (Teach)
- **Expected**: 9 AM - 2 PM (merged)

### **6.2: Overlapping Off Rules**
- Create: Max, Mon, 10-12 (Off)
- Create: Max, Mon, 11-1 (Off)
- **Expected**: 10 AM - 1 PM (merged)

### **6.3: Teach Completely Blocked**
- Create: Max, Mon, 9-3 (Teach)
- Create: Max, Mon, 9-3 (Off)
- **Expected**: OFF (no available time)

### **6.4: Partial Blocking**
- Create: Max, Mon, 9-3 (Teach)
- Create: Max, Mon, 12-1 (Off)
- **Expected**: 9 AM - 12 PM, 1 PM - 3 PM (two blocks)

---

## **Test 7: Performance**

### **Setup**
- Create 20+ rules for different children
- Mix of Teach/Off rules with various time ranges

### **Steps**
1. **Measure Cache Refresh Time**:
   ```sql
   \timing on
   SELECT refresh_calendar_days_cache('family-uuid', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days');
   \timing off
   ```

2. **Measure Availability Query Time**:
   ```sql
   \timing on
   SELECT * FROM get_child_availability('max-uuid', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days');
   \timing off
   ```

### **Expected Result**
- **Cache refresh**: < 1 second for 90 days
- **Availability query**: < 100ms for 30 days

---

## **Test 8: Data Integrity**

### **8.1: Rule Deletion**
1. Delete a Teach rule
2. **Expected**: Cache updates, availability recalculated

### **8.2: Rule Update**
1. Change time range of existing rule
2. **Expected**: Cache updates, availability recalculated

### **8.3: Child Deletion**
1. Delete a child
2. **Expected**: All rules and cache entries cleaned up

### **Verification**
```sql
-- Check for orphaned cache entries
SELECT COUNT(*) FROM calendar_days_cache c
LEFT JOIN children ch ON c.child_id = ch.id
WHERE ch.id IS NULL;

-- Check for orphaned rules
SELECT COUNT(*) FROM schedule_rules r
LEFT JOIN children ch ON r.scope_id = ch.id
WHERE r.scope_type = 'child' AND ch.id IS NULL;
```

---

## **Test 9: UI/UX**

### **9.1: Form Validation**
- Try saving rule with no title → Error
- Try saving rule with no days → Error
- Try saving rule with end time before start time → Error

### **9.2: Visual Feedback**
- Rule cards show correct type (+ Add Teaching Time / − Block Time)
- Preview shows correct availability
- Cascade toggle works and shows explanation

### **9.3: Responsive Design**
- Test on different screen sizes
- Ensure modals work on mobile
- Check touch interactions

---

## **Test 10: Migration Safety**

### **10.1: Existing Data**
- Verify existing rules are migrated correctly
- Check that old priority values are removed
- Ensure cache is recomputed

### **10.2: Rollback Test**
- Test that you can rollback if needed
- Verify data integrity after rollback

### **Verification**
```sql
-- Check migration results
SELECT 
  COUNT(*) as total_rules,
  COUNT(*) FILTER (WHERE rule_kind = 'teach') as teach_rules,
  COUNT(*) FILTER (WHERE rule_kind = 'off') as off_rules,
  COUNT(*) FILTER (WHERE priority IS NOT NULL) as rules_with_priority
FROM schedule_rules;

-- Should show 0 rules_with_priority
```

---

## **✅ Success Criteria**

### **Functional**
- [ ] Add-Remove math works correctly (Teach adds, Off blocks)
- [ ] Specificity Cascade applies correct precedence
- [ ] Overrides take precedence over rules
- [ ] Soft warnings appear for conflicts
- [ ] AI Planner respects availability
- [ ] Cache updates automatically

### **Performance**
- [ ] Cache refresh < 1 second
- [ ] Availability queries < 100ms
- [ ] UI responds smoothly

### **Data Integrity**
- [ ] No orphaned records
- [ ] Migration preserves data
- [ ] Rollback works if needed

### **User Experience**
- [ ] Clear visual indicators (+ Add / − Block)
- [ ] Helpful explanations and warnings
- [ ] Intuitive form validation
- [ ] Responsive design

---

## **🐛 Common Issues & Solutions**

### **Issue**: Cache not updating
**Solution**: Check triggers are installed, manually refresh cache

### **Issue**: Rules not applying
**Solution**: Check rule_kind is set, verify is_active = true

### **Issue**: Cascade not working
**Solution**: Check family_settings table, verify specificity_cascade = true

### **Issue**: Performance slow
**Solution**: Check indexes, consider reducing cache window

### **Issue**: UI not updating
**Solution**: Check component state management, verify RPC calls

---

## **📊 Test Results Template**

```
Test #: [Number]
Date: [Date]
Tester: [Name]
Status: [PASS/FAIL]

Steps:
1. [Step 1]
2. [Step 2]
...

Expected: [Expected result]
Actual: [Actual result]

Notes: [Any observations]
```

---

## **🎉 Completion Checklist**

- [ ] All 10 test scenarios pass
- [ ] Performance meets criteria
- [ ] Data integrity verified
- [ ] UI/UX approved
- [ ] Migration tested
- [ ] Documentation updated
- [ ] Team trained on new system

**Ready for production!** 🚀
