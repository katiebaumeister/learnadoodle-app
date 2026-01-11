import { createClient } from '@supabase/supabase-js'

// Admin client that bypasses RLS for testing
// WARNING: This should only be used for testing, not in production
const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MzczNzAxNCwiZXhwIjoyMDU5MzEzMDE0fQ.K8yXuq8y9Gee80P4dQ6YhSATSeL2rxiF9yseB3q_Hn4'

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Test function to verify admin access
export const testAdminAccess = async () => {
  try {
    // Test family_years
    const { data: familyYears, error: familyYearsError } = await supabaseAdmin
      .from('family_years')
      .select('*')
      .limit(1);
    
    if (familyYearsError) {
    } else {
    }
    
    // Test typical_holidays
    const { data: holidays, error: holidayError } = await supabaseAdmin
      .from('typical_holidays')
      .select('*')
      .limit(1);
    
    if (holidayError) {
    } else {
    }
    
    return { familyYears, holidays, familyYearsError, holidayError };
  } catch (error) {
    return { error };
  }
};

// Admin function to change user password
export const changeUserPassword = async (userId, newPassword) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );
    
    if (error) {
      return { data: null, error };
    } else {
      return { data, error: null };
    }
  } catch (error) {
    return { data: null, error };
  }
}; 