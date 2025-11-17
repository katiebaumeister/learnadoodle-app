// Run this in your browser's console while logged into your app
// This will use your authenticated session to check the database

async function checkDatabaseWithAuth() {
  console.log('🔍 Checking database with your authenticated session...\n');

  try {
    // Get the Supabase client from your app (it should be available globally)
    const supabase = window.supabase || window.__supabase__;
    
    if (!supabase) {
      console.log('❌ Supabase client not found. Make sure you\'re on your app page.');
      return;
    }

    // Check current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.log('❌ Error getting user:', userError.message);
      return;
    }
    
    if (user) {
      console.log('✅ Authenticated as:', user.email);
      console.log('   User ID:', user.id);
    } else {
      console.log('❌ Not authenticated');
      return;
    }

    // Check families
    console.log('\n1. Checking families...');
    const { data: families, error: familiesError } = await supabase
      .from('family')
      .select('*');
    
    if (familiesError) {
      console.log('❌ Families error:', familiesError.message);
    } else {
      console.log('✅ Families found:', families?.length || 0);
      if (families && families.length > 0) {
        families.forEach((family, index) => {
          console.log(`   Family ${index + 1}:`, {
            id: family.id,
            name: family.name || 'No name',
            created_at: family.created_at
          });
        });
      }
    }

    // Check children
    console.log('\n2. Checking children...');
    const { data: children, error: childrenError } = await supabase
      .from('children')
      .select('*');
    
    if (childrenError) {
      console.log('❌ Children error:', childrenError.message);
    } else {
      console.log('✅ Children found:', children?.length || 0);
      if (children && children.length > 0) {
        children.forEach((child, index) => {
          console.log(`   Child ${index + 1}:`, {
            id: child.id,
            first_name: child.first_name,
            family_id: child.family_id
          });
        });
      }
    }

    // Check activity_instances
    console.log('\n3. Checking activity_instances...');
    const { data: activityInstances, error: aiError } = await supabase
      .from('activity_instances')
      .select('*')
      .limit(10);
    
    if (aiError) {
      console.log('❌ Activity instances error:', aiError.message);
    } else {
      console.log('✅ Activity instances found:', activityInstances?.length || 0);
      if (activityInstances && activityInstances.length > 0) {
        activityInstances.forEach((instance, index) => {
          console.log(`   Instance ${index + 1}:`, {
            id: instance.id,
            title: instance.title,
            scheduled_date: instance.scheduled_date,
            scheduled_time: instance.scheduled_time,
            family_id: instance.family_id
          });
        });
      }
    }

    // Check activities
    console.log('\n4. Checking activities...');
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*')
      .limit(5);
    
    if (activitiesError) {
      console.log('❌ Activities error:', activitiesError.message);
    } else {
      console.log('✅ Activities found:', activities?.length || 0);
      if (activities && activities.length > 0) {
        activities.forEach((activity, index) => {
          console.log(`   Activity ${index + 1}:`, {
            id: activity.id,
            name: activity.name,
            family_id: activity.family_id
          });
        });
      }
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log('   User:', user?.email || 'Not authenticated');
    console.log('   Families:', families?.length || 0);
    console.log('   Children:', children?.length || 0);
    console.log('   Activities:', activities?.length || 0);
    console.log('   Activity Instances:', activityInstances?.length || 0);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the check
checkDatabaseWithAuth();
