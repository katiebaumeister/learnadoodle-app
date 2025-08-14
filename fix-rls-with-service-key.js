const { createClient } = require('@supabase/supabase-js')

// You need to replace this with your actual service role key from Supabase dashboard
// Go to: https://supabase.com/dashboard/project/mtftwebrtazhyzmmvmdl
// Settings > API > service_role key
const SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'

const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co'

async function fixRLS() {
  if (SERVICE_ROLE_KEY === 'YOUR_SERVICE_ROLE_KEY_HERE') {
    console.log('❌ Please replace SERVICE_ROLE_KEY with your actual service role key');
    console.log('');
    console.log('To get your service role key:');
    console.log('1. Go to: https://supabase.com/dashboard/project/mtftwebrtazhyzmmvmdl');
    console.log('2. Click "Settings" in the left sidebar');
    console.log('3. Click "API" in the settings menu');
    console.log('4. Copy the "service_role" key (starts with "eyJ...")');
    console.log('5. Replace the placeholder in this script');
    console.log('');
    console.log('Or run this SQL directly in the Supabase SQL Editor:');
    console.log('');
    console.log('```sql');
    console.log('-- Temporarily disable RLS on all calendar tables');
    console.log('ALTER TABLE IF EXISTS academic_years DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE IF EXISTS typical_holidays DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE IF EXISTS holidays DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE IF EXISTS class_days DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE IF EXISTS class_day_mappings DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE IF EXISTS lessons DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE IF EXISTS attendance DISABLE ROW LEVEL SECURITY;');
    console.log('```');
    return;
  }

  const supabase = createClient(supabaseUrl, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('🔧 Running RLS fix with service role...')
  
  try {
    // Disable RLS on all calendar tables
    const tables = [
      'academic_years',
      'typical_holidays', 
      'holidays',
      'class_days',
      'class_day_mappings',
      'lessons',
      'attendance'
    ]

    for (const table of tables) {
      console.log(`Disabling RLS on ${table}...`)
      
      const { error } = await supabase.rpc('exec_sql', { 
        sql: `ALTER TABLE IF EXISTS ${table} DISABLE ROW LEVEL SECURITY;` 
      })
      
      if (error) {
        console.log(`❌ Error disabling RLS on ${table}:`, error.message)
      } else {
        console.log(`✅ RLS disabled on ${table}`)
      }
    }

    console.log('🎉 RLS fix completed! Your calendar should now work.')
    
  } catch (error) {
    console.error('❌ RLS fix failed:', error)
  }
}

fixRLS() 