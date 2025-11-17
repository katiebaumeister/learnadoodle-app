// Syllabus Parser - Converts PDF/DOC to syllabus_sections
import { supabase } from './supabase';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;

/**
 * Parse syllabus text into structured sections
 * Uses OpenAI to extract units/lessons/assignments with dates and minutes
 */
export async function parseSyllabusToSections(
  uploadId,
  syllabusId,
  rawText,
  startDate = null,
  endDate = null,
  expectedWeeklyMinutes = null
) {
  try {
    // Use OpenAI to parse the syllabus
    const systemPrompt = `You are parsing a course syllabus. Extract:
1. Units/Chapters/Modules with headings
2. Lessons/Assignments within each unit
3. Estimated minutes for each (infer if missing)
4. Due dates (explicit "due", "by Friday", "week of", or calculate from start_date + position)

Return JSON array:
[
  {
    "position": 1,
    "section_type": "unit",
    "heading": "Unit 1: Introduction",
    "notes": "Covers weeks 1-2",
    "estimated_minutes": 120,
    "suggested_due_ts": null
  },
  {
    "position": 2,
    "section_type": "lesson",
    "heading": "Variables and Expressions",
    "notes": "",
    "estimated_minutes": 45,
    "suggested_due_ts": "2025-09-15T00:00:00Z"
  }
]

Rules:
- section_type: "unit" | "lesson" | "assignment"
- If no explicit minutes, default: lessons=30-60, assignments=15-30
- If no explicit dates and start_date provided, distribute evenly
- Position increments for each section`;

    const dateContext = startDate && endDate
      ? `\nStart date: ${startDate}\nEnd date: ${endDate}\nExpected weekly minutes: ${expectedWeeklyMinutes || 120}`
      : '';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Parse this syllabus:${dateContext}\n\n${rawText.substring(0, 16000)}` }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);

    // Extract sections array
    const sections = Array.isArray(parsed) ? parsed : parsed.sections || [];

    // If we have dates, distribute sections evenly
    if (startDate && endDate && sections.length > 0) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      const daysPerSection = Math.max(1, Math.floor(totalDays / sections.length));

      sections.forEach((section, idx) => {
        if (!section.suggested_due_ts) {
          const sectionDate = new Date(start);
          sectionDate.setDate(sectionDate.getDate() + (idx * daysPerSection));
          section.suggested_due_ts = sectionDate.toISOString();
        }
      });
    }

    // Insert sections into database
    const sectionsToInsert = sections.map(s => ({
      syllabus_id: syllabusId,
      position: s.position || sections.indexOf(s) + 1,
      section_type: s.section_type || 'lesson',
      heading: s.heading || `Section ${s.position}`,
      notes: s.notes || null,
      estimated_minutes: s.estimated_minutes || null,
      suggested_due_ts: s.suggested_due_ts || null
    }));

    const { data: inserted, error } = await supabase
      .from('syllabus_sections')
      .insert(sectionsToInsert)
      .select();

    if (error) throw error;

    return inserted;

  } catch (err) {
    console.error('Error parsing syllabus:', err);
    // Fallback: create basic sections from text
    return createFallbackSections(syllabusId, rawText);
  }
}

/**
 * Fallback parser if AI fails
 */
async function createFallbackSections(syllabusId, rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
  const sections = [];
  let position = 1;

  for (const line of lines) {
    // Detect unit/lesson patterns
    const isUnit = /^(unit|chapter|module|week)\s+\d+/i.test(line);
    const isLesson = /^[-•*]\s*/.test(line) || /^\d+\.\s*/.test(line);

    if (isUnit || isLesson) {
      sections.push({
        syllabus_id: syllabusId,
        position: position++,
        section_type: isUnit ? 'unit' : 'lesson',
        heading: line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, ''),
        notes: null,
        estimated_minutes: isUnit ? null : 30,
        suggested_due_ts: null
      });
    }
  }

  if (sections.length === 0) {
    // Create a single default section
    sections.push({
      syllabus_id: syllabusId,
      position: 1,
      section_type: 'unit',
      heading: 'Course Content',
      notes: null,
      estimated_minutes: null,
      suggested_due_ts: null
    });
  }

  const { data, error } = await supabase
    .from('syllabus_sections')
    .insert(sections)
    .select();

  if (error) throw error;
  return data;
}

