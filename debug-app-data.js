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
    
    // 4. Check academic years
    const { data: academicYears, error: yearsError } = await supabase
      .from('academic_years')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('start_date', { ascending: false });
      
    if (yearsError) {
      console.error('❌ Academic years fetch error:', yearsError);
      return;
    }
    
    console.log('✅ Academic years found:', academicYears.length);
    if (academicYears.length > 0) {
      console.log('📅 First year:', {
        id: academicYears[0].id,
        year_name: academicYears[0].year_name,
        family_id: academicYears[0].family_id,
        start_date: academicYears[0].start_date
      });
    }
    
    // 5. Check subject tracks
    const { data: tracks, error: tracksError } = await supabase
      .from('subject_track')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('name', { ascending: true });
      
    if (tracksError) {
      console.error('❌ Subject tracks fetch error:', tracksError);
      return;
    }
    
    console.log('✅ Subject tracks found:', tracks.length);
    if (tracks.length > 0) {
      console.log('📚 Track names:', tracks.map(t => t.name));
    }
    
    // 6. Check class day mappings (if we have an academic year)
    if (academicYears.length > 0) {
      const { data: mappings, error: mappingsError } = await supabase
        .from('class_day_mappings')
        .select('*')
        .eq('academic_year_id', academicYears[0].id)
        .order('class_date', { ascending: true })
        .limit(5);
        
      if (mappingsError) {
        console.error('❌ Class day mappings fetch error:', mappingsError);
      } else {
        console.log('✅ Class day mappings found:', mappings.length);
        if (mappings.length > 0) {
          console.log('📅 Sample dates:', mappings.map(m => m.class_date));
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
