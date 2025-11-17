# Schedule Rules System Integration Guide

This guide explains how to integrate the new flexible schedule rules system into your existing app.

## 🎯 What This Solves

The new system replaces rigid `family_teaching_days` and `class_days` tables with a flexible:
- **Rules + Overrides + Events** model
- **AI-powered rescheduling** that respects family constraints
- **Scalable architecture** that works with thousands of families

## 🗄️ Database Changes

### New Tables Created:
1. **`schedule_rules`** - Recurring availability patterns (e.g., "Mon-Fri 9-3")
2. **`schedule_overrides`** - One-off changes (e.g., "No school tomorrow")
3. **`events`** - Consolidated lessons/activities with recurrence support
4. **`calendar_days_cache`** - Materialized daily grid for fast queries

### Key Features:
- ✅ **Flexible scheduling**: "No Mondays", "Only until 2pm on Tuesdays"
- ✅ **Priority system**: Higher priority rules override lower ones
- ✅ **Family + child scoping**: Rules can apply to entire family or individual children
- ✅ **RRULE support**: Standard recurrence patterns (weekly, monthly, etc.)
- ✅ **AI integration**: Smart rescheduling based on family constraints

## 🚀 Installation Steps

### 1. Run Database Migration
```bash
# Make sure you have your Supabase service key set
export SUPABASE_SERVICE_ROLE_KEY="your-service-key"

# Run the migration
node run-schedule-migration.js
```

### 2. Add Schedule Rules Manager to Your App

In your `WebContent.js`, add the schedule rules button:

```javascript
// Add this import at the top
import ScheduleRulesButton from './components/ScheduleRulesButton';

// Add this to your renderHomeContent or renderAddOptionsContent
<ScheduleRulesButton 
  familyId={familyId}
  children={children}
  style={{ marginBottom: 16 }}
/>
```

### 3. Integrate AI Rescheduling Service

```javascript
// Import the service
import aiReschedulingService from '../lib/aiReschedulingService';

// Initialize when family loads
useEffect(() => {
  if (familyId) {
    aiReschedulingService.initialize(familyId);
  }
}, [familyId]);

// Use when rescheduling events
const handleRescheduleEvent = async (eventId, reason) => {
  try {
    const suggestions = await aiReschedulingService.suggestRescheduling(eventId, reason);
    // Show suggestions to user or auto-apply
    console.log('Rescheduling suggestions:', suggestions);
  } catch (error) {
    console.error('Rescheduling failed:', error);
  }
};
```

## 📱 UI Components

### ScheduleRulesManager
- Full-featured rules management interface
- Add/edit recurring rules (teaching hours, days off)
- Add/edit one-off overrides (late start, early end, etc.)
- Priority-based rule hierarchy

### ScheduleRulesButton
- Simple button to open the rules manager
- Shows current rule count and status
- Integrates seamlessly with existing UI

## 🤖 AI Rescheduling Features

### Automatic Conflict Detection
```javascript
// Run this periodically to catch conflicts
const result = await aiReschedulingService.autoRescheduleConflicts();
console.log(`Found ${result.conflictsFound} conflicts, rescheduled ${result.rescheduledCount}`);
```

### Smart Suggestions
```javascript
// Get rescheduling suggestions for a specific event
const suggestions = await aiReschedulingService.suggestRescheduling(eventId, 'weather');

// Returns:
// - Same-day alternatives
// - Next available dates
// - Contextual recommendations
// - Priority-based suggestions
```

### Available Time Slots
```javascript
// Find available slots for a child on a specific date
const slots = await aiReschedulingService.findAvailableSlots(
  childId, 
  '2025-01-15', 
  60 // duration in minutes
);
```

## 🔄 Migration from Old System

### Existing Data
The migration script will:
1. ✅ Create new tables with proper RLS policies
2. ✅ Insert default rules for existing families
3. ✅ Set up indexes for performance
4. ✅ Create helper functions for rule expansion

### Gradual Migration
You can run both systems in parallel:
1. Keep existing `family_teaching_days` and `class_days` tables
2. Gradually migrate users to the new system
3. Remove old tables once migration is complete

## 📊 Example Queries

### Get Family's Teaching Schedule
```sql
SELECT * FROM schedule_rules 
WHERE scope_type = 'family' 
AND scope_id = 'family-uuid'
AND rule_type = 'availability_teach'
ORDER BY priority DESC;
```

### Find Available Slots
```sql
SELECT * FROM calendar_days_cache
WHERE family_id = 'family-uuid'
AND date BETWEEN '2025-01-15' AND '2025-01-21'
AND day_status = 'teach';
```

### Get Active Overrides
```sql
SELECT * FROM schedule_overrides
WHERE scope_type = 'family'
AND scope_id = 'family-uuid'
AND date >= CURRENT_DATE
AND is_active = true;
```

## 🎨 Customization Options

### Rule Types
- `availability_teach` - Regular teaching hours
- `availability_off` - No teaching (holidays, breaks)
- `activity_default` - Default activity patterns

### Override Types
- `day_off` - Complete day off
- `late_start` - Start later than usual
- `early_end` - End earlier than usual
- `extra_block` - Additional teaching time
- `cancel_block` - Cancel specific time block

### Priority System
- Higher numbers = higher priority
- Default: 100
- Family rules: 100-199
- Child rules: 200-299
- Overrides: 500+

## 🔧 Troubleshooting

### Common Issues

1. **Migration fails**: Check your Supabase service key permissions
2. **Rules not applying**: Verify RLS policies and family_id matching
3. **AI suggestions empty**: Ensure rules exist for the date range
4. **Performance slow**: Check indexes on date_range and scope columns

### Debug Queries
```sql
-- Check if rules exist
SELECT COUNT(*) FROM schedule_rules WHERE family_id = 'your-family-id';

-- Check cache status
SELECT * FROM calendar_days_cache WHERE family_id = 'your-family-id' LIMIT 5;

-- Verify RLS policies
SELECT * FROM pg_policies WHERE tablename = 'schedule_rules';
```

## 🚀 Next Steps

1. **Test the migration** on a development database first
2. **Add the UI components** to your app
3. **Test rule creation** and override functionality
4. **Integrate AI rescheduling** into your event management
5. **Monitor performance** and optimize queries as needed

## 📞 Support

If you encounter issues:
1. Check the console logs for detailed error messages
2. Verify your Supabase permissions and RLS policies
3. Test with simple rules first before complex scenarios
4. Use the debug queries above to verify data integrity

The new system is designed to be backward-compatible, so you can implement it gradually without breaking existing functionality.
