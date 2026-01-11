// Check what data is actually in your Supabase database
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mtftwebrtazhyzmmvmdl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnR3ZWJydGF6aHl6bW12bWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3MzcwMTQsImV4cCI6MjA1OTMxMzAxNH0.KWBCgQN-xm9mFjRA8kqU4xbiE6Hz7McvlO4w8I6gAEw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDatabaseData() {
  try {
    // Check families table

    const { data: families, error: familiesError } = await supabase
      .from('family')
      .select('*');
    
    if (familiesError) {
    } else {
      if (families && families.length > 0) {
      }
    }

    // Check children table

    const { data: children, error: childrenError } = await supabase
      .from('children')
      .select('*');
    
    if (childrenError) {
    } else {
      if (children && children.length > 0) {
      }
    }

    // Check activities table

    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*');
    
    if (activitiesError) {
    } else {
      if (activities && activities.length > 0) {
      }
    }

    // Check activity_instances table

    const { data: activityInstances, error: aiError } = await supabase
      .from('activity_instances')
      .select('*');
    
    if (aiError) {
    } else {
      if (activityInstances && activityInstances.length > 0) {
        // Show a few more if available
        activityInstances.slice(0, 3).forEach((instance, index) => {
        });
      }
    }

    // Check holidays table

    const { data: holidays, error: holidaysError } = await supabase
      .from('holidays')
      .select('*');
    
    if (holidaysError) {
    } else {
      if (holidays && holidays.length > 0) {
      }
    }

    // Check profiles table

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesError) {
    } else {
      if (profiles && profiles.length > 0) {
      }
    }

    // Summary

    // Check if we have the expected data for calendar
    if (activityInstances && activityInstances.length > 0) {
      const eventsWithTimes = activityInstances.filter(instance => instance.scheduled_time);
      const eventsWithoutTimes = activityInstances.filter(instance => !instance.scheduled_time);

      if (eventsWithoutTimes.length > 0) {
        eventsWithoutTimes.slice(0, 3).forEach(instance => {
        });
      }
    }
} catch (error) {
  }
}

// Run the check
checkDatabaseData();
