/**
 * Curriculum Builder API Client
 * Handles curriculum building and committing API calls
 */

import { apiRequest } from '../apiClient';

/**
 * Generate curriculum draft from scratch (AI). Returns structured units and lessons for review.
 * Does not persist; use commitGeneratedDraft after user approves.
 * @param {Object} params - GenerateCurriculumDraftRequest shape
 * @returns {Promise<{ data?: DraftCurriculum, error?: any }>}
 */
export async function generateCurriculumDraft(params) {
  try {
    return await apiRequest('/api/curriculum/generate-draft', {
      method: 'POST',
      body: JSON.stringify({
        subject_id: params.subject_id,
        family_id: params.family_id,
        subject_name: params.subject_name,
        child_ids: params.child_ids ?? null,
        learner_stage: params.learner_stage ?? null,
        age_range: params.age_range ?? null,
        generation_scope: params.generation_scope,
        duration_mode: params.duration_mode ?? 'multi_unit_course',
        custom_weeks: params.custom_weeks ?? null,
        lesson_count_target: params.lesson_count_target ?? null,
        typical_lesson_minutes: params.typical_lesson_minutes ?? null,
        educational_style: params.educational_style ?? null,
        rigor_level: params.rigor_level ?? null,
        include_assessments: params.include_assessments !== false,
        include_projects: params.include_projects !== false,
        include_materials: params.include_materials !== false,
        include_pacing: params.include_pacing !== false,
        special_instructions: params.special_instructions ?? null,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Persist an approved curriculum draft to curriculum_units and curriculum_lessons.
 * Does not create calendar events.
 * @param {Object} params - { subject_id, family_id, subject_name, draft }
 * @returns {Promise<{ data?: { units_created, lessons_created, unit_ids, lesson_ids, subject_id, source_type }, error?: any }>}
 */
export async function commitGeneratedDraft(params) {
  try {
    return await apiRequest('/api/curriculum/commit-generated-draft', {
      method: 'POST',
      body: JSON.stringify({
        subject_id: params.subject_id,
        family_id: params.family_id,
        subject_name: params.subject_name,
        draft: params.draft,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Parse plain text into structured curriculum draft (Import & extract). Extraction only; does not persist.
 * @param {Object} params - ParsePlainTextRequest shape
 * @returns {Promise<{ data?: ParsedDraftCurriculum, error?: any }>}
 */
export async function parsePlainText(params) {
  try {
    return await apiRequest('/api/curriculum/parse-text', {
      method: 'POST',
      body: JSON.stringify({
        subject_id: params.subject_id,
        family_id: params.family_id,
        subject_name: params.subject_name,
        raw_text: params.raw_text,
        source_title: params.source_title ?? null,
        source_type: params.source_type ?? null,
        parse_mode: params.parse_mode ?? null,
        detect_dates: params.detect_dates !== false,
        preserve_source_headings: params.preserve_source_headings !== false,
        ignore_policy_text: params.ignore_policy_text !== false,
        extract_assignments: params.extract_assignments !== false,
        extract_assessments: params.extract_assessments !== false,
        learner_stage: params.learner_stage ?? null,
        special_instructions: params.special_instructions ?? null,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Persist approved parsed draft: syllabus_imports + curriculum_units + curriculum_lessons.
 * @param {Object} params - { subject_id, family_id, subject_name, draft }
 * @returns {Promise<{ data?: { syllabus_import_id, units_created, lessons_created, ... }, error?: any }>}
 */
export async function commitParsedDraft(params) {
  try {
    return await apiRequest('/api/curriculum/commit-parsed-draft', {
      method: 'POST',
      body: JSON.stringify({
        subject_id: params.subject_id,
        family_id: params.family_id,
        subject_name: params.subject_name,
        draft: params.draft,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Persist manually entered curriculum (Add unit manually). No AI.
 * @param {Object} params - { subject_id, family_id, subject_name, builder_mode, draft }
 * @returns {Promise<{ data?: { units_created_count, lessons_created_count, unit_ids, lesson_ids, ... }, error?: any }>}
 */
export async function commitManualDraft(params) {
  try {
    return await apiRequest('/api/curriculum/commit-manual-draft', {
      method: 'POST',
      body: JSON.stringify({
        subject_id: params.subject_id,
        family_id: params.family_id,
        subject_name: params.subject_name,
        builder_mode: params.builder_mode || 'rich_units',
        draft: params.draft,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Build curriculum preview
 * @param {Object} params
 * @param {string} params.mode - Input mode: topic, syllabus, pdf, link, material
 * @param {string} [params.topic] - Topic prompt
 * @param {string} [params.syllabus_text] - Pasted syllabus text
 * @param {string} [params.source_url] - Source URL
 * @param {string} [params.source_file_id] - Source file ID
 * @param {string} [params.material_id] - Material ID
 * @param {string[]} params.student_ids - Student IDs
 * @param {Object} params.constraints - Constraints object
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function buildCurriculum(params) {
  try {
    return await apiRequest('/api/curriculum/build', {
      method: 'POST',
      body: JSON.stringify({
        mode: params.mode,
        topic: params.topic,
        syllabus_text: params.syllabus_text,
        source_url: params.source_url,
        source_file_id: params.source_file_id,
        material_id: params.material_id,
        student_ids: params.student_ids,
        constraints: params.constraints,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Preview how lessons will map onto Plan My Year slots (Phase 2: no commit).
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string} [params.subject_id]
 * @param {string[]} params.student_ids
 * @param {string} params.start_date - YYYY-MM-DD
 * @param {string} params.end_date - YYYY-MM-DD
 * @param {string} [params.academic_year_id]
 * @param {{ title?: string, sequence_index?: number, minutes_est?: number }[]} params.lessons
 * @returns {Promise<{ data?: { mapping: Array<{ lesson_index, lesson_title, slot_id, date_ymd, start_ts, end_ts, child_id }>, slots_used, total_slots_available, total_lessons, unmapped_lesson_count }, error?: any }>}
 */
export async function previewPacing(params) {
  try {
    return await apiRequest('/api/curriculum/preview_pacing', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        subject_id: params.subject_id ?? null,
        student_ids: params.student_ids,
        start_date: params.start_date,
        end_date: params.end_date,
        academic_year_id: params.academic_year_id ?? null,
        lessons: params.lessons,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Phase 4: Re-pace syllabus after a trip — exclude a date range and map lessons onto remaining slots.
 * @param {Object} params - Same as previewPacing plus exclude_start, exclude_end (YYYY-MM-DD)
 * @returns {Promise<{ data?: { mapping, slots_used, total_slots_available, total_lessons, unmapped_lesson_count }, error? }>}
 */
export async function repace(params) {
  try {
    return await apiRequest('/api/curriculum/repace', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        subject_id: params.subject_id ?? null,
        student_ids: params.student_ids,
        start_date: params.start_date,
        end_date: params.end_date,
        academic_year_id: params.academic_year_id ?? null,
        lessons: params.lessons,
        exclude_start: params.exclude_start ?? null,
        exclude_end: params.exclude_end ?? null,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Phase 4: Get count of empty placeholder slots in range (for "fill placeholders" suggestion).
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string} params.academic_year_id
 * @param {string} params.start_date - YYYY-MM-DD
 * @param {string} params.end_date - YYYY-MM-DD
 * @returns {Promise<{ data?: { empty_slot_count: number, message: string }, error? }>}
 */
export async function getFillPlaceholdersSuggestion(params) {
  try {
    const q = new URLSearchParams({
      family_id: params.family_id,
      academic_year_id: params.academic_year_id,
      start_date: params.start_date,
      end_date: params.end_date,
    });
    return await apiRequest(`/api/curriculum/fill_placeholders_suggestion?${q.toString()}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Commit curriculum to database and create calendar events
 * @param {Object} params
 * @param {Object} params.preview - Preview data from build
 * @param {boolean} params.create_calendar_events - Whether to create calendar events
 * @param {Object} params.placement - Placement options
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function commitCurriculum(params) {
  try {
    return await apiRequest('/api/curriculum/commit', {
      method: 'POST',
      body: JSON.stringify({
        preview: params.preview,
        create_calendar_events: params.create_calendar_events,
        placement: params.placement,
        prefer_placeholder_slots: params.prefer_placeholder_slots,
        add_to_backlog: params.add_to_backlog,
        lesson_backlog_map: params.lesson_backlog_map,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}




