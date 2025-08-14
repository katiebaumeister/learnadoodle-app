// Test SMTP configuration
// This script helps verify if the SMTP settings are working

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testSMTPConfig() {
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'TestPass123!'
  
  console.log('Testing SMTP configuration with email:', testEmail)
  console.log('SMTP Provider: Resend (smtp.resend.com:587)')
  console.log('')
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    })
    
    console.log('Signup response:')
    console.log('Data:', JSON.stringify(data, null, 2))
    console.log('Error:', error)
    
    if (data?.user) {
      console.log('✅ User created successfully')
      console.log('User ID:', data.user.id)
      console.log('Email confirmed:', data.user.email_confirmed_at)
      
      if (!data.user.email_confirmed_at) {
        console.log('⚠️  Email confirmation required')
        console.log('Check your email (including spam folder) for confirmation link')
      }
    }
    
    if (error) {
      if (error.message.includes('confirmation email')) {
        console.log('❌ SMTP Configuration Issue:')
        console.log('1. Check Supabase Settings > API > SMTP Settings')
        console.log('2. Verify Resend API key is correct')
        console.log('3. Ensure domain is verified in Resend')
        console.log('4. Check SMTP Sender email is valid')
      } else {
        console.log('❌ Other error:', error.message)
      }
    }
    
  } catch (err) {
    console.error('❌ Exception occurred:', err)
  }
}

// Run the test
testSMTPConfig() 