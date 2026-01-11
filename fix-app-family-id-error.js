// =====================================================
// FIX APP.FAMILY_ID CONFIGURATION PARAMETER ERROR
// =====================================================
// This script removes the problematic RLS policy that uses current_setting('app.family_id')
// which is causing the "unrecognized configuration parameter" error

const { createClient } = require('@supabase/supabase-js');

// You'll need to add your Supabase credentials here
const supabaseUrl = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY';

async function fixAppFamilyIdError() {
    try {
        // Create Supabase client with service role key for admin access
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // 1. Drop the problematic RLS policy

        const { error: dropError } = await supabase.rpc('exec_sql', {
            sql: `
                DROP POLICY IF EXISTS lesson_instances_family_policy ON lesson_instances;
            `
        });
        
        if (dropError) {
        } else {
        }
        
        // 2. Create a simple RLS policy instead

        const { error: createError } = await supabase.rpc('exec_sql', {
            sql: `
                CREATE POLICY lesson_instances_simple_policy ON lesson_instances
                FOR ALL USING (auth.role() = 'authenticated');
            `
        });
        
        if (createError) {
        } else {
        }
        
        // 3. Alternative: Disable RLS completely if needed

        const { error: disableError } = await supabase.rpc('exec_sql', {
            sql: `
                ALTER TABLE lesson_instances DISABLE ROW LEVEL SECURITY;
            `
        });
        
        if (disableError) {
        } else {
        }
        
        // 4. Verify the fix

        const { data: testData, error: testError } = await supabase
            .from('lesson_instances')
            .select('*')
            .limit(1);
        
        if (testError) {
        } else {
        }
} catch (error) {
    }
}

// Run the fix
fixAppFamilyIdError();
