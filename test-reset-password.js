// Test file for reset password functionality
// Run this in the browser console to test

import { supabase } from './lib/supabase.js'

// Test reset password function
async function testResetPassword(email) {
  console.log('Testing reset password for:', email)
  
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email)
    console.log('Direct supabase call result:', { data, error })
    
    if (error) {
      console.error('Error:', error)
      return { success: false, error }
    } else {
      console.log('Success:', data)
      return { success: true, data }
    }
  } catch (err) {
    console.error('Exception:', err)
    return { success: false, error: err }
  }
}

// Export for testing
window.testResetPassword = testResetPassword 