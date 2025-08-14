// Test script for Doodle Assistant
// Run this to test the Doodle assistant functionality

import { processDoodleMessage, executeTool } from './lib/doodleAssistant.js';
import { supabase } from './lib/supabase.js';

async function testDoodleAssistant() {
  console.log('🧪 Testing Doodle Assistant...\n');
  
  try {
    // Get current user and family_id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('❌ No authenticated user found');
      return;
    }
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('id', user.id)
      .single();
    
    if (!profile?.family_id) {
      console.log('❌ No family_id found for user');
      return;
    }
    
    const familyId = profile.family_id;
    console.log(`✅ Found family_id: ${familyId}\n`);
    
    // Test cases
    const testCases = [
      {
        name: 'Direct Question',
        message: 'How many children do I have?',
        expected: 'direct_answer'
      },
      {
        name: 'Activity Logging',
        message: 'Log Algebra homework',
        expected: 'add_activity'
      },
      {
        name: 'Progress Check',
        message: 'How is Lily doing?',
        expected: 'progress_summary'
      },
      {
        name: 'Reschedule Request',
        message: 'Doctor appointment on Tuesday',
        expected: 'queue_reschedule'
      },
      {
        name: 'Subject Suggestions',
        message: 'What subjects for 6th grade?',
        expected: 'suggest_subjects'
      },
      {
        name: 'Course Suggestions',
        message: 'Suggest courses for Math',
        expected: 'suggest_courses'
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`🔍 Testing: ${testCase.name}`);
      console.log(`   Message: "${testCase.message}"`);
      
      try {
        const response = await processDoodleMessage(testCase.message, familyId);
        
        console.log(`   ✅ Response: ${response.message.substring(0, 100)}...`);
        console.log(`   Tool: ${response.tool || 'none'}`);
        console.log(`   Fetch: ${response.fetch || 'none'}`);
        
        if (response.tool) {
          console.log(`   🛠️  Executing tool: ${response.tool}`);
          try {
            const toolResult = await executeTool(response.tool, response.params, familyId);
            console.log(`   ✅ Tool executed successfully`);
          } catch (toolError) {
            console.log(`   ⚠️  Tool execution failed: ${toolError.message}`);
          }
        }
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
      
      console.log('');
    }
    
    console.log('🎉 Doodle Assistant test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (typeof window === 'undefined') {
  testDoodleAssistant();
}

export { testDoodleAssistant };
