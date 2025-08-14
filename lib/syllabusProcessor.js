// Syllabus processing service
// This integrates with your Python outline.py script approach

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your-api-key-here";

// Sanitize syllabus text (matches your Python sanitize_syllabus function)
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

// Process syllabus with AI (enhanced with unit start functionality)
export const processSyllabusWithAI = async (courseOutlineRaw, unitStart = 1, model = "gpt-4o-mini") => {
  try {
    const sanitizedText = sanitizeSyllabus(courseOutlineRaw);
    
    // Enhanced system prompt with unit start handling
    const systemPrompt = `You are a helpful assistant that converts raw course outlines into clean Markdown format.

Instructions:
1. Strip empty lines, platform tags (e.g. "Unit mastery: 0%"), and control characters.
2. Keep the provider's original unit / lesson wording verbatim.
3. Format as:
   ### Unit N: <unit name>
   - <subunit or lesson 1>
   - <subunit or lesson 2>
   …
4. Preserve numbering that appears in the raw text; don't renumber yourself.
5. Do **not** summarise, translate, or add commentary.
6. If unit_start is provided and > 1, indicate this in the output.
7. Return JSON with "course_outline" and "unit_start" keys.

Example output:
{
  "course_outline": "## Algebra 1 (Khan Academy)\\n\\n### Unit 1: Algebra foundations\\n- Introduction to variables\\n- Combining like terms\\n\\n### Unit 2: Equations & inequalities\\n- …",
  "unit_start": 1
}`;

    // Build messages with unit start information
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Unit start position: ${unitStart}\n\nCurriculum text:\n${sanitizedText}` }
    ];

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for consistent formatting
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    return {
      course_outline: result.course_outline,
      unit_start: result.unit_start || unitStart,
      sanitized_raw: sanitizedText,
    };
    
  } catch (error) {
    console.error('Error processing syllabus with AI:', error);
    throw error;
  }
};

// Process syllabus with fallback to basic formatting
export const processSyllabusWithFallback = async (courseOutlineRaw, unitStart = 1) => {
  try {
    // Try AI processing first
    return await processSyllabusWithAI(courseOutlineRaw, unitStart);
  } catch (error) {
    console.warn('AI processing failed, using fallback formatting:', error);
    
    // Fallback to basic formatting
    const sanitizedText = sanitizeSyllabus(courseOutlineRaw);
    const basicMarkdown = generateBasicMarkdown(sanitizedText);
    
    return {
      course_outline: basicMarkdown,
      unit_start: unitStart,
      sanitized_raw: sanitizedText,
      fallback_used: true,
    };
  }
};

// Generate basic markdown when AI is unavailable
const generateBasicMarkdown = (rawText) => {
  const lines = rawText.split('\n');
  let markdown = '';
  let currentUnit = '';
  
  lines.forEach((line, index) => {
    // Simple heuristics to identify units and lessons
    if (line.match(/^unit\s+\d+/i) || 
        line.match(/^chapter\s+\d+/i) || 
        line.match(/^module\s+\d+/i) ||
        line.match(/^week\s+\d+/i)) {
      if (currentUnit) markdown += '\n';
      currentUnit = line;
      markdown += `### ${line}\n`;
    } else if (line.match(/^lesson\s+\d+/i) || 
               line.match(/^\d+\./) || 
               line.match(/^[a-z]\)/i) ||
               line.match(/^[ivx]+\./i)) {
      markdown += `- ${line}\n`;
    } else if (line.trim() && !line.match(/^[-•*]/)) {
      // If it's not already a bullet point, make it one
      markdown += `- ${line}\n`;
    }
  });
  
  return markdown || rawText; // Fallback to raw text if no structure found
};

// Save processed syllabus to database (you can integrate with Supabase)
export const saveProcessedSyllabus = async (syllabusData) => {
  try {
    // This would integrate with your Supabase database
    // For now, we'll just return the data
    console.log('Saving syllabus:', syllabusData);
    
    return {
      id: Date.now(), // Generate a temporary ID
      ...syllabusData,
      created_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error saving syllabus:', error);
    throw error;
  }
};

// Main function to process and save syllabus (enhanced with unit start)
export const processAndSaveSyllabus = async (courseTitle, providerName, courseOutlineRaw, unitStart = 1) => {
  try {
    // Process with AI (with fallback)
    const processedData = await processSyllabusWithFallback(courseOutlineRaw, unitStart);
    
    // Prepare the complete syllabus data
    const syllabusData = {
      course_title: courseTitle,
      provider_name: providerName,
      course_outline_raw: courseOutlineRaw,
      course_outline: processedData.course_outline,
      unit_start: processedData.unit_start || unitStart,
      sanitized_raw: processedData.sanitized_raw,
      fallback_used: processedData.fallback_used || false,
    };
    
    // Save to database
    const savedSyllabus = await saveProcessedSyllabus(syllabusData);
    
    return savedSyllabus;
    
  } catch (error) {
    console.error('Error in processAndSaveSyllabus:', error);
    throw error;
  }
}; 