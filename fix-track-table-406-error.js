// Fix track table 406 error using Supabase client
// Run this in your browser console or as a Node.js script

import { supabase } from './lib/supabase.js';

async function fixTrackTable406Error() {
  try {
    // 1. Check if track table exists and get its structure

    try {
      const { data: trackStructure, error: structureError } = await supabase
        .from('track')
        .select('*')
        .limit(0); // This just gets the structure, no data
      
      if (structureError) {
      } else {
      }
    } catch (error) {
    }
    
    // 2. Try to create a minimal track record to test

    try {
      // Get current user and family_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();
      
      if (!profile?.family_id) {
        throw new Error('Family not found for user');
      }

      // Try to insert a test track record
      const { data: testTrack, error: insertError } = await supabase
        .from('track')
        .insert({
          family_id: profile.family_id
        })
        .select('id')
        .single();
      
      if (insertError) {
        // If it's a column issue, let's try to understand what columns exist
        if (insertError.code === '42703') {
          // Try to get table info from information_schema (this might not work due to permissions)
          try {
            const { data: columns, error: columnsError } = await supabase
              .rpc('get_table_columns', { table_name: 'track' });
            
            if (columnsError) {
            } else {
            }
          } catch (rpcError) {
          }
        }
      } else {
        // Clean up test data
        const { error: deleteError } = await supabase
          .from('track')
          .delete()
          .eq('id', testTrack.id);
        
        if (deleteError) {
        } else {
        }
      }
} catch (error) {
    }
    
    // 3. Provide recommendations
} catch (error) {
  }
}

// Export for use in other files
export { fixTrackTable406Error };

// If running directly, execute the fix
if (typeof window !== 'undefined') {
  // Browser environment
  window.fixTrackTable406Error = fixTrackTable406Error;
} else {
  // Node.js environment
  fixTrackTable406Error();
}
