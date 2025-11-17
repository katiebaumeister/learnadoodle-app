# Manual Migration Guide

Since the automated migration is having issues, here's how to run it manually in your Supabase dashboard:

## 🎯 **Step 1: Create Tables**

Go to your Supabase dashboard → SQL Editor and run this:

```sql
-- 1. Create schedule_rules table
CREATE TABLE IF NOT EXISTS schedule_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('family', 'child')),
    scope_id UUID NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('availability_teach', 'availability_off', 'activity_default')),
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    rrule JSONB NOT NULL,
    priority INTEGER DEFAULT 100,
    source TEXT DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);
```

```sql
-- 2. Create schedule_overrides table
CREATE TABLE IF NOT EXISTS schedule_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('family', 'child')),
    scope_id UUID NOT NULL,
    date DATE NOT NULL,
    override_kind TEXT NOT NULL CHECK (override_kind IN ('day_off', 'late_start', 'early_end', 'extra_block', 'cancel_block')),
    start_time TIME,
    end_time TIME,
    notes TEXT,
    source TEXT DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    
    UNIQUE (scope_type, scope_id, date, override_kind)
);
```

```sql
-- 3. Create events table
CREATE TABLE IF NOT EXISTS events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    child_id UUID REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID REFERENCES family(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    subject_id UUID REFERENCES subject(id),
    start_ts TIMESTAMPTZ NOT NULL,
    end_ts TIMESTAMPTZ NOT NULL,
    rrule JSONB,
    exdate TIMESTAMPTZ[],
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'skipped', 'canceled')),
    source TEXT DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
    ai_generated BOOLEAN DEFAULT false,
    ai_reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);
```

```sql
-- 4. Create calendar_days_cache table
CREATE TABLE IF NOT EXISTS calendar_days_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    child_id UUID REFERENCES children(id) ON DELETE CASCADE,
    day_status TEXT CHECK (day_status IN ('teach', 'off', 'partial')),
    first_block_start TIME,
    last_block_end TIME,
    source_summary JSONB,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (date, family_id, child_id)
);
```

## 🎯 **Step 2: Create Indexes**

```sql
-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedule_rules_scope ON schedule_rules (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_schedule_rules_date_range ON schedule_rules (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_schedule_rules_rrule ON schedule_rules USING gin (rrule);
CREATE INDEX IF NOT EXISTS idx_schedule_rules_active ON schedule_rules (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_schedule_overrides_scope_date ON schedule_overrides (scope_type, scope_id, date);
CREATE INDEX IF NOT EXISTS idx_schedule_overrides_active ON schedule_overrides (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_events_child_time ON events (child_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_events_family_time ON events (family_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_events_time_range ON events (start_ts, end_ts);
CREATE INDEX IF NOT EXISTS idx_events_exdate ON events USING gin (exdate);

CREATE INDEX IF NOT EXISTS idx_calendar_days_cache_family_date ON calendar_days_cache (family_id, date);
CREATE INDEX IF NOT EXISTS idx_calendar_days_cache_child_date ON calendar_days_cache (child_id, date);
```

## 🎯 **Step 3: Setup RLS**

```sql
-- Add timezone to families table if not exists
ALTER TABLE family ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Enable RLS
ALTER TABLE schedule_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_days_cache ENABLE ROW LEVEL SECURITY;
```

```sql
-- Create RLS policies for schedule_rules
CREATE POLICY "Users can view schedule rules for their families" ON schedule_rules
    FOR SELECT USING (
        scope_type = 'family' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
        OR
        scope_type = 'child' AND scope_id IN (
            SELECT c.id FROM children c 
            JOIN family f ON c.family_id = f.id 
            JOIN profiles p ON f.id = p.family_id 
            WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "Users can manage schedule rules for their families" ON schedule_rules
    FOR ALL USING (
        scope_type = 'family' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
        OR
        scope_type = 'child' AND scope_id IN (
            SELECT c.id FROM children c 
            JOIN family f ON c.family_id = f.id 
            JOIN profiles p ON f.id = p.family_id 
            WHERE p.id = auth.uid()
        )
    );
```

```sql
-- Create RLS policies for schedule_overrides
CREATE POLICY "Users can view schedule overrides for their families" ON schedule_overrides
    FOR SELECT USING (
        scope_type = 'family' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
        OR
        scope_type = 'child' AND scope_id IN (
            SELECT c.id FROM children c 
            JOIN family f ON c.family_id = f.id 
            JOIN profiles p ON f.id = p.family_id 
            WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "Users can manage schedule overrides for their families" ON schedule_overrides
    FOR ALL USING (
        scope_type = 'family' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
        OR
        scope_type = 'child' AND scope_id IN (
            SELECT c.id FROM children c 
            JOIN family f ON c.family_id = f.id 
            JOIN profiles p ON f.id = p.family_id 
            WHERE p.id = auth.uid()
        )
    );
```

```sql
-- Create RLS policies for events
CREATE POLICY "Users can view events for their families" ON events
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can manage events for their families" ON events
    FOR ALL USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );
```

```sql
-- Create RLS policies for calendar_days_cache
CREATE POLICY "Users can view calendar days cache for their families" ON calendar_days_cache
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );
```

## 🎯 **Step 4: Insert Sample Data**

```sql
-- Insert default rules for existing families
INSERT INTO schedule_rules (scope_type, scope_id, rule_type, title, start_date, end_date, start_time, end_time, rrule, priority, source)
SELECT 
    'family',
    f.id,
    'availability_teach',
    'Default Teaching Hours',
    '2025-01-01',
    '2025-12-31',
    '09:00',
    '15:00',
    '{"freq":"WEEKLY","byweekday":[1,2,3,4,5],"interval":1}'::jsonb,
    100,
    'manual'
FROM family f
WHERE NOT EXISTS (
    SELECT 1 FROM schedule_rules sr 
    WHERE sr.scope_type = 'family' 
    AND sr.scope_id = f.id
);
```

## ✅ **Verification**

After running all steps, verify the tables exist:

```sql
-- Check if tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('schedule_rules', 'schedule_overrides', 'events', 'calendar_days_cache');

-- Check if sample data was inserted
SELECT COUNT(*) as rule_count FROM schedule_rules;
SELECT COUNT(*) as family_count FROM family;
```

## 🚀 **Next Steps**

1. **Add to your app**: Import and use `ScheduleRulesButton` in your WebContent.js
2. **Test the UI**: Try creating and editing schedule rules
3. **Integrate AI**: Use the `aiReschedulingService` for smart rescheduling

## 🔧 **Troubleshooting**

- **Tables already exist**: Use `DROP TABLE IF EXISTS` before creating
- **Permission errors**: Make sure you're using the service role key
- **Foreign key errors**: Verify `children`, `family`, and `subject` tables exist
- **RLS errors**: Check that the `profiles` table exists and has the right structure

The manual approach gives you full control and lets you see exactly where any issues occur! 🎉
