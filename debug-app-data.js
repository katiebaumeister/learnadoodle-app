// Debug App Data Access
// Run this in your app console to debug data loading issues

import { supabase } from './lib/supabase.js';

// Debug function to check data access
export const debugAppData = async () => {
  try {
    // 1. Check current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      return;
    }

    // 2. Check user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
      
    if (profileError) {
      return;
    }

    if (!profile.family_id) {
      return;
    }
    
    // 3. Check family exists
    const { data: family, error: familyError } = await supabase
      .from('family')
      .select('*')
      .eq('id', profile.family_id)
      .single();
      
    if (familyError) {
      return;
    }

    // 4. Check family years
    const { data: familyYears, error: yearsError } = await supabase
      .from('family_years')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('start_date', { ascending: false });
      
    if (yearsError) {
      return;
    }

    if (familyYears.length > 0) {
    }
    
    // 5. Check activities
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('created_at', { ascending: false });
      
    if (activitiesError) {
      return;
    }

    if (activities.length > 0) {
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
      } else {
        if (instances.length > 0) {
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
    } else {
      if (familyYears.length > 0) {
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
      } else {
        if (holidays.length > 0) {
        }
      }
    }
} catch (error) {
  }
};

// Export for use in components
export default debugAppData;
