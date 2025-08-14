// Test family creation for new users
// This script verifies that when a user signs up, they get a unique family

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testFamilyCreation() {
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'TestPass123!'
  
  console.log('Testing family creation with email:', testEmail)
  console.log('')
  
  try {
    // Get initial family count
    const { data: initialFamilies, error: familyError } = await supabase
      .from('family')
      .select('id')
    
    if (familyError) {
      console.log('❌ Error getting initial family count:', familyError)
      return
    }
    
    const initialCount = initialFamilies?.length || 0
    console.log('Initial family count:', initialCount)
    
    // Attempt to sign up
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: 'Test User'
        }
      }
    })
    
    console.log('Signup response:')
    console.log('User created:', !!data?.user)
    console.log('Error:', error?.message || 'None')
    
    if (data?.user) {
      console.log('✅ User created successfully')
      console.log('User ID:', data.user.id)
      
      // Wait a moment for the trigger to execute
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Check if family was created
      const { data: newFamilies, error: newFamilyError } = await supabase
        .from('family')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (newFamilyError) {
        console.log('❌ Error getting new family:', newFamilyError)
      } else if (newFamilies && newFamilies.length > 0) {
        const newFamily = newFamilies[0]
        console.log('✅ Family created successfully')
        console.log('Family ID:', newFamily.id)
        console.log('Family Name:', newFamily.name)
        console.log('Family Created:', newFamily.created_at)
      } else {
        console.log('❌ No new family found')
      }
      
      // Check if profile was created with family_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, family_id')
        .eq('id', data.user.id)
        .single()
      
      if (profileError) {
        console.log('❌ Error getting profile:', profileError)
      } else if (profile) {
        console.log('✅ Profile created successfully')
        console.log('Profile ID:', profile.id)
        console.log('Profile Email:', profile.email)
        console.log('Profile Family ID:', profile.family_id)
        
        if (profile.family_id) {
          console.log('✅ Profile is linked to family')
        } else {
          console.log('❌ Profile is not linked to family')
        }
      } else {
        console.log('❌ No profile found')
      }
      
      // Get final family count
      const { data: finalFamilies, error: finalFamilyError } = await supabase
        .from('family')
        .select('id')
      
      if (!finalFamilyError) {
        const finalCount = finalFamilies?.length || 0
        console.log('Final family count:', finalCount)
        console.log('Families created:', finalCount - initialCount)
      }
      
    } else if (error) {
      console.log('❌ Signup failed:', error.message)
    }
    
  } catch (err) {
    console.error('❌ Exception occurred:', err)
  }
}

// Run the test
testFamilyCreation() 