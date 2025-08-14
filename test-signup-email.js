// Test script to debug signup email issues
// Run this with: node test-signup-email.js

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testSignUp() {
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'TestPass123!'
  
  console.log('Testing signup with email:', testEmail)
  
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
      console.log('Session:', data.session ? 'Present' : 'Not present')
      
      if (!data.user.email_confirmed_at) {
        console.log('⚠️  Email confirmation required')
      }
    } else if (error && error.message.includes('confirmation email')) {
      console.log('⚠️  User created but email failed to send')
      console.log('This is likely a Supabase email configuration issue')
      console.log('Check Authentication > Settings in Supabase dashboard')
    }
    
    if (error) {
      console.log('❌ Error occurred:', error.message)
    }
    
  } catch (err) {
    console.error('❌ Exception occurred:', err)
  }
}

// Run the test
testSignUp() 