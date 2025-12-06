# Autonomous AI Planner Mode Implementation Guide

## Overview
Add an "Autonomous Mode" toggle that automatically adjusts the learning plan based on attendance, material reactions, skill gaps, and schedule changes.

## Database Schema

### 1. Autonomous mode settings table
```sql
CREATE TABLE IF NOT EXISTS autonomous_planner_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE, -- NULL = family-wide
  enabled boolean DEFAULT false NOT NULL,
  
  -- Auto-adjustment settings
  auto_rebalance boolean DEFAULT true, -- Auto-rebalance if behind
  auto_switch_materials boolean DEFAULT true, -- Switch bad materials
  auto_shorten_on_absence boolean DEFAULT true, -- Shorten on trips/illness
  auto_add_reviews boolean DEFAULT true, -- Add micro reviews on skill dips
  
  -- Thresholds
  behind_threshold_days integer DEFAULT 3, -- Days behind before rebalance
  material_rating_threshold numeric(2,1) DEFAULT 2.5, -- Rating < 2.5 = bad
  skill_dip_threshold numeric(2,1) DEFAULT 2.0, -- Skill confidence < 2.0 = dip
  
  -- Notification settings
  notify_on_adjustments boolean DEFAULT true,
  notify_on_material_switch boolean DEFAULT true,
  notify_on_skill_review_added boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(family_id, child_id)
);

CREATE INDEX IF NOT EXISTS autonomous_settings_family_idx ON autonomous_planner_settings(family_id);
CREATE INDEX IF NOT EXISTS autonomous_settings_child_idx ON autonomous_planner_settings(child_id) WHERE child_id IS NOT NULL;

-- RLS policies
ALTER TABLE autonomous_planner_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family can manage autonomous settings"
ON autonomous_planner_settings FOR ALL
TO authenticated
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));
```

### 2. Autonomous adjustments log
```sql
CREATE TABLE IF NOT EXISTS autonomous_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  
  -- Adjustment details
  adjustment_type text NOT NULL CHECK (adjustment_type IN (
    'rebalance', 'material_switch', 'shorten_week', 'add_review', 'skip_event'
  )),
  reason text NOT NULL, -- Human-readable reason
  trigger_data jsonb, -- Data that triggered adjustment
  
  -- Affected events
  affected_event_ids uuid[], -- Events that were modified
  
  -- Before/after state
  before_state jsonb,
  after_state jsonb,
  
  -- Status
  status text DEFAULT 'applied' CHECK (status IN ('applied', 'pending', 'reverted')),
  applied_at timestamptz DEFAULT now(),
  
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS autonomous_adjustments_child_idx ON autonomous_adjustments(child_id);
CREATE INDEX IF NOT EXISTS autonomous_adjustments_type_idx ON autonomous_adjustments(adjustment_type);
CREATE INDEX IF NOT EXISTS autonomous_adjustments_created_idx ON autonomous_adjustments(created_at DESC);

-- RLS policies
ALTER TABLE autonomous_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family can view autonomous adjustments"
ON autonomous_adjustments FOR SELECT
TO authenticated
USING (is_family_member(family_id));
```

## Backend Implementation

### Autonomous Planner Service (`backend/services/autonomous_planner.py`)

```python
class AutonomousPlanner:
    """Automatically adjusts learning plans based on data"""
    
    async def check_and_adjust(self, child_id: str, family_id: str):
        """Main entry point - checks all conditions and applies adjustments"""
        settings = await self.get_settings(family_id, child_id)
        if not settings or not settings['enabled']:
            return
        
        adjustments = []
        
        # 1. Check if behind schedule
        if settings['auto_rebalance']:
            adjustment = await self.check_behind_schedule(child_id)
            if adjustment:
                adjustments.append(adjustment)
        
        # 2. Check material reactions
        if settings['auto_switch_materials']:
            adjustment = await self.check_bad_materials(child_id)
            if adjustment:
                adjustments.append(adjustment)
        
        # 3. Check for absences/trips
        if settings['auto_shorten_on_absence']:
            adjustment = await self.check_upcoming_absences(child_id)
            if adjustment:
                adjustments.append(adjustment)
        
        # 4. Check skill gaps
        if settings['auto_add_reviews']:
            adjustment = await self.check_skill_dips(child_id)
            if adjustment:
                adjustments.append(adjustment)
        
        # Apply all adjustments
        for adj in adjustments:
            await self.apply_adjustment(adj, child_id, family_id)
    
    async def check_behind_schedule(self, child_id: str):
        """Check if child is behind schedule and needs rebalancing"""
        # Get planned vs actual progress
        # Calculate days behind
        # If > threshold, return rebalance adjustment
        
    async def check_bad_materials(self, child_id: str):
        """Check for materials with low ratings"""
        # Query event_outcomes with material ratings
        # Find materials with avg rating < threshold
        # Find upcoming events using those materials
        # Return material switch adjustment
        
    async def check_upcoming_absences(self, child_id: str):
        """Check for upcoming trips/illnesses"""
        # Check blackout periods
        # Check schedule overrides
        # If conflicts with planned events, return shorten adjustment
        
    async def check_skill_dips(self, child_id: str):
        """Check for skill confidence dips"""
        # Query skill_evidence for recent confidence scores
        # Find skills with declining confidence
        # Return add review adjustment
        
    async def apply_adjustment(self, adjustment: dict, child_id: str, family_id: str):
        """Apply an autonomous adjustment"""
        # Log adjustment
        # Execute adjustment (rebalance, switch materials, etc.)
        # Send notification if enabled
        # Return adjustment record
```

### API Endpoints (`backend/routers/autonomous_planner_routes.py`)

```python
@router.get("/autonomous/settings")
async def get_autonomous_settings(
    child_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Get autonomous planner settings"""

@router.post("/autonomous/settings")
async def update_autonomous_settings(
    settings: AutonomousSettingsIn,
    user: dict = Depends(get_current_user),
):
    """Update autonomous planner settings"""

@router.post("/autonomous/check")
async def trigger_autonomous_check(
    child_id: str,
    user: dict = Depends(get_current_user),
):
    """Manually trigger autonomous planner check"""

@router.get("/autonomous/adjustments")
async def get_adjustment_history(
    child_id: str,
    limit: int = 50,
    user: dict = Depends(get_current_user),
):
    """Get history of autonomous adjustments"""

@router.post("/autonomous/adjustments/{adjustment_id}/revert")
async def revert_adjustment(
    adjustment_id: str,
    user: dict = Depends(get_current_user),
):
    """Revert an autonomous adjustment"""
```

## Frontend Components

### 1. Autonomous Mode Toggle (`components/planner/AutonomousModeToggle.js`)

```jsx
// Toggle switch for enabling autonomous mode
// Shows:
// - On/Off toggle
// - Brief description
// - Link to settings
// - Status indicator (Active/Inactive)
```

### 2. Autonomous Settings Modal (`components/planner/AutonomousSettingsModal.js`)

```jsx
// Configure autonomous mode
// Sections:
// - Enable/Disable toggle
// - Adjustment toggles (rebalance, switch materials, etc.)
// - Threshold sliders
// - Notification preferences
// - Save button
```

### 3. Adjustment History (`components/planner/AdjustmentHistory.js`)

```jsx
// Show history of autonomous adjustments
// Features:
// - Timeline view
// - Filter by type
// - Show before/after states
// - Revert button
// - Details modal
```

### 4. Adjustment Notification (`components/notifications/AdjustmentNotification.js`)

```jsx
// Toast/notification when adjustment is made
// Shows:
// - Type of adjustment
// - Reason
// - Affected events
// - "View Details" link
// - "Revert" button
```

## User Flows

### Flow 1: Enable Autonomous Mode
1. User navigates to Planner
2. Sees "Autonomous Mode" toggle in header
3. Clicks toggle → Opens settings modal
4. Reviews default settings
5. Adjusts thresholds if needed
6. Enables mode
7. Sees confirmation: "Autonomous mode active"

### Flow 2: Automatic Rebalancing
1. Child misses 3 days of events
2. Autonomous planner detects behind schedule
3. Automatically calls rebalance API
4. Events rescheduled forward
5. Notification: "Plan rebalanced: 3 days behind"
6. User sees updated calendar

### Flow 3: Automatic Material Switch
1. Child rates material 2.0/5.0
2. Autonomous planner detects low rating
3. Finds alternative materials for same subject
4. Switches upcoming events to new materials
5. Notification: "Material switched: [Old] → [New]"
6. User can revert if needed

### Flow 4: Automatic Skill Review Addition
1. Skill confidence drops to 1.8/5.0
2. Autonomous planner detects skill dip
3. Creates micro-review events for that skill
4. Schedules them in next week
5. Notification: "Added review sessions for [Skill]"
6. Events appear in calendar

## Visual Design

### Autonomous Mode Toggle
```
┌─────────────────────────────────────────┐
│ 🤖 Autonomous Mode                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                         │
│ Automatically adjusts your plan based   │
│ on attendance, progress, and feedback. │
│                                         │
│ [●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━] ON│
│                                         │
│ [⚙️ Configure Settings]                 │
└─────────────────────────────────────────┘
```

### Settings Modal
```
┌─────────────────────────────────────────┐
│ Autonomous Mode Settings            [×] │
├─────────────────────────────────────────┤
│                                         │
│ ✅ Auto-rebalance if behind            │
│    Threshold: [3] days                 │
│                                         │
│ ✅ Auto-switch bad materials           │
│    Rating threshold: [2.5] / 5.0       │
│                                         │
│ ✅ Auto-shorten on absences            │
│                                         │
│ ✅ Auto-add skill reviews              │
│    Confidence threshold: [2.0] / 5.0   │
│                                         │
│ Notifications:                          │
│ ✅ Notify on adjustments               │
│ ✅ Notify on material switches         │
│                                         │
│ [Save Settings]                         │
└─────────────────────────────────────────┘
```

### Adjustment History
```
┌─────────────────────────────────────────┐
│ Adjustment History                      │
├─────────────────────────────────────────┤
│ Today                                   │
│ ┌─────────────────────────────────────┐│
│ │ 🔄 Plan Rebalanced                  ││
│ │ 3 days behind schedule              ││
│ │ 12 events rescheduled               ││
│ │ [View] [Revert]                     ││
│ └─────────────────────────────────────┘│
│                                         │
│ Yesterday                               │
│ ┌─────────────────────────────────────┐│
│ │ 📚 Material Switched                ││
│ │ Algebra Workbook → Khan Academy      ││
│ │ Low rating: 2.0/5.0                 ││
│ │ [View] [Revert]                     ││
│ └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

## Implementation Steps

1. **Database**
   - Create `autonomous_planner_settings` table
   - Create `autonomous_adjustments` log table
   - Add RLS policies

2. **Backend Service**
   - Create `AutonomousPlanner` service class
   - Implement check methods (behind, materials, absences, skills)
   - Implement apply methods (rebalance, switch, shorten, add reviews)
   - Create API routes

3. **Scheduled Job**
   - Create background job that runs daily
   - Checks all children with autonomous mode enabled
   - Applies adjustments automatically

4. **Frontend Components**
   - Create toggle component
   - Create settings modal
   - Create adjustment history view
   - Create notification components

5. **Integration**
   - Add toggle to Planner header
   - Add settings link
   - Add adjustment history to Records page
   - Add notifications

## Benefits

✅ **True AI-Powered** - System adapts automatically
✅ **Reduces Manual Work** - No need to constantly adjust
✅ **Proactive** - Catches issues before they become problems
✅ **Personalized** - Adapts to each child's needs
✅ **Confidence** - Parents trust the system to manage learning

