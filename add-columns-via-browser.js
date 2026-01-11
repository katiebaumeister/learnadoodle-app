// Run this in your browser console to add missing columns to the activities table
// Make sure you're logged into your app first

async function addMissingColumns() {
  try {
    // Get the Supabase client from your app
    const supabase = window.supabase || window.supabaseClient;
    
    if (!supabase) {
      return;
    }

    // Add due column
    const { error: dueError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE activities ADD COLUMN IF NOT EXISTS due BOOLEAN DEFAULT FALSE;'
    });
    
    if (dueError) {
    } else {
    }

    // Add minutes column
    const { error: minutesError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE activities ADD COLUMN IF NOT EXISTS minutes INTEGER;'
    });
    
    if (minutesError) {
    } else {
    }

    // Add assignee column if it doesn't exist
    const { error: assigneeError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE activities ADD COLUMN IF NOT EXISTS assignee TEXT;'
    });
    
    if (assigneeError) {
    } else {
    }
} catch (error) {
  }
}

// Alternative: If the RPC function doesn't exist, use this direct approach
async function addColumnsDirect() {
  try {
    const supabase = window.supabase || window.supabaseClient;
    
    if (!supabase) {
      return;
    }

    // Try to insert a test record with the new columns to see if they exist
    const { data, error } = await supabase
      .from('activities')
      .insert({
        name: 'TEST_COLUMN_CHECK',
        family_id: '00000000-0000-0000-0000-000000000000', // dummy ID
        due: false,
        minutes: 30,
        assignee: 'test'
      })
      .select();

    if (error && error.code === '42703') {
    } else if (error && error.code === '23505') {
      // Delete the test record
      await supabase
        .from('activities')
        .delete()
        .eq('name', 'TEST_COLUMN_CHECK');
    } else {
    }
} catch (error) {
  }
}

// Run the appropriate function

