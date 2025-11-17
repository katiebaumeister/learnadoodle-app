// Run this in your browser console to add missing columns to the activities table
// Make sure you're logged into your app first

async function addMissingColumns() {
  try {
    // Get the Supabase client from your app
    const supabase = window.supabase || window.supabaseClient;
    
    if (!supabase) {
      console.error('Supabase client not found. Make sure you\'re logged into your app.');
      return;
    }

    console.log('Adding missing columns to activities table...');

    // Add due column
    const { error: dueError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE activities ADD COLUMN IF NOT EXISTS due BOOLEAN DEFAULT FALSE;'
    });
    
    if (dueError) {
      console.log('Due column error (might already exist):', dueError);
    } else {
      console.log('✅ Due column added successfully');
    }

    // Add minutes column
    const { error: minutesError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE activities ADD COLUMN IF NOT EXISTS minutes INTEGER;'
    });
    
    if (minutesError) {
      console.log('Minutes column error (might already exist):', minutesError);
    } else {
      console.log('✅ Minutes column added successfully');
    }

    // Add assignee column if it doesn't exist
    const { error: assigneeError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE activities ADD COLUMN IF NOT EXISTS assignee TEXT;'
    });
    
    if (assigneeError) {
      console.log('Assignee column error (might already exist):', assigneeError);
    } else {
      console.log('✅ Assignee column added successfully');
    }

    console.log('🎉 Column addition complete! Refresh your app to test the new fields.');
    
  } catch (error) {
    console.error('Error adding columns:', error);
    console.log('You may need to add these columns manually in your Supabase dashboard.');
  }
}

// Alternative: If the RPC function doesn't exist, use this direct approach
async function addColumnsDirect() {
  try {
    const supabase = window.supabase || window.supabaseClient;
    
    if (!supabase) {
      console.error('Supabase client not found.');
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
      console.log('❌ Columns are missing. You need to add them manually in Supabase dashboard.');
      console.log('Required columns: due (BOOLEAN), minutes (INTEGER), assignee (TEXT)');
    } else if (error && error.code === '23505') {
      console.log('✅ Columns exist! Deleting test record...');
      // Delete the test record
      await supabase
        .from('activities')
        .delete()
        .eq('name', 'TEST_COLUMN_CHECK');
    } else {
      console.log('Test result:', { data, error });
    }
    
  } catch (error) {
    console.error('Error checking columns:', error);
  }
}

// Run the appropriate function
console.log('Choose one:');
console.log('1. addMissingColumns() - Try to add columns via RPC');
console.log('2. addColumnsDirect() - Check if columns exist');
console.log('');
console.log('If columns are missing, you\'ll need to add them manually in your Supabase dashboard:');
console.log('- due: BOOLEAN DEFAULT FALSE');
console.log('- minutes: INTEGER');
console.log('- assignee: TEXT');
