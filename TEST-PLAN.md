# Comprehensive Test Plan for Schedule Rules & AI Planner System

## 🎯 **Test Objectives**

Verify that the complete schedule rules and AI planner system works end-to-end with:
- Family-specific constraints (e.g., "no Mondays", "only until 2pm on Tuesdays")
- AI-powered rescheduling that respects these rules
- Real-time cache updates for instant UI responsiveness
- Overlap prevention to avoid double-booking
- Performance optimization with proper indexing

## 🧪 **Test Scenarios**

### **Phase 1: Schedule Rules Foundation**

#### **Test 1.1: Create Weekly Teaching Rule**
```sql
-- Test: Create a weekly "teach" rule (Mon–Thu 9–1)
INSERT INTO schedule_rules (
  scope_type, scope_id, rule_type, title, 
  start_date, end_date, start_time, end_time, 
  rrule, priority, source
) VALUES (
  'family', 'your-family-id', 'availability_teach', 
  'TEST: Regular Teaching Hours', 
  CURRENT_DATE, (CURRENT_DATE + INTERVAL '30 days')::date,
  '09:00', '13:00', 
  '{"freq":"WEEKLY","byweekday":[1,2,3,4],"interval":1}'::jsonb,
  100, 'manual'
);
```

**Expected Result:**
- ✅ Rule created successfully
- ✅ Cache refreshed automatically
- ✅ Heatmap shows 4× green blocks per week (Mon-Thu 9-13)
- ✅ Availability API returns correct teaching windows

#### **Test 1.2: Add Day Off Override**
```sql
-- Test: Add override "Day off" tomorrow
INSERT INTO schedule_overrides (
  scope_type, scope_id, date, override_kind, notes
) VALUES (
  'family', 'your-family-id', (CURRENT_DATE + INTERVAL '1 day')::date,
  'day_off', 'TEST: Day off tomorrow'
);
```

**Expected Result:**
- ✅ Override created successfully
- ✅ Cache updated automatically
- ✅ Heatmap shows red for tomorrow
- ✅ Availability for tomorrow shows "off"

#### **Test 1.3: Add Event to Teaching Day**
```sql
-- Test: Add one event Wed 9–10
INSERT INTO events (
  child_id, family_id, title, start_ts, end_ts, status
) VALUES (
  'your-child-id', 'your-family-id', 'TEST: Math Lesson',
  (CURRENT_DATE + INTERVAL '2 days')::date + INTERVAL '9 hours',
  (CURRENT_DATE + INTERVAL '2 days')::date + INTERVAL '10 hours',
  'scheduled'
);
```

**Expected Result:**
- ✅ Event created successfully
- ✅ Wednesday still shows teaching hours (9-13)
- ✅ Event appears in availability data
- ✅ Remaining time slots are still available (10-13)

### **Phase 2: AI Planner System**

#### **Test 2.1: Generate Scheduling Proposal**
```javascript
// Test: Generate proposal for Math 180m, Reading 120m over 2 weeks
const proposal = await plannerService.generateProposal({
  childId: 'your-child-id',
  familyId: 'your-family-id',
  fromDate: '2025-01-15',
  toDate: '2025-01-29',
  goals: [
    { subject_id: 'math', minutes: 180, min_block: 30, max_block: 90 },
    { subject_id: 'reading', minutes: 120, min_block: 20, max_block: 60 }
  ],
  constraints: { spread_same_subject: true }
});
```

**Expected Result:**
- ✅ Proposal generated in <2 seconds
- ✅ Events only scheduled during teaching hours
- ✅ No overlapping events
- ✅ Goals distributed across multiple days
- ✅ Rationale provided for each event

#### **Test 2.2: Commit Proposal**
```javascript
// Test: Commit selected events from proposal
const result = await plannerService.commitProposal(
  proposal.proposal_id,
  proposal.events.slice(0, 3), // Commit first 3 events
  'your-child-id',
  'your-family-id'
);
```

**Expected Result:**
- ✅ Events committed to database
- ✅ Cache updated automatically
- ✅ Heatmap reflects new events
- ✅ Exclusion constraint prevents overlaps

#### **Test 2.3: Try Overlapping Event**
```sql
-- Test: Try to create overlapping event
INSERT INTO events (
  child_id, family_id, title, start_ts, end_ts, status
) VALUES (
  'your-child-id', 'your-family-id', 'TEST: Overlapping Event',
  (CURRENT_DATE + INTERVAL '2 days')::date + INTERVAL '9 hours 30 minutes',
  (CURRENT_DATE + INTERVAL '2 days')::date + INTERVAL '10 hours 30 minutes',
  'scheduled'
);
```

**Expected Result:**
- ❌ Event creation fails with overlap error
- ✅ Database integrity maintained
- ✅ No double-booking possible

### **Phase 3: UI Integration**

#### **Test 3.1: Schedule Rules Manager UI**
1. Click "Schedule Rules Manager" button
2. Navigate to "Weekly Rules" tab
3. Add new rule: "Morning Math" (Mon-Fri 9-11)
4. Switch to "Overrides" tab
5. Add "Late Start" for tomorrow (10:00)
6. Switch to "Preview" tab

**Expected Result:**
- ✅ Modal opens without errors
- ✅ Rule creation form works
- ✅ Override creation works
- ✅ Preview heatmap shows correct colors
- ✅ Real-time updates work

#### **Test 3.2: AI Planner UI**
1. Click "AI Planner" button
2. Select child and date range
3. Add goals: Math 120m, Science 90m
4. Click "Generate"
5. Select some events
6. Click "Commit"

**Expected Result:**
- ✅ Modal opens without errors
- ✅ Goals configuration works
- ✅ Proposal generation works
- ✅ Event selection works
- ✅ Commit functionality works

### **Phase 4: Performance & Edge Cases**

#### **Test 4.1: Cache Performance**
```sql
-- Test: Cache refresh performance
SELECT refresh_calendar_days_cache(
  'your-family-id',
  CURRENT_DATE,
  (CURRENT_DATE + INTERVAL '90 days')::date
);
```

**Expected Result:**
- ✅ Cache refresh completes in <5 seconds
- ✅ No errors during refresh
- ✅ All 90 days populated correctly

#### **Test 4.2: Large Dataset**
```javascript
// Test: Generate proposal for 4-week period with many goals
const largeProposal = await plannerService.generateProposal({
  childId: 'your-child-id',
  familyId: 'your-family-id',
  fromDate: '2025-01-01',
  toDate: '2025-01-28',
  goals: [
    { subject_id: 'math', minutes: 360, min_block: 30 },
    { subject_id: 'reading', minutes: 240, min_block: 20 },
    { subject_id: 'writing', minutes: 180, min_block: 30 },
    { subject_id: 'science', minutes: 120, min_block: 20 }
  ]
});
```

**Expected Result:**
- ✅ Proposal generated in <5 seconds
- ✅ All goals reasonably covered
- ✅ No memory issues
- ✅ UI remains responsive

#### **Test 4.3: Edge Cases**
1. **No Available Time**: Try to schedule when all days are "off"
2. **Very Short Goals**: Try 5-minute sessions
3. **Very Long Goals**: Try 4-hour sessions
4. **Invalid Dates**: Try past dates
5. **Missing Data**: Try with no children

**Expected Result:**
- ✅ Graceful handling of edge cases
- ✅ Appropriate error messages
- ✅ No crashes or data corruption

## 📊 **Success Criteria**

### **Functional Requirements**
- ✅ All test scenarios pass
- ✅ No data corruption or loss
- ✅ Real-time updates work
- ✅ Overlap prevention works
- ✅ AI suggestions are reasonable

### **Performance Requirements**
- ✅ Cache refresh: <5 seconds for 90 days
- ✅ Proposal generation: <2 seconds for 2 weeks
- ✅ UI responsiveness: <500ms for all interactions
- ✅ Database queries: <100ms for availability checks

### **User Experience**
- ✅ Intuitive UI with clear feedback
- ✅ Error messages are helpful
- ✅ Loading states are visible
- ✅ Success confirmations are clear

## 🔧 **Test Execution**

### **Manual Testing**
1. Run SQL tests in Supabase dashboard
2. Test UI components in browser
3. Verify real-time updates
4. Check error handling

### **Automated Testing**
```javascript
// Example test script
const runTests = async () => {
  console.log('🧪 Running Schedule Rules Tests...');
  
  // Test 1: Create rule
  await testCreateRule();
  
  // Test 2: Add override
  await testAddOverride();
  
  // Test 3: Generate proposal
  await testGenerateProposal();
  
  // Test 4: Commit events
  await testCommitEvents();
  
  console.log('✅ All tests passed!');
};
```

## 🚨 **Known Limitations**

1. **Time Pickers**: Currently showing alerts instead of actual time pickers
2. **Text Inputs**: Currently showing alerts instead of actual text inputs
3. **Drag-to-Reschedule**: Not yet implemented in timeline
4. **Bulk Operations**: Limited bulk edit capabilities

## 📈 **Monitoring**

Track these metrics during testing:
- Cache refresh duration
- Proposal generation time
- UI response times
- Error rates
- User interaction success rates

## 🎉 **Completion Criteria**

The system is ready for production when:
- ✅ All Phase 1-3 tests pass
- ✅ Performance meets requirements
- ✅ UI is intuitive and responsive
- ✅ Error handling is robust
- ✅ Documentation is complete

---

**Ready to test? Start with Phase 1 and work through each scenario systematically!** 🚀
