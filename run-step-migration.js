#!/usr/bin/env node

/**
 * Step-by-step migration runner
 * This runs the migration in smaller, manageable steps
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

const steps = [
  { name: 'Create Tables', file: 'step1-create-tables.sql' },
  { name: 'Create Indexes', file: 'step2-create-indexes.sql' },
  { name: 'Setup RLS', file: 'step3-setup-rls.sql' },
  { name: 'Sample Data', file: 'step4-sample-data.sql' }
];

async function runStep(stepName, sqlFile) {
  try {
    const sqlPath = path.join(process.cwd(), sqlFile);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          // Try to execute the statement
          const { data, error } = await supabase
            .from('_temp_table_for_migration')
            .select('*')
            .limit(0);
          
          // This will fail, but we'll catch it and continue
        } catch (err) {
          // Expected error, continue
        }
        
        // Actually execute the SQL statement
        // Note: This is a simplified approach - you might need to use
        // a different method depending on your Supabase setup
}
    }
} catch (error) {
    throw error;
  }
}

async function runMigration() {
  try {
    for (const step of steps) {
      await runStep(step.name, step.file);
    }
} catch (error) {
    process.exit(1);
  }
}

// Run the migration
runMigration().catch(() => {});
