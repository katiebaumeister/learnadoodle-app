const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Test database permissions and table access
async function testDatabasePermissions() {
  console.log('Testing database permissions...\n');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
    console.log('Please check your .env file for:');
    console.log('- EXPO_PUBLIC_SUPABASE_URL');
    console.log('- EXPO_PUBLIC_SUPABASE_ANON_KEY');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // 1. Test authentication
    console.log('1. Testing authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.log('Authentication failed:', authError.message);
      console.log('Please make sure you are logged in to the app first');
      return;
    }
    
    console.log('Authenticated as:', user.email);
    console.log('   User ID:', user.id);

    // 2. Test profiles table access
    console.log('\n2. Testing profiles table access...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.log('Profiles table access failed:', profileError.message);
      console.log('   Code:', profileError.code);
      console.log('   Details:', profileError.details);
    } else {
      console.log('Profiles table access successful');
      console.log('   Family ID:', profile.family_id);
    }

    // 3. Test family table access
    if (profile?.family_id) {
      console.log('\n3. Testing family table access...');
      const { data: family, error: familyError } = await supabase
        .from('family')
        .select('*')
        .eq('id', profile.family_id)
        .single();

      if (familyError) {
        console.log('Family table access failed:', familyError.message);
        console.log('   Code:', familyError.code);
      } else {
        console.log('Family table access successful');
        console.log('   Family Name:', family.name);
      }
    }

    // 4. Test activities table access
    console.log('\n4. Testing activities table access...');
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*')
      .limit(5);

    if (activitiesError) {
      console.log('Activities table access failed:', activitiesError.message);
      console.log('   Code:', activitiesError.code);
      console.log('   Details:', activitiesError.details);
      console.log('   Hint:', activitiesError.hint);
    } else {
      console.log('Activities table access successful');
      console.log('   Found', activities.length, 'activities');
    }

    // 5. Test calendar_days table access
    console.log('\n5. Testing calendar_days table access...');
    const { data: calendarDays, error: calendarDaysError } = await supabase
      .from('calendar_days')
      .select('*')
      .limit(5);

    if (calendarDaysError) {
      console.log('Calendar_days table access failed:', calendarDaysError.message);
      console.log('   Code:', calendarDaysError.code);
      console.log('   Details:', calendarDaysError.details);
    } else {
      console.log('Calendar_days table access successful');
      console.log('   Found', calendarDays.length, 'calendar days');
    }

    // 6. Test holidays table access
    console.log('\n6. Testing holidays table access...');
    const { data: holidays, error: holidaysError } = await supabase
      .from('holidays')
      .select('*')
      .limit(5);

    if (holidaysError) {
      console.log('Holidays table access failed:', holidaysError.message);
      console.log('   Code:', holidaysError.code);
      console.log('   Details:', holidaysError.details);
    } else {
      console.log('Holidays table access successful');
      console.log('   Found', holidays.length, 'holidays');
    }

    // 7. Test family_years table access
    console.log('\n7. Testing family_years table access...');
    const { data: familyYears, error: familyYearsError } = await supabase
      .from('family_years')
      .select('*')
      .limit(5);

    if (familyYearsError) {
      console.log('Family_years table access failed:', familyYearsError.message);
      console.log('   Code:', familyYearsError.code);
    } else {
      console.log('Family_years table access successful');
      console.log('   Found', familyYears.length, 'family years');
    }

    // 8. Test children table access
    console.log('\n8. Testing children table access...');
    const { data: children, error: childrenError } = await supabase
      .from('children')
      .select('*')
      .limit(5);

    if (childrenError) {
      console.log('Children table access failed:', childrenError.message);
      console.log('   Code:', childrenError.code);
    } else {
      console.log('Children table access successful');
      console.log('   Found', children.length, 'children');
    }

    // 9. Test subject table access
    console.log('\n9. Testing subject table access...');
    const { data: subjects, error: subjectsError } = await supabase
      .from('subject')
      .select('*')
      .limit(5);

    if (subjectsError) {
      console.log('Subject table access failed:', subjectsError.message);
      console.log('   Code:', subjectsError.code);
    } else {
      console.log('Subject table access successful');
      console.log('   Found', subjects.length, 'subjects');
    }

    console.log('\nSummary:');
    console.log('If you see errors above, you need to run the SQL fix script');
    console.log('If you see success messages, your database is working correctly');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the test
testDatabasePermissions();
