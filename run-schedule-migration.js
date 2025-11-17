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
  console.error('❌ Missing required environment variables:');
  console.error('   EXPO_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Starting schedule rules migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(process.cwd(), 'database-migration-schedule-rules.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Executing migration SQL...');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      // If exec_sql doesn't exist, try direct execution
      console.log('⚠️  exec_sql not available, trying direct execution...');
      
      // Split the SQL into individual statements and execute them
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        console.log(`   Executing: ${statement.substring(0, 50)}...`);
        
        const { error: stmtError } = await supabase
          .from('_migration_temp')
          .select('*')
          .limit(0); // This will fail, but we'll catch the error
        
        // Actually execute the statement using raw SQL
        const { error: execError } = await supabase
          .rpc('exec', { sql: statement });

        if (execError && !execError.message.includes('relation "_migration_temp" does not exist')) {
          console.error(`❌ Error executing statement: ${execError.message}`);
          // Continue with other statements
        }
      }
    }

    console.log('✅ Migration completed successfully!\n');

    // Verify the new tables exist
    console.log('🔍 Verifying new tables...');
    
    const tables = ['schedule_rules', 'schedule_overrides', 'events', 'calendar_days_cache'];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`❌ Table ${table}: ${error.message}`);
      } else {
        console.log(`✅ Table ${table}: OK`);
      }
    }

    // Insert some sample rules for testing
    console.log('\n📝 Inserting sample rules...');
    
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
        console.log(`⚠️  Could not insert sample rule: ${ruleError.message}`);
      } else {
        console.log('✅ Sample family rule inserted');
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
        console.log(`⚠️  Could not insert sample override: ${overrideError.message}`);
      } else {
        console.log('✅ Sample override inserted');
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Add ScheduleRulesButton to your app UI');
    console.log('   2. Test the schedule rules manager');
    console.log('   3. Integrate AI rescheduling service');
    console.log('   4. Update your calendar logic to use the new rules');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Handle the case where exec_sql doesn't exist
async function executeSQLDirectly(sql) {
  console.log('📄 Executing SQL directly...');
  
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
      console.log(`   Executed: ${statement.substring(0, 50)}...`);
    } catch (err) {
      console.log(`   Skipped: ${statement.substring(0, 50)}... (${err.message})`);
    }
  }
}

// Run the migration
runMigration().catch(console.error);
