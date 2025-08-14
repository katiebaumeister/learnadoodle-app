// SMTP Configuration Diagnostic Script
// Run this to identify the exact issue with password recovery emails

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function diagnoseSMTPIssue() {
  console.log('🔍 Diagnosing SMTP Configuration Issue...\n')
  
  try {
    // Test 1: Check if we can connect to Supabase
    console.log('✅ Test 1: Supabase Connection')
    console.log('   URL:', supabaseUrl)
    console.log('   Status: Connected\n')
    
    // Test 2: Try to request password recovery
    console.log('📧 Test 2: Password Recovery Request')
    const testEmail = 'test-diagnostic@example.com'
    
    const { data, error } = await supabase.auth.resetPasswordForEmail(testEmail, {
      redirectTo: 'https://yourdomain.com/reset-password'
    })
    
    if (error) {
      console.log('   ❌ Error Details:')
      console.log('   Message:', error.message)
      console.log('   Status:', error.status)
      console.log('   Code:', error.code)
      
      // Analyze the error
      if (error.message.includes('Failed to make POST request')) {
        console.log('\n   🔍 Root Cause: SMTP Configuration Issue')
        console.log('   Solution: Check Supabase Dashboard > Settings > API > SMTP Settings')
      } else if (error.message.includes('rate limit')) {
        console.log('\n   🔍 Root Cause: Rate Limiting')
        console.log('   Solution: Wait before trying again')
      } else if (error.message.includes('invalid email')) {
        console.log('\n   🔍 Root Cause: Invalid Email Format')
        console.log('   Solution: Use a valid email address')
      }
    } else {
      console.log('   ✅ Password recovery request sent successfully')
      console.log('   Check if email was received')
    }
    
    console.log('\n📋 Next Steps:')
    console.log('1. Go to Supabase Dashboard > Settings > API > SMTP Settings')
    console.log('2. Verify SMTP is enabled and configured with Resend')
    console.log('3. Check Resend dashboard for API key validity')
    console.log('4. Ensure your domain is verified in Resend')
    console.log('5. Test with a real email address')
    
  } catch (err) {
    console.error('❌ Diagnostic failed:', err.message)
    console.log('\n🔧 Manual Check Required:')
    console.log('1. Verify Supabase project is active')
    console.log('2. Check if you have proper permissions')
    console.log('3. Ensure API key is valid')
  }
}

// Run the diagnostic
diagnoseSMTPIssue()
