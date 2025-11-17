// Debug App Data Access
// Run this in your app console to debug data loading issues

import { supabase } from './lib/supabase.js';

// Debug function to check data access
export const debugAppData = async () => {
  console.log('🔍 Starting App Data Debug...');
  
  try {
    // 1. Check current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('❌ User auth error:', userError);
      return;
    }
    console.log('✅ User authenticated:', user.email);
    
    // 2. Check user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
      
    if (profileError) {
      console.error('❌ Profile fetch error:', profileError);
      return;
    }
    
    console.log('✅ Profile loaded:', {
      id: profile.id,
      email: profile.email,
      family_id: profile.family_id
    });
    
    if (!profile.family_id) {
      console.error('❌ No family_id in profile!');
      return;
    }
    
    // 3. Check family exists
    const { data: family, error: familyError } = await supabase
      .from('family')
      .select('*')
      .eq('id', profile.family_id)
      .single();
      
    if (familyError) {
      console.error('❌ Family fetch error:', familyError);
      return;
    }
    
    console.log('✅ Family found:', {
      id: family.id,
      name: family.name
    });
    
    // 4. Check family years
    const { data: familyYears, error: yearsError } = await supabase
      .from('family_years')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('start_date', { ascending: false });
      
    if (yearsError) {
      console.error('❌ Family years fetch error:', yearsError);
      return;
    }
    
    console.log('✅ Family years found:', familyYears.length);
    if (familyYears.length > 0) {
      console.log('📅 First year:', {
        id: familyYears[0].id,
        start_date: familyYears[0].start_date,
        end_date: familyYears[0].end_date,
        family_id: familyYears[0].family_id,
        start_date: familyYears[0].start_date
      });
    }
    
    // 5. Check activities
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('created_at', { ascending: false });
      
    if (activitiesError) {
      console.error('❌ Activities fetch error:', activitiesError);
      return;
    }
    
    console.log('✅ Activities found:', activities.length);
    if (activities.length > 0) {
      console.log('📚 Activity names:', activities.map(a => a.name));
    }
    
    // 6. Check activity instances (if we have family years)
    if (familyYears && familyYears.length > 0) {
      const { data: instances, error: instancesError } = await supabase
        .from('activity_instances')
        .select('*')
        .eq('family_id', familyYears[0].family_id)
        .order('scheduled_date', { ascending: true })
        .limit(5);
        
      if (instancesError) {
        console.error('❌ Activity instances fetch error:', instancesError);
      } else {
        console.log('✅ Activity instances found:', instances.length);
        if (instances.length > 0) {
          console.log('📅 Sample dates:', instances.map(i => i.scheduled_date));
        }
      }
    }
    
    // 7. Check family_years table
    const { data: familyYears, error: familyYearsError } = await supabase
      .from('family_years')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('created_at', { ascending: false });
      
    if (familyYearsError) {
      console.error('❌ Family years fetch error:', familyYearsError);
    } else {
      console.log('✅ Family years found:', familyYears.length);
      if (familyYears.length > 0) {
        console.log('📅 Family year:', {
          id: familyYears[0].id,
          family_id: familyYears[0].family_id,
          global_year_id: familyYears[0].global_year_id
        });
      }
    }
    
    // 8. Check holidays (if we have family_years)
    if (familyYears && familyYears.length > 0) {
      const { data: holidays, error: holidaysError } = await supabase
        .from('holidays')
        .select('*')
        .eq('family_year_id', familyYears[0].id)
        .order('holiday_date', { ascending: true });
        
      if (holidaysError) {
        console.error('❌ Holidays fetch error:', holidaysError);
      } else {
        console.log('✅ Holidays found:', holidays.length);
        if (holidays.length > 0) {
          console.log('🎉 Sample holidays:', holidays.map(h => h.holiday_name));
        }
      }
    }
    
    console.log('🔍 Debug complete! Check the logs above for any issues.');
    
  } catch (error) {
    console.error('❌ Debug function error:', error);
  }
};

// Export for use in components
export default debugAppData;
