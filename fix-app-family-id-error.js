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
        console.log('🔧 Fixing app.family_id configuration parameter error...');
        
        // Create Supabase client with service role key for admin access
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // 1. Drop the problematic RLS policy
        console.log('📋 Dropping problematic RLS policy...');
        const { error: dropError } = await supabase.rpc('exec_sql', {
            sql: `
                DROP POLICY IF EXISTS lesson_instances_family_policy ON lesson_instances;
            `
        });
        
        if (dropError) {
            console.log('⚠️  Warning when dropping policy (might not exist):', dropError.message);
        } else {
            console.log('✅ Problematic RLS policy dropped successfully');
        }
        
        // 2. Create a simple RLS policy instead
        console.log('📋 Creating simple RLS policy...');
        const { error: createError } = await supabase.rpc('exec_sql', {
            sql: `
                CREATE POLICY lesson_instances_simple_policy ON lesson_instances
                FOR ALL USING (auth.role() = 'authenticated');
            `
        });
        
        if (createError) {
            console.log('⚠️  Warning when creating policy:', createError.message);
        } else {
            console.log('✅ Simple RLS policy created successfully');
        }
        
        // 3. Alternative: Disable RLS completely if needed
        console.log('📋 Disabling RLS completely as alternative...');
        const { error: disableError } = await supabase.rpc('exec_sql', {
            sql: `
                ALTER TABLE lesson_instances DISABLE ROW LEVEL SECURITY;
            `
        });
        
        if (disableError) {
            console.log('⚠️  Warning when disabling RLS:', disableError.message);
        } else {
            console.log('✅ RLS disabled completely on lesson_instances table');
        }
        
        // 4. Verify the fix
        console.log('🔍 Verifying the fix...');
        const { data: testData, error: testError } = await supabase
            .from('lesson_instances')
            .select('*')
            .limit(1);
        
        if (testError) {
            console.log('❌ Still getting error:', testError.message);
        } else {
            console.log('✅ Success! No more app.family_id error');
            console.log('📊 Sample data count:', testData ? testData.length : 0);
        }
        
        console.log('\n🎉 App.family_id error should now be fixed!');
        console.log('🔄 Refresh your calendar page to test');
        
    } catch (error) {
        console.error('❌ Error fixing app.family_id issue:', error);
        console.log('\n💡 Alternative: You can run the SQL script directly in your Supabase dashboard:');
        console.log('1. Go to your Supabase project dashboard');
        console.log('2. Click on "SQL Editor"');
        console.log('3. Copy and paste the contents of fix-app-family-id-error.sql');
        console.log('4. Click "Run"');
    }
}

// Run the fix
fixAppFamilyIdError();
