/**
 * Curriculum AI API Client
 * Functions for interacting with curriculum AI wizard features
 */
import { supabase } from '../supabase';
import { apiRequest } from '../apiClient';

/**
 * Parse PDF syllabus using AI
 * @param {Object} params - Parse parameters
 * @param {string} params.pdfUrl - URL to PDF file
 * @param {string} params.familyId - Family ID
 * @param {string} params.childId - Child ID
 * @param {string} params.subjectId - Subject ID
 * @param {string} params.syllabusTitle - Syllabus title
 * @param {string} params.startDate - Start date (YYYY-MM-DD)
 * @param {string} params.endDate - End date (YYYY-MM-DD)
 * @param {number} params.expectedWeeklyMinutes - Expected weekly minutes
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function parseSyllabusPDF({
  pdfUrl,
  familyId,
  childId,
  subjectId,
  syllabusTitle,
  startDate,
  endDate,
  expectedWeeklyMinutes,
}) {
  try {
    // First, create syllabus record via RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('ai_parse_syllabus', {
      p_pdf_url: pdfUrl,
      p_family_id: familyId,
      p_child_id: childId,
      p_subject_id: subjectId,
      p_syllabus_title: syllabusTitle,
      p_start_date: startDate,
      p_end_date: endDate,
      p_expected_weekly_minutes: expectedWeeklyMinutes,
    });

    if (rpcError) {
      return { data: null, error: rpcError };
    }

    if (!rpcData?.success) {
      return { data: null, error: new Error(rpcData?.error || 'Failed to create syllabus') };
    }

    const syllabusId = rpcData.syllabus_id;
    const uploadId = rpcData.upload_id;

    // Extract storage path from URL
    const storagePath = pdfUrl.replace(/^.*\/storage\/v1\/object\/public\/[^/]+\//, '');
    const bucket = pdfUrl.includes('/syllabi/') ? 'syllabi' : 'evidence';

    // Call backend API to parse PDF and extract units/skills
    // Set create_backlog_items to false for review mode
    const { data, error } = await apiRequest('/api/llm/parse-syllabus-enhanced', {
      method: 'POST',
      body: JSON.stringify({
        syllabus_id: syllabusId,
        storage_bucket: bucket,
        storage_path: storagePath,
        family_id: familyId,
        child_id: childId,
        start_date: startDate,
        end_date: endDate,
        expected_weekly_minutes: expectedWeeklyMinutes,
        create_backlog_items: false,  // Return tasks for review instead of creating
      }),
    });

    if (error) {
      return { data: null, error };
    }

    return { data: { ...data, syllabus_id: syllabusId, upload_id: uploadId }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Get parsed syllabus with units and skills
 * @param {string} syllabusId - Syllabus ID
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function getParsedSyllabus(syllabusId) {
  try {
    // Get syllabus with sections
    const { data: syllabus, error: syllabusError } = await supabase
      .from('syllabi')
      .select(`
        *,
        sections:syllabus_sections(
          *,
          skills:syllabus_skills(*)
        )
      `)
      .eq('id', syllabusId)
      .single();

    if (syllabusError) {
      return { data: null, error: syllabusError };
    }

    // Organize sections by unit
    const units = [];
    let currentUnit = null;

    (syllabus.sections || []).forEach((section) => {
      if (section.section_type === 'unit') {
        if (currentUnit) {
          units.push(currentUnit);
        }
        currentUnit = {
          ...section,
          lessons: [],
          skills: section.skills || [],
        };
      } else if (currentUnit && section.section_type === 'lesson') {
        currentUnit.lessons.push({
          ...section,
          skills: section.skills || [],
        });
      }
    });

    if (currentUnit) {
      units.push(currentUnit);
    }

    return {
      data: {
        ...syllabus,
        units,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Generate pacing recommendations
 * @param {string} syllabusId - Syllabus ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function generatePacing(syllabusId, startDate, endDate) {
  try {
    const { data, error } = await apiRequest('/api/curriculum/generate-pacing', {
      method: 'POST',
      body: JSON.stringify({
        syllabus_id: syllabusId,
        start_date: startDate,
        end_date: endDate,
      }),
    });

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Link evidence to syllabus units
 * @param {string} syllabusId - Syllabus ID
 * @param {string} sectionId - Section ID
 * @param {Array<string>} evidenceIds - Array of evidence upload IDs
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function linkEvidenceToUnit(syllabusId, sectionId, evidenceIds) {
  try {
    // This would update uploads to link them to the syllabus section
    // For now, we'll use metadata JSONB field
    const updates = evidenceIds.map((evidenceId) =>
      supabase
        .from('uploads')
        .update({
          metadata: supabase.rpc('jsonb_set', {
            target: supabase.raw('COALESCE(metadata, \'{}\'::jsonb)'),
            path: ['syllabus_section_id'],
            new_value: sectionId,
          }),
        })
        .eq('id', evidenceId)
    );

    await Promise.all(updates);

    return { data: { success: true }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Generate unit completion summary
 * @param {string} sectionId - Section/Unit ID
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function generateUnitSummary(sectionId) {
  try {
    const { data, error } = await apiRequest('/api/curriculum/unit-summary', {
      method: 'POST',
      body: JSON.stringify({
        section_id: sectionId,
      }),
    });

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

