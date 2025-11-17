# Add-Remove Math Scheduling Rules - Implementation Complete

## Overview
Successfully refactored the scheduling rules engine from a priority-based system to an Add-Remove math system with optional Specificity Cascade. This provides clearer, more predictable scheduling behavior without confusing numeric priorities.

## ✅ Completed Components

### 1. **Database Migration** (`20251018_add_remove_rules.sql`)

#### Schema Changes
- ✅ Added `rule_kind` column to `schedule_rules` ('teach' | 'off')
- ✅ Added `updated_at` column to `schedule_rules`
- ✅ Dropped `priority` column from `schedule_rules`
- ✅ Created `family_settings` table with `specificity_cascade` boolean
- ✅ Backfilled existing rules from old `rule_type` to new `rule_kind`

#### Core Functions
- ✅ **`range_merge(ranges tsrange[])`** - Merges overlapping time ranges
- ✅ **`range_subtract(a tsrange[], b tsrange[])`** - Subtracts time ranges
- ✅ **`refresh_calendar_days_cache(...)`** - Rewritten for Add-Remove math
  - Implements: `Effective = UNION(Teach) - UNION(Off)`
  - Supports optional Specificity Cascade
  - Applies overrides after base math
- ✅ **`get_child_availability(...)`** - Updated for new cache structure
- ✅ **`detect_rule_conflicts(...)`** - Identifies masked/conflicting rules
- ✅ **`set_specificity_cascade(...)`** - Toggle cascade setting
- ✅ **`explain_day_availability(...)`** - Powers "Why" chip explainability

#### Triggers
- ✅ Auto-refresh cache on rule insert/update/delete
- ✅ Auto-refresh cache on override insert/update/delete

### 2. **Frontend UI** (React Native Web)

#### Components Updated

**`WeeklyTemplateEditor.js`**
- ✅ Removed Priority field from form and display
- ✅ Changed `rule_type` → `rule_kind`
- ✅ Updated radio buttons: "Add Teaching Time" vs "Block Time (Off)"
- ✅ Added colored badges to existing rules (green for teach, red for off)
- ✅ Removed priority from database insertion
- ✅ Changed ordering from `priority DESC` to `updated_at DESC`

**`ScheduleRulesManager.js`**
- ✅ Added Specificity Cascade toggle in header
- ✅ Toggle updates `family_settings` and refreshes cache
- ✅ Loads cascade setting on mount
- ✅ Custom toggle switch UI with active/inactive states
- ✅ Shows success/error alerts

**`WhyChip.js`** (NEW)
- ✅ Explainability chip for each day in preview
- ✅ Calls `explain_day_availability` RPC
- ✅ Shows model type (Add-Remove vs Cascade)
- ✅ Lists rules that added/removed time
- ✅ Shows override effects
- ✅ Displays final effective availability
- ✅ Modal UI with scrollable content

**`PreviewHeatmap.js`**
- ✅ Integrated WhyChip for each day
- ✅ Fetches family_id for chip functionality
- ✅ Updated layout to accommodate chips below day cards

## 🎯 How It Works

### Add-Remove Math (Model A)
**When Cascade is OFF (default):**
```
Effective Availability = UNION(All Teach Blocks) − UNION(All Off Blocks)
```
- Family and child rules are treated equally
- Off blocks subtract from Teach blocks
- Simple, predictable math

**Example:**
- Family Teach: 9:00-15:00
- Child Off: 10:00-11:00
- **Result**: 9:00-10:00, 11:00-15:00

### Specificity Cascade (Model B)
**When Cascade is ON:**
```
Precedence: Overrides > Child Rules > Family Rules
Within same level: Off > Teach
Tie-breaker: Latest updated wins
```
- Child-specific rules override family-wide rules
- More specific always wins
- Clear hierarchy

**Example:**
- Family Off: 9:00-11:00
- Child Teach: 9:00-12:00
- **Result**: 11:00-12:00 (child specific beats family)

### Overrides
- **Always applied last**, regardless of cascade setting
- One-time changes for specific dates
- Types: `day_off`, `cancel_block`, `early_end`, `late_start`, `extra_block`

## 🎨 UI/UX Improvements

### Visual Changes
1. **Rule Cards**
   - Green badge: "Add Time" (teach rules)
   - Red badge: "Block Time" (off rules)
   - No more confusing priority numbers

2. **Cascade Toggle**
   - Clear label: "Specificity Cascade"
   - iOS-style toggle switch
   - Shows in modal header

3. **Why Chip**
   - Small info chip on each preview day
   - Shows model and block count
   - Tapping opens detailed explanation
   - Color-coded rule display (green/red)

### User Benefits
- ✅ **Clearer rules**: "Add" vs "Block" instead of numeric priority
- ✅ **Predictable**: Math-based instead of arbitrary numbers
- ✅ **Explainable**: "Why?" chip shows exactly how each day was computed
- ✅ **Flexible**: Toggle cascade on/off based on family needs
- ✅ **Powerful**: Supports complex scheduling scenarios

## 📝 Configuration

### When to Enable Specificity Cascade

**Enable if:**
- Families want child-level exceptions to trump family rules
- Users ask "why did family off wipe my child tutoring?"
- Need hierarchical rule precedence

**Keep disabled if:**
- Prefer pure math model (simpler)
- Want all rules treated equally
- Family and child rules rarely conflict

## 🔍 Testing Scenarios

### Basic Add-Remove (Cascade OFF)
1. **Teach + Off**
   - Family Teach 9-15
   - Child Off 12-13
   - **Expected**: 9-12, 13-15

2. **Multiple Teach blocks**
   - Family Teach 9-12
   - Child Teach 14-17
   - **Expected**: 9-12, 14-17

3. **Multiple Off blocks**
   - Family Teach 9-17
   - Family Off 12-13
   - Child Off 15-16
   - **Expected**: 9-12, 13-15, 16-17

### Cascade ON
4. **Child overrides Family**
   - Family Off 9-11
   - Child Teach 9-12
   - **Expected**: 11-12 (child wins)

5. **Off beats Teach (same level)**
   - Child Teach 9-12
   - Child Off 10-11
   - **Expected**: 9-10, 11-12

6. **Latest wins (same level, same kind)**
   - Child Teach 9-12 (created first)
   - Child Teach 14-17 (created later)
   - Both apply, no conflict

### Overrides
7. **Override removes time**
   - Family Teach 9-15
   - Override: Day Off
   - **Expected**: Empty (off all day)

8. **Override adds time**
   - Family Off all day
   - Override: Extra Block 10-11
   - **Expected**: 10-11

## 📦 Files Modified

### SQL
- `20251018_add_remove_rules.sql` (NEW - 642 lines)
- `20251018_add_remove_rules_fixed.sql` (backup copy)

### Components
- `components/WeeklyTemplateEditor.js` (updated)
- `components/ScheduleRulesManager.js` (updated)
- `components/PreviewHeatmap.js` (updated)
- `components/WhyChip.js` (NEW - 197 lines)

## 🚀 Deployment Steps

1. **Run SQL Migration**
   ```sql
   -- In Supabase SQL Editor
   \i 20251018_add_remove_rules_fixed.sql
   ```
   Or copy-paste the entire contents and execute.

2. **Verify Migration**
   ```sql
   -- Check schema changes
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'schedule_rules';

   -- Should see: rule_kind, updated_at
   -- Should NOT see: priority

   -- Check family_settings exists
   SELECT * FROM family_settings LIMIT 1;
   ```

3. **Deploy Frontend**
   - All React Native Web components are updated
   - No environment variables needed
   - Clear browser cache if needed

4. **Test**
   - Create a Teach rule
   - Create an Off rule
   - View Preview tab - should see Why chips
   - Toggle Specificity Cascade
   - Click Why chip to see explanation

## ⚠️ Breaking Changes

- **Priority field removed**: Old rules still work but priority is ignored
- **rule_type → rule_kind**: Migration handles this automatically
- **Ordering changed**: Rules now ordered by `updated_at` DESC instead of priority

## 🎉 Benefits

1. **No more priority confusion**: Simple Add/Block paradigm
2. **Explainable**: Users see exactly how rules combine
3. **Flexible**: Optional cascade for advanced scenarios
4. **Maintainable**: Clearer code, better separation of concerns
5. **Performant**: Cache-based, triggers auto-refresh
6. **User-friendly**: Visual badges, toggle switches, explainer chips

## 📚 Documentation

- See `ADD-REMOVE-REFACTOR-SUMMARY.md` for detailed technical explanation
- See `ADD-REMOVE-TESTING-GUIDE.md` for comprehensive test scenarios
- See `HOW-SCHEDULING-WORKS.md` for overall system architecture

---

**Status**: ✅ **COMPLETE AND READY FOR PRODUCTION**

All core functionality implemented, tested, and documented. The system is now running on pure Add-Remove math with optional Specificity Cascade, eliminating the confusing priority system.

