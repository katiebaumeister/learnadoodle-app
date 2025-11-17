# Schedule Rules System Implementation Guide

This guide provides step-by-step instructions to implement the complete schedule rules system with AI-powered rescheduling capabilities.

## 🎯 **Implementation Steps**

### **Step 1: Lock Down Data (RLS + Constraints)**

Run the RLS and constraints script in your Supabase SQL Editor:

```sql
-- Execute: implement-rls-and-constraints.sql
```

**What this does:**
- ✅ Enables Row Level Security on all schedule tables
- ✅ Creates comprehensive RLS policies for family/child scoping
- ✅ Adds application-level overlap prevention
- ✅ Creates performance indexes
- ✅ Adds audit columns (created_by, updated_by)

**Important Notes:**
- The `btree_gist` extension requires superuser privileges
- If you can't enable it, the application-level overlap prevention will work
- All policies are family-scoped for security

### **Step 2: Make Cache Automatic**

Run the cache automation script:

```sql
-- Execute: implement-cache-automation.sql
```

**What this does:**
- ✅ Creates `refresh_calendar_days_cache()` function
- ✅ Sets up real-time cache refresh via triggers
- ✅ Creates notification system for immediate updates
- ✅ Initializes cache for existing families
- ✅ Adds cleanup functions for old cache entries

**How it works:**
- Cache automatically refreshes when rules/overrides/events change
- Uses PostgreSQL notifications for real-time updates
- Maintains 90 days of future cache data
- Cleans up cache older than 30 days

### **Step 3: Create Availability API**

Run the availability API script:

```sql
-- Execute: create-availability-api.sql
```

**What this does:**
- ✅ Creates `get_child_availability()` function
- ✅ Creates `get_family_availability()` function
- ✅ Creates `find_available_slots()` function
- ✅ Creates `check_scheduling_conflict()` function
- ✅ Creates `get_availability_api_response()` function

**API Endpoints:**
- `GET /api/availability?child_id=...&from=2025-10-01&to=2025-10-14`
- Returns timezone, windows, and events in standardized format

### **Step 4: Run Acceptance Tests**

Run the acceptance tests:

```sql
-- Execute: acceptance-tests.sql
```

**What this tests:**
- ✅ Create weekly teaching rule → availability shows correctly
- ✅ Add day-off override → date shows as "off"
- ✅ Add event → availability adjusts properly
- ✅ Try overlapping event → gets blocked
- ✅ Edit rule → cache updates automatically

### **Step 5: Build Schedule Rules Manager UI**

The UI components are already created:
- ✅ `ScheduleRulesButton.js` - Entry point button
- ✅ `ScheduleRulesManager.js` - Full management interface
- ✅ Integrated into `WebContent.js` Add tab

**Features:**
- Weekly template editor
- Scope selection (Family/Child)
- Days of week selection
- Time range configuration
- Priority system
- Override management
- Conflict detection

### **Step 6: Integrate AI Rescheduling Service**

The AI service is ready:
- ✅ `aiReschedulingService.js` - Smart rescheduling logic
- ✅ Respects family constraints
- ✅ Finds optimal alternatives
- ✅ Provides contextual recommendations

**Usage:**
```javascript
// Find available slots
const slots = await aiReschedulingService.findAvailableSlots(childId, date, 60);

// Suggest rescheduling
const suggestions = await aiReschedulingService.suggestRescheduling(eventId, 'weather');

// Auto-reschedule conflicts
const result = await aiReschedulingService.autoRescheduleConflicts();
```

## 🚀 **Production Deployment**

### **Database Setup:**
1. Run all SQL scripts in order
2. Verify RLS policies are active
3. Test acceptance tests pass
4. Monitor cache refresh performance

### **Application Integration:**
1. The Schedule Rules button is already integrated
2. AI rescheduling service is ready to use
3. Availability API functions are available
4. Cache system runs automatically

### **Performance Optimization:**
- ✅ Indexes created for fast queries
- ✅ Cache system for instant UI updates
- ✅ Partitioning ready for scale
- ✅ Cleanup functions for maintenance

## 📊 **Monitoring & Maintenance**

### **Key Metrics to Track:**
- Cache refresh duration
- Number of rules/overrides per family
- Event scheduling conflicts
- API response times

### **Maintenance Tasks:**
- Monitor cache size and cleanup old entries
- Review RLS policy performance
- Optimize indexes based on query patterns
- Update AI rescheduling logic as needed

## 🔧 **Troubleshooting**

### **Common Issues:**

1. **Cache not updating:**
   - Check triggers are created
   - Verify notification system is working
   - Run manual cache refresh

2. **RLS blocking queries:**
   - Verify user has proper family association
   - Check policy conditions
   - Test with service role key

3. **Overlap prevention not working:**
   - Check `btree_gist` extension is enabled
   - Verify application-level triggers are active
   - Test with acceptance tests

4. **Performance issues:**
   - Check index usage with `EXPLAIN ANALYZE`
   - Monitor cache hit rates
   - Consider partitioning for large datasets

## 🎉 **Success Criteria**

The system is fully implemented when:
- ✅ All acceptance tests pass
- ✅ Schedule Rules Manager UI works
- ✅ AI rescheduling respects family constraints
- ✅ Cache updates in real-time
- ✅ No overlapping events can be created
- ✅ Availability API returns correct data

## 📈 **Next Steps**

Once the core system is working:
1. **Add advanced features** (recurring patterns, holidays)
2. **Integrate with calendar views** (show rules in calendar)
3. **Add mobile support** (React Native components)
4. **Implement analytics** (usage patterns, optimization suggestions)
5. **Add bulk operations** (import/export schedules)

The foundation is solid and ready for production use! 🚀
