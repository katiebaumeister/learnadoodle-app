// Check what data is actually in your Supabase database
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDatabaseData() {
  console.log('🔍 Checking database data...\n');

  try {
    // Check families table
    console.log('1. Checking families table...');
    const { data: families, error: familiesError } = await supabase
      .from('family')
      .select('*');
    
    if (familiesError) {
      console.log('❌ Families error:', familiesError.message);
    } else {
      console.log('✅ Families found:', families?.length || 0, 'families');
      if (families && families.length > 0) {
        console.log('   Sample family:', families[0]);
      }
    }

    // Check children table
    console.log('\n2. Checking children table...');
    const { data: children, error: childrenError } = await supabase
      .from('children')
      .select('*');
    
    if (childrenError) {
      console.log('❌ Children error:', childrenError.message);
    } else {
      console.log('✅ Children found:', children?.length || 0, 'children');
      if (children && children.length > 0) {
        console.log('   Sample child:', children[0]);
      }
    }

    // Check activities table
    console.log('\n3. Checking activities table...');
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*');
    
    if (activitiesError) {
      console.log('❌ Activities error:', activitiesError.message);
    } else {
      console.log('✅ Activities found:', activities?.length || 0, 'activities');
      if (activities && activities.length > 0) {
        console.log('   Sample activity:', activities[0]);
      }
    }

    // Check activity_instances table
    console.log('\n4. Checking activity_instances table...');
    const { data: activityInstances, error: aiError } = await supabase
      .from('activity_instances')
      .select('*');
    
    if (aiError) {
      console.log('❌ Activity instances error:', aiError.message);
    } else {
      console.log('✅ Activity instances found:', activityInstances?.length || 0, 'instances');
      if (activityInstances && activityInstances.length > 0) {
        console.log('   Sample instance:', activityInstances[0]);
        // Show a few more if available
        activityInstances.slice(0, 3).forEach((instance, index) => {
          console.log(`   Instance ${index + 1}:`, {
            id: instance.id,
            title: instance.title,
            scheduled_date: instance.scheduled_date,
            scheduled_time: instance.scheduled_time,
            finish_time: instance.finish_time,
            family_id: instance.family_id
          });
        });
      }
    }

    // Check holidays table
    console.log('\n5. Checking holidays table...');
    const { data: holidays, error: holidaysError } = await supabase
      .from('holidays')
      .select('*');
    
    if (holidaysError) {
      console.log('❌ Holidays error:', holidaysError.message);
    } else {
      console.log('✅ Holidays found:', holidays?.length || 0, 'holidays');
      if (holidays && holidays.length > 0) {
        console.log('   Sample holiday:', holidays[0]);
      }
    }

    // Check profiles table
    console.log('\n6. Checking profiles table...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesError) {
      console.log('❌ Profiles error:', profilesError.message);
    } else {
      console.log('✅ Profiles found:', profiles?.length || 0, 'profiles');
      if (profiles && profiles.length > 0) {
        console.log('   Sample profile:', profiles[0]);
      }
    }

    // Summary
    console.log('\n📊 Database Summary:');
    console.log('   Families:', families?.length || 0);
    console.log('   Children:', children?.length || 0);
    console.log('   Activities:', activities?.length || 0);
    console.log('   Activity Instances:', activityInstances?.length || 0);
    console.log('   Holidays:', holidays?.length || 0);
    console.log('   Profiles:', profiles?.length || 0);

    // Check if we have the expected data for calendar
    if (activityInstances && activityInstances.length > 0) {
      console.log('\n🎯 Calendar Data Analysis:');
      const eventsWithTimes = activityInstances.filter(instance => instance.scheduled_time);
      const eventsWithoutTimes = activityInstances.filter(instance => !instance.scheduled_time);
      
      console.log('   Events with scheduled_time:', eventsWithTimes.length);
      console.log('   Events without scheduled_time:', eventsWithoutTimes.length);
      
      if (eventsWithoutTimes.length > 0) {
        console.log('   Events missing time data:');
        eventsWithoutTimes.slice(0, 3).forEach(instance => {
          console.log(`     - ${instance.title} (${instance.scheduled_date})`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the check
checkDatabaseData();
