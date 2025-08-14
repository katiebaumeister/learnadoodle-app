// Test app authentication to see if that's the issue
// This will help us understand if the problem is with auth or database permissions

const { createClient } = require('@supabase/supabase-js');

// Use the same credentials as your app
const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAppAuthentication() {
  console.log('🔐 Testing app authentication...\n');

  try {
    // 1. Test basic connection
    console.log('1. Testing basic connection...');
    const { data: connectionTest, error: connectionError } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (connectionError) {
      console.log('❌ Connection failed:', connectionError.message);
      console.log('   Code:', connectionError.code);
      console.log('   Details:', connectionError.details);
      return;
    } else {
      console.log('✅ Connection successful');
    }

    // 2. Test authentication status
    console.log('\n2. Testing authentication status...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.log('❌ Authentication failed:', authError.message);
      console.log('   Code:', authError.code);
    } else if (user) {
      console.log('✅ User authenticated:', user.email);
      console.log('   User ID:', user.id);
    } else {
      console.log('⚠️  No user authenticated');
    }

    // 3. Test table access with current auth context
    console.log('\n3. Testing table access with current auth...');
    
    // Test activities
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*')
      .limit(1);
    
    if (activitiesError) {
      console.log('❌ Activities access failed:', activitiesError.message);
      console.log('   Code:', activitiesError.code);
      console.log('   Details:', activitiesError.details);
    } else {
      console.log('✅ Activities access successful');
      console.log('   Found', activities?.length || 0, 'rows');
    }

    // Test class_days
    const { data: classDays, error: classDaysError } = await supabase
      .from('class_days')
      .select('*')
      .limit(1);
    
    if (classDaysError) {
      console.log('❌ Class_days access failed:', classDaysError.message);
      console.log('   Code:', classDaysError.code);
      console.log('   Details:', classDaysError.details);
    } else {
      console.log('✅ Class_days access successful');
      console.log('   Found', classDays?.length || 0, 'rows');
    }

    // Test holidays
    const { data: holidays, error: holidaysError } = await supabase
      .from('holidays')
      .select('*')
      .limit(1);
    
    if (holidaysError) {
      console.log('❌ Holidays access failed:', holidaysError.message);
      console.log('   Code:', holidaysError.code);
      console.log('   Details:', holidaysError.details);
    } else {
      console.log('✅ Holidays access successful');
      console.log('   Found', holidays?.length || 0, 'rows');
    }

    // 4. Test if we can see any data at all
    console.log('\n4. Testing if we can see any data...');
    
    // Try to see what tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .limit(10);
    
    if (tablesError) {
      console.log('❌ Cannot query information_schema:', tablesError.message);
    } else {
      console.log('✅ Can query information_schema');
      console.log('   Available tables:', tables?.map(t => t.table_name).join(', '));
    }

    // 5. Summary
    console.log('\n📊 Summary:');
    if (user) {
      console.log('   ✅ User is authenticated');
    } else {
      console.log('   ❌ User is not authenticated');
    }
    
    console.log('   ✅ Connection to Supabase works');
    
    if (!activitiesError && !classDaysError && !holidaysError) {
      console.log('   ✅ All tables accessible');
      console.log('   🎉 The issue is resolved!');
    } else {
      console.log('   ❌ Some tables still not accessible');
      console.log('   🔍 Need to investigate further');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testAppAuthentication();
