// Fix track table 406 error using Supabase client
// Run this in your browser console or as a Node.js script

import { supabase } from './lib/supabase.js';

async function fixTrackTable406Error() {
  try {
    console.log('Starting track table 406 error fix...');
    
    // 1. Check if track table exists and get its structure
    console.log('Checking track table structure...');
    
    try {
      const { data: trackStructure, error: structureError } = await supabase
        .from('track')
        .select('*')
        .limit(0); // This just gets the structure, no data
      
      if (structureError) {
        console.log('Track table query failed:', structureError.message);
        console.log('This suggests the table might not exist or has permission issues');
      } else {
        console.log('Track table exists and is accessible');
        console.log('Columns:', Object.keys(trackStructure || {}));
      }
    } catch (error) {
      console.log('Error checking track table:', error.message);
    }
    
    // 2. Try to create a minimal track record to test
    console.log('\nTesting track table insert...');
    
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
      
      console.log('User family_id:', profile.family_id);
      
      // Try to insert a test track record
      const { data: testTrack, error: insertError } = await supabase
        .from('track')
        .insert({
          family_id: profile.family_id
        })
        .select('id')
        .single();
      
      if (insertError) {
        console.error('Track insert failed:', insertError);
        
        // If it's a column issue, let's try to understand what columns exist
        if (insertError.code === '42703') {
          console.log('Column error detected. Let\'s check what columns the track table actually has...');
          
          // Try to get table info from information_schema (this might not work due to permissions)
          try {
            const { data: columns, error: columnsError } = await supabase
              .rpc('get_table_columns', { table_name: 'track' });
            
            if (columnsError) {
              console.log('Could not get column info via RPC:', columnsError.message);
              console.log('You may need to run the SQL script in Supabase dashboard instead');
            } else {
              console.log('Track table columns:', columns);
            }
          } catch (rpcError) {
            console.log('RPC call failed:', rpcError.message);
          }
        }
      } else {
        console.log('Track insert successful! Test track ID:', testTrack.id);
        
        // Clean up test data
        const { error: deleteError } = await supabase
          .from('track')
          .delete()
          .eq('id', testTrack.id);
        
        if (deleteError) {
          console.log('Warning: Could not delete test track:', deleteError.message);
        } else {
          console.log('Test track cleaned up successfully');
        }
      }
      
    } catch (error) {
      console.error('Error during track testing:', error.message);
    }
    
    // 3. Provide recommendations
    console.log('\n=== RECOMMENDATIONS ===');
    console.log('1. If you see column errors, run the SQL script: fix-track-table-406-error.sql');
    console.log('2. If you see permission errors, check RLS policies in Supabase dashboard');
    console.log('3. If the table doesn\'t exist, the SQL script will create it');
    
  } catch (error) {
    console.error('Error in fixTrackTable406Error:', error);
  }
}

// Export for use in other files
export { fixTrackTable406Error };

// If running directly, execute the fix
if (typeof window !== 'undefined') {
  // Browser environment
  window.fixTrackTable406Error = fixTrackTable406Error;
  console.log('fixTrackTable406Error function is now available in the browser console');
  console.log('Run: fixTrackTable406Error() to fix the track table 406 error');
} else {
  // Node.js environment
  fixTrackTable406Error();
}
