// AI Processor for Learnadoodle - Handles all AI integrations
// For development, you can set your API key here temporarily
// In production, this should come from environment variables
const API_KEY = process.env.OPENAI_API_KEY || ""; // Get from environment variable for testing

// Base OpenAI client setup
const createOpenAIClient = (baseUrl = "https://api.openai.com/v1") => {
  return {
    chat: {
      completions: {
        create: async (params) => {
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
                    headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
            body: JSON.stringify(params),
          });
          
          if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
          }
          
          return response.json();
        }
      }
    }
  };
};

// Syllabus Processing (Enhanced from outline.py)
export const processSyllabusWithAI = async (courseOutlineRaw, unitStart = 1, model = "gpt-4o-mini") => {
  try {
    const sanitizedText = sanitizeSyllabus(courseOutlineRaw);
    
    const systemPrompt = `You are a helpful assistant that converts raw course outlines into clean Markdown format.

Instructions:
1. Strip empty lines, platform tags (e.g. "Unit mastery: 0%"), and control characters
2. Keep the provider's original unit / lesson wording verbatim
3. Format as: ### Unit N: <unit name> - <subunit or lesson 1> - <subunit or lesson 2> …
4. Preserve numbering that appears in the raw text; don't renumber yourself
5. Do **not** summarise, translate, or add commentary
6. If unit_start is provided and > 1, indicate this in the output
7. Return JSON: { "course_outline": "<the cleaned Markdown string>", "unit_start": <number> }`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Unit start position: ${unitStart}\n\nCurriculum text:\n${sanitizedText}` }
    ];

    const client = createOpenAIClient();
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return { 
      course_outline: result.course_outline, 
      unit_start: result.unit_start || unitStart,
      sanitized_raw: sanitizedText 
    };
  } catch (error) {
    console.error('Error processing syllabus with AI:', error);
    throw error;
  }
};

// Subject Selection Assistant
export const getSubjectRecommendations = async (childInfo, familyContext, model = "gpt-4o") => {
  try {
    const systemPrompt = `You are an educational planning assistant helping parents choose appropriate subjects for their child's learning journey.

Your role is to:
1. Analyze the child's age, grade, interests, and learning style
2. Consider family context and any existing subjects
3. Provide thoughtful recommendations for subject selection
4. Explain your reasoning clearly
5. Suggest learning paths that build confidence and competence

Be supportive and educational - help parents feel confident in their choices.`;

    const userPrompt = `
Child Information:
- Age: ${childInfo.age}
- Grade: ${childInfo.grade}
- Interests: ${childInfo.interests || 'Not specified'}
- Learning Style: ${childInfo.learning_style || 'Not specified'}
- College Bound: ${childInfo.college_bound ? 'Yes' : 'No'}

Family Context:
- Existing Subjects: ${familyContext.existing_subjects || 'None'}
- Family Goals: ${familyContext.goals || 'Not specified'}

Please provide subject recommendations and explain your reasoning.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const client = createOpenAIClient();
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error getting subject recommendations:', error);
    throw error;
  }
};

// Track Selection Assistant
export const getTrackRecommendations = async (subjectInfo, childInfo, conversationHistory = [], model = "gpt-4o") => {
  try {
    const systemPrompt = `You are an educational planning assistant helping parents choose between different learning track options:
- Live-class: Structured online classes with set schedules
- Self-paced: Flexible learning with AI-generated pacing
- Custom-plan: Personalized curriculum created through AI conversation

Your role is to:
1. Understand the subject and child's needs
2. Consider the conversation history with the parent
3. Provide clear recommendations with pros/cons
4. Help parents make informed decisions
5. Remember previous conversations and build on them

Be conversational and supportive.`;

    const userPrompt = `
Subject: ${subjectInfo.name}
Child Age: ${childInfo.age}
Child Grade: ${childInfo.grade}
Child Interests: ${childInfo.interests || 'Not specified'}

Conversation History:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Please provide track recommendations based on this information.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userPrompt }
    ];

    const client = createOpenAIClient();
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error getting track recommendations:', error);
    throw error;
  }
};

// Live-Class Integration
export const processLiveClass = async (liveClassData, model = "gpt-4o-mini") => {
  try {
    const systemPrompt = `You are an educational planning assistant processing live-class information.

Your tasks:
1. Check for scheduling conflicts
2. Generate learning roadmaps
3. Create skills tracking
4. Provide progress insights

Return structured JSON with:
- conflict_check: null or conflict description
- roadmap: learning roadmap
- skills: array of 3-5 skills
- progress_insights: progress analysis`;

    const userPrompt = `
Live Class Data:
${JSON.stringify(liveClassData, null, 2)}

Please process this live-class information and provide the requested outputs.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const client = createOpenAIClient();
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error processing live-class:', error);
    throw error;
  }
};

// Self-Paced Integration
export const processSelfPaced = async (selfPacedData, model = "gpt-4o-mini") => {
  try {
    const systemPrompt = `You are an educational planning assistant processing self-paced learning information.

Your tasks:
1. Calculate optimal pacing based on course length and academic year
2. Generate learning roadmaps
3. Create skills tracking
4. Handle repacing requests

Return structured JSON with:
- pacing: pacing schedule
- roadmap: learning roadmap
- skills: array of 3-5 skills
- repacing_suggestions: if repacing is requested`;

    const userPrompt = `
Self-Paced Data:
${JSON.stringify(selfPacedData, null, 2)}

Please process this self-paced information and provide the requested outputs.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const client = createOpenAIClient();
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error processing self-paced:', error);
    throw error;
  }
};

// Progress Analysis
export const analyzeProgress = async (progressData, model = "gpt-4o") => {
  try {
    const systemPrompt = `You are an educational progress analyst.

Your tasks:
1. Analyze lesson and subject progress data
2. Identify patterns (lagging, ahead, on track)
3. Suggest appropriate actions (repace, replan, continue)
4. Generate progress summaries

Return structured JSON with:
- analysis: progress analysis
- recommendations: suggested actions
- triggers: any system triggers needed
- summary: progress summary`;

    const userPrompt = `
Progress Data:
${JSON.stringify(progressData, null, 2)}

Please analyze this progress data and provide insights.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const client = createOpenAIClient();
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing progress:', error);
    throw error;
  }
};

// Lesson Plan Generation (for custom-plans)
export const generateLessonPlan = async (lessonData, model = "gpt-4o-mini") => {
  try {
    const systemPrompt = `You are an educational lesson planner creating detailed lesson plans.

Your tasks:
1. Create comprehensive lesson plans in Markdown format
2. Include objectives, materials, activities, and assessment
3. Adapt to the child's learning style and interests
4. Provide engaging and educational content

Return the lesson plan as a Markdown string.`;

    const userPrompt = `
Lesson Data:
${JSON.stringify(lessonData, null, 2)}

Please create a detailed lesson plan for this activity.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const client = createOpenAIClient();
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating lesson plan:', error);
    throw error;
  }
};

// DoodleBot AI Assistant
export const chatWithDoodleBot = async (userMessage, context, conversationId = null, model = "gpt-4o") => {
  try {
    // Import the service dynamically to avoid circular imports
    const { AIConversationService } = await import('./aiConversationService.js');
    
    let conversationHistory = [];
    
    // If conversationId is provided, get conversation history
    if (conversationId) {
      try {
        const conversation = await AIConversationService.getConversation(conversationId);
        if (conversation && conversation.ai_messages) {
          // Convert database messages to OpenAI format, excluding the current message
          conversationHistory = conversation.ai_messages
            .filter(msg => msg.content !== userMessage) // Exclude current message
            .map(msg => ({
              role: msg.role,
              content: msg.content
            }));
        }
      } catch (error) {
        console.warn('Could not load conversation history:', error);
      }
    }

    const systemPrompt = `You are DoodleBot, a friendly and knowledgeable AI assistant for homeschooling families. You have access to comprehensive family and learning data to provide personalized help.

Your capabilities include:
1. **Finding information in children's outlines and syllabi**
2. **Rescheduling tasks and activities**
3. **Recommending activities based on learning progress**
4. **Answering questions about curriculum and schedules**
5. **Providing educational insights and suggestions**

Key principles:
- Be warm, encouraging, and supportive
- Use the family's actual data to provide personalized responses
- Suggest specific actions when appropriate
- Reference children by name when relevant
- Be concise but thorough
- Remember previous conversations and maintain context

Context available:
- Children: ${context.children.map(c => `${c.name} (age ${c.age}, grade ${c.grade})`).join(', ')}
- Activities: ${context.activities.length} total activities
- Subjects: ${context.subjects.map(s => s.name).join(', ')}
- Daily tasks: ${context.dailyTasks.length} tasks for today
- Progress data: Available for completed tasks
- Conversation history: ${conversationHistory.length} previous messages

Always respond in a helpful, conversational tone and provide actionable advice when possible.`;

    // Build messages array with conversation history
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage }
    ];

    const client = createOpenAIClient();
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error chatting with DoodleBot:', error);
    throw new Error('Failed to get response from DoodleBot');
  }
};

// Utility function for sanitizing syllabus text (from your outline.py)
const sanitizeSyllabus = (text) => {
  // Step 1: Split into lines and strip leading/trailing whitespace
  const lines = text.split('\n').map(line => line.trim());
  
  // Step 2: Replace tabs with spaces
  const processedLines = lines.map(line => line.replace(/\t/g, ' '));
  
  // Step 3: Join lines with \n
  const singleLine = processedLines.join('\n');
  
  // Step 4: Escape double quotes
  return singleLine.replace(/"/g, '\\"');
};

// Export all functions
export {
  sanitizeSyllabus,
  createOpenAIClient
}; 