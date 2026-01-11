#!/usr/bin/env node

/**
 * Migration script to implement the new schedule rules system
 * Run this with: node run-schedule-migration.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    // Read the migration SQL file
    const migrationPath = path.join(process.cwd(), 'database-migration-schedule-rules.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      // If exec_sql doesn't exist, try direct execution

      // Split the SQL into individual statements and execute them
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        const { error: stmtError } = await supabase
          .from('_migration_temp')
          .select('*')
          .limit(0); // This will fail, but we'll catch the error
        
        // Actually execute the statement using raw SQL
        const { error: execError } = await supabase
          .rpc('exec', { sql: statement });

        if (execError && !execError.message.includes('relation "_migration_temp" does not exist')) {
          // Continue with other statements
        }
      }
    }

    // Verify the new tables exist

    const tables = ['schedule_rules', 'schedule_overrides', 'events', 'calendar_days_cache'];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
      } else {
      }
    }

    // Insert some sample rules for testing

    const { data: families } = await supabase
      .from('family')
      .select('id')
      .limit(1);

    if (families && families.length > 0) {
      const familyId = families[0].id;
      
      // Insert a sample family rule
      const { error: ruleError } = await supabase
        .from('schedule_rules')
        .insert({
          scope_type: 'family',
          scope_id: familyId,
          rule_type: 'availability_teach',
          title: 'Regular School Hours',
          description: 'Default teaching hours for the family',
          date_range: '[2025-01-01,2025-12-31)',
          start_time: '09:00',
          end_time: '15:00',
          rrule: {
            freq: 'WEEKLY',
            byweekday: [1, 2, 3, 4, 5],
            interval: 1
          },
          priority: 100,
          source: 'manual'
        });

      if (ruleError) {
      } else {
      }

      // Insert a sample override
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const { error: overrideError } = await supabase
        .from('schedule_overrides')
        .insert({
          scope_type: 'family',
          scope_id: familyId,
          date: tomorrow.toISOString().split('T')[0],
          override_kind: 'late_start',
          start_time: '10:00',
          notes: 'Doctor appointment - starting late'
        });

      if (overrideError) {
      } else {
      }
    }
} catch (error) {
    process.exit(1);
  }
}

// Handle the case where exec_sql doesn't exist
async function executeSQLDirectly(sql) {
  // This is a simplified approach - in practice you might need to use
  // a different method depending on your Supabase setup
  
  const statements = sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

  for (const statement of statements) {
    try {
      // Use a workaround to execute DDL statements
      const { error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'schedule_rules')
        .limit(1);

      // If no error, the table might already exist
} catch (err) {
    }
  }
}

// Run the migration
runMigration().catch(() => {});
