// Enhanced Syllabus Processing Service
// Works with existing database structure and adds auto-pacing + calendar integration

import { supabase } from './supabase';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your-api-key-here";

// Debug: Check if API key is loaded (remove this in production)
console.log('OpenAI API Key loaded:', OPENAI_API_KEY ? 'Yes' : 'No');

// Sanitize syllabus text
export const sanitizeSyllabus = (text) => {
  // Step 1: Split into lines and strip leading/trailing whitespace
  let lines = text.split('\n').map(line => line.trim());
  
  // Step 2: Replace tabs with spaces
  lines = lines.map(line => line.replace(/\t/g, ' '));
  
  // Step 3: Filter out empty lines and platform tags
  lines = lines.filter(line => {
    // Remove empty lines
    if (!line || line.trim() === '') return false;
    
    // Remove common platform tags
    const platformTags = [
      /unit mastery:\s*\d+%/i,
      /progress:\s*\d+%/i,
      /completion:\s*\d+%/i,
      /score:\s*\d+%/i,
      /grade:\s*[a-f]/i,
      /status:\s*(completed|in progress|not started)/i,
      /due date:/i,
      /assigned:/i,
    ];
    
    return !platformTags.some(tag => tag.test(line));
  });
  
  // Step 4: Join lines with \n
  let singleLine = lines.join('\n');
  
  // Step 5: Escape double quotes
  singleLine = singleLine.replace(/"/g, '\\"');
  
  return singleLine;
};

// Parse syllabus into structured units and lessons
export const parseSyllabusStructure = (rawText) => {
  const lines = rawText.split('\n').map(line => line.trim()).filter(line => line);
  
  const units = [];
  let currentUnit = null;
  
  lines.forEach((line, index) => {
    // More flexible unit detection patterns
    const isUnitHeader = 
      line.match(/^(unit|chapter|module|section|quarter|semester|part)\s+\d+/i) ||
      line.match(/^\d+\.\s+/) ||
      line.match(/^[ivx]+\.\s+/i) ||
      line.match(/^quarter\s+\d+/i) ||
      line.match(/^semester\s+\d+/i) ||
      line.match(/^week\s+\d+/i) ||
      line.match(/^lesson\s+\d+/i) ||
      line.match(/^topic\s+\d+/i) ||
      line.match(/^[a-z]\s*\.\s+/i) || // Single letter followed by period
      line.match(/^[a-z]+\s*:\s+/i);   // Word followed by colon
    
    if (isUnitHeader) {
      if (currentUnit) {
        units.push(currentUnit);
      }
      
      currentUnit = {
        title: line,
        lessons: [],
        estimatedDays: 0
      };
    } else if (currentUnit && line.trim()) {
      // This is a lesson/subunit - clean up the title by removing leading dashes, bullets, and markdown
      const cleanTitle = line
        .replace(/^[-•*]\s*/, '') // Remove leading dashes, bullets, asterisks
        .replace(/^#{1,6}\s*/, '') // Remove markdown headers (###, ##, #)
        .replace(/^Unit\s+\d+:\s*/i, '') // Remove "Unit X:" prefix
        .trim();
      if (cleanTitle) {
        currentUnit.lessons.push({
          title: cleanTitle,
          estimatedDays: 1 // Default to 1 day per lesson
        });
      }
    } else if (!currentUnit && line.trim()) {
      // If we haven't found a unit yet, create a default one
      currentUnit = {
        title: 'Unit 1: Introduction',
        lessons: [],
        estimatedDays: 0
      };
      const cleanTitle = line
        .replace(/^[-•*]\s*/, '') // Remove leading dashes, bullets, asterisks
        .replace(/^#{1,6}\s*/, '') // Remove markdown headers (###, ##, #)
        .replace(/^Unit\s+\d+:\s*/i, '') // Remove "Unit X:" prefix
        .trim();
      if (cleanTitle) {
        currentUnit.lessons.push({
          title: cleanTitle,
          estimatedDays: 1
        });
      }
    }
  });
  
  // Add the last unit
  if (currentUnit) {
    units.push(currentUnit);
  }
  
  return units;
};

// Auto-pace the syllabus based on available teaching days
export const autoPaceSyllabus = (units, startDate, endDate, teachingDays = [1, 2, 3, 4, 5]) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
  // Calculate available teaching days
  let availableDays = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (teachingDays.includes(d.getDay())) {
      availableDays++;
    }
  }
  
  // Distribute units across available days
  const totalLessons = units.reduce((sum, unit) => sum + unit.lessons.length, 0);
  const daysPerLesson = Math.max(1, Math.floor(availableDays / totalLessons));
  
  let currentDate = new Date(start);
  const pacedUnits = units.map(unit => ({
    ...unit,
    lessons: unit.lessons.map(lesson => {
      // Find next teaching day
      while (!teachingDays.includes(currentDate.getDay())) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      const lessonDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + daysPerLesson);
      
      return {
        ...lesson,
        scheduledDate: lessonDate.toISOString().split('T')[0],
        estimatedDays: daysPerLesson
      };
    })
  }));
  
  return pacedUnits;
};

// Process syllabus with AI for better structure
export const processSyllabusWithAI = async (courseOutlineRaw, model = "gpt-4o-mini") => {
  try {
    console.log('Starting AI processing with model:', model);
    console.log('Raw input (first 200 chars):', courseOutlineRaw.substring(0, 200) + '...');
    
    const sanitizedText = sanitizeSyllabus(courseOutlineRaw);
    console.log('Sanitized text (first 200 chars):', sanitizedText.substring(0, 200) + '...');
    
    const systemPrompt = `You are a helpful assistant that converts raw course outlines into clean, structured format.

Instructions:
1. Strip empty lines, platform tags, and control characters.
2. Keep the provider's original unit/lesson wording verbatim.
3. Format as:
   ### Unit N: <unit name>
   - <subunit or lesson 1>
   - <subunit or lesson 2>
4. Preserve numbering that appears in the raw text.
5. Do NOT summarise, translate, or add commentary.
6. Return clean, structured markdown.

Example output:
### Unit 1: Algebra foundations
- Introduction to variables
- Combining like terms

### Unit 2: Equations & inequalities
- Linear equations
- Solving inequalities`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Curriculum text:\n${sanitizedText}` }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    console.log('AI Response:', aiResponse);
    return aiResponse;
    
  } catch (error) {
    console.error('AI processing failed, using fallback:', error);
    // Fallback to basic parsing
    return parseSyllabusStructure(courseOutlineRaw).map(unit => 
      `### ${unit.title}\n${unit.lessons.map(lesson => `- ${lesson.title}`).join('\n')}`
    ).join('\n\n');
  }
};

// Save syllabus to existing database structure
export const saveSyllabus = async (syllabusData) => {
  try {
    // Get the current user and their family_id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get user's profile to find family_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.family_id) {
      throw new Error('Family not found for user');
    }

    // First, get the subject ID for the course title
    const { data: subject, error: subjectError } = await supabase
      .from('subject')
      .select('id')
      .eq('family_id', profile.family_id)
      .eq('name', syllabusData.course_title)
      .single();

    if (subjectError || !subject) {
      throw new Error(`Subject '${syllabusData.course_title}' not found. Please create the subject first.`);
    }

    // Get the first child for this family (or you could make this configurable)
    const { data: child, error: childError } = await supabase
      .from('children')
      .select('id, first_name')
      .eq('family_id', profile.family_id)
      .limit(1)
      .single();

    if (childError || !child) {
      throw new Error('No children found for this family. Please add children first.');
    }

    // Save to subject_track table with new structure
    const trackData = {
      family_id: profile.family_id,
      subject_id: subject.id,
      child_id: child.id,
      name: `${child.first_name}'s ${syllabusData.course_title}`,
      grade: '4th Grade', // This could be configurable
      start_date: syllabusData.start_date || new Date().toISOString().split('T')[0],
      end_date: syllabusData.end_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: savedTrack, error: insertError } = await supabase
      .from('subject_track')
      .insert([trackData])
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting syllabus:', insertError);
      throw new Error(`Failed to save syllabus: ${insertError.message}`);
    }

    // Store the processed syllabus content in localStorage for now
    // (since we don't have course_outline columns in the database)
    const syllabusContent = {
      track_id: savedTrack.id,
      course_title: syllabusData.course_title,
      provider_name: syllabusData.provider_name,
      course_outline: syllabusData.course_outline,
      course_outline_raw: syllabusData.course_outline_raw,
      units: syllabusData.units,
      auto_paced: syllabusData.auto_paced || false,
      created_at: new Date().toISOString()
    };

    localStorage.setItem(`syllabus_${savedTrack.id}`, JSON.stringify(syllabusContent));

    console.log('Syllabus saved successfully:', savedTrack);
    
    return {
      id: savedTrack.id,
      ...syllabusData,
      created_at: savedTrack.created_at,
      track_id: savedTrack.id,
    };

  } catch (error) {
    console.error('Error saving syllabus:', error);
    throw error;
  }
};

// Add lessons to calendar
export const addLessonsToCalendar = async (trackId, units) => {
  try {
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

    // Get the track to find family_id
    const { data: track } = await supabase
      .from('subject_track')
      .select('family_id')
      .eq('id', trackId)
      .single();

    if (!track) {
      throw new Error('Track not found');
    }

    // Create or get a track record for this subject_track
    let trackRecord;
    console.log('Checking for existing track in "track" table...');
    
    try {
      // First, let's check what columns the track table actually has
      const { data: existingTrack, error: trackQueryError } = await supabase
        .from('track')
        .select('id')
        .eq('family_id', track.family_id)
        .limit(1)
        .single();

      if (trackQueryError) {
        console.log('Track table query error (this is expected if no tracks exist):', trackQueryError.message);
        // Continue to create a new track
      } else if (existingTrack) {
        console.log('Found existing track in "track" table, reusing ID:', existingTrack.id);
        trackRecord = existingTrack;
      }
    } catch (error) {
      console.log('Error querying track table (this is expected if no tracks exist):', error.message);
    }

    // If no existing track found, create a new one
    if (!trackRecord) {
      console.log('Creating new record in "track" table...');
      try {
        const { data: newTrack, error: trackError } = await supabase
          .from('track')
          .insert({
            family_id: track.family_id
          })
          .select('id')
          .single();

        if (trackError) {
          console.error('Error creating record in track table:', trackError);
          // Don't throw error, just log it and continue without track_id
          trackRecord = null;
        } else {
          console.log('Successfully created new record in "track" table with ID:', newTrack.id);
          trackRecord = newTrack;
        }
      } catch (insertError) {
        console.error('Error during track creation:', insertError);
        trackRecord = null;
      }
    }

    // Get the first child in the family to assign lessons to
    const { data: children, error: childrenError } = await supabase
      .from('children')
      .select('id')
      .eq('family_id', track.family_id)
      .limit(1);

    if (childrenError || !children || children.length === 0) {
      throw new Error('No children found in family');
    }

    const childId = children[0].id;
    const activities = [];
    const activityInstances = [];

    units.forEach(unit => {
      unit.lessons.forEach(lesson => {
        if (lesson.scheduledDate) {
          // Create activity template
          const activityId = crypto.randomUUID();
          activities.push({
            id: activityId,
            family_id: track.family_id,
            name: lesson.title,
            description: `${unit.title} - ${lesson.title}`,
            activity_type: 'lesson',
            minutes: 60,
            created_at: new Date().toISOString(),
          });

          // Create scheduled instance - matching your exact database schema
          // Create scheduled instance - matching your exact database schema
          const instanceData = {
            id: crypto.randomUUID(),
            family_id: track.family_id,
            activity_id: activityId,
            scheduled_date: lesson.scheduledDate,
            status: 'planned',
            title: lesson.title,
            description: `${unit.title} - ${lesson.title}`,
            scheduled_time: '09:00:00',
            minutes: 60,
            due: false,
            created_at: new Date().toISOString(),
          };

          // Only add track_id if we successfully created a track
          if (trackRecord && trackRecord.id) {
            instanceData.track_id = trackRecord.id;
          }

          activityInstances.push(instanceData);
        }
      });
    });

    // Insert activities and instances
    if (activities.length > 0) {
      console.log(`Inserting ${activities.length} records into 'activities' table...`);
      const { error: activitiesError } = await supabase
        .from('activities')
        .insert(activities);
      
      if (activitiesError) {
        console.error('Error inserting into activities table:', activitiesError);
      } else {
        console.log(`Successfully inserted ${activities.length} records into 'activities' table`);
      }
    }

    if (activityInstances.length > 0) {
      console.log(`Inserting ${activityInstances.length} records into 'activity_instances' table...`);
      const { error: instancesError } = await supabase
        .from('activity_instances')
        .insert(activityInstances);
      
      if (instancesError) {
        console.error('Error inserting into activity_instances table:', instancesError);
      } else {
        console.log(`Successfully inserted ${activityInstances.length} records into 'activity_instances' table`);
      }
    }

    return { activities: activities.length, instances: activityInstances.length };

  } catch (error) {
    console.error('Error adding lessons to calendar:', error);
    throw error;
  }
};

// Main function to process and save syllabus
export const processAndSaveSyllabus = async (courseTitle, providerName, courseOutlineRaw, options = {}) => {
  try {
    console.log('Starting syllabus processing with options:', options);
    
    // Process with AI
    const processedOutline = await processSyllabusWithAI(courseOutlineRaw);
    console.log('AI processing completed');
    
    // Parse into structured units
    const units = parseSyllabusStructure(processedOutline);
    console.log('Parsed units:', units.length, 'units with', units.reduce((sum, u) => sum + u.lessons.length, 0), 'total lessons');
    
    // Auto-pace if requested
    let autoPacedUnits = units;
    if (options.autoPace && options.startDate && options.endDate) {
      console.log('Auto-pacing enabled with dates:', options.startDate, 'to', options.endDate);
      console.log('Teaching days:', options.teachingDays);
      
      autoPacedUnits = autoPaceSyllabus(units, options.startDate, options.endDate, options.teachingDays);
      console.log('Auto-pacing completed. Units now have scheduled dates');
    } else {
      console.log('Auto-pacing not enabled. Options:', {
        autoPace: options.autoPace,
        startDate: options.startDate,
        endDate: options.endDate
      });
    }
    
    // Prepare syllabus data
    const syllabusData = {
      course_title: courseTitle,
      provider_name: providerName,
      course_outline: processedOutline,
      course_outline_raw: courseOutlineRaw,
      units: autoPacedUnits,
      auto_paced: options.autoPace || false,
      start_date: options.startDate,
      end_date: options.endDate,
    };
    
    console.log('Saving syllabus data...');
    
    // Save to database
    const savedSyllabus = await saveSyllabus(syllabusData);
    console.log('Syllabus saved to database');
    
    // Add to calendar if auto-paced
    if (options.autoPace && options.addToCalendar) {
      console.log('Adding lessons to calendar...');
      const calendarResult = await addLessonsToCalendar(savedSyllabus.track_id, autoPacedUnits);
      console.log('Calendar integration completed:', calendarResult);
    } else {
      console.log('Calendar integration not enabled. Options:', {
        autoPace: options.autoPace,
        addToCalendar: options.addToCalendar
      });
    }
    
    return savedSyllabus;
    
  } catch (error) {
    console.error('Error in processAndSaveSyllabus:', error);
    throw error;
  }
};

// Get syllabus by track ID
export const getSyllabus = async (trackId) => {
  try {
    const syllabusContent = localStorage.getItem(`syllabus_${trackId}`);
    if (syllabusContent) {
      return JSON.parse(syllabusContent);
    }
    return null;
  } catch (error) {
    console.error('Error getting syllabus:', error);
    return null;
  }
};

// Get all syllabi for a family
export const getAllSyllabi = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('id', user.id)
      .single();

    if (!profile?.family_id) return [];

    // Get all tracks for the family
    const { data: tracks } = await supabase
      .from('subject_track')
      .select('*')
      .eq('family_id', profile.family_id);

    if (!tracks) return [];

    // Get syllabus content for each track
    const syllabi = tracks.map(track => {
      const syllabusContent = localStorage.getItem(`syllabus_${track.id}`);
      if (syllabusContent) {
        return { ...track, ...JSON.parse(syllabusContent) };
      }
      return track;
    });

    return syllabi;

  } catch (error) {
    console.error('Error getting all syllabi:', error);
    return [];
  }
}; 