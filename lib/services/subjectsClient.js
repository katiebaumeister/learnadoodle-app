import { supabase } from '../supabase';
import { isAbortLikeError } from '../apiClient';
import { applyChildFilter, getAccessibleChildIds } from '../queryFilters';
import { deriveRoleFromTags, DOCUMENT_ROLES } from '../docs/roles';
import { ATTENDANCE_MODES, getAttendanceMode } from '../attendanceMode';

function extractSubjectIdsFromCurriculumMetadata(curriculumMetadata) {
  const raw = curriculumMetadata;
  if (!raw) return [];
  let parsed = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return [];
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const ids = Array.isArray(parsed.subject_ids) ? parsed.subject_ids : [];
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
}

function isAttendancePresentLike(status) {
  const normalized = String(status || '').toLowerCase();
  // Legacy rows may omit status and should count as attended.
  if (!normalized) return true;
  return normalized === 'present' || normalized === 'partial';
}

function isInstructionalProgressEvent(event = {}) {
  if (!event || typeof event !== 'object') return false;
  if (event?.status === 'canceled' || event?.is_backlog) return false;
  const eventType = String(event?.event_type || '').trim().toLowerCase();
  // Assignments should not dilute lesson attendance/progress.
  if (eventType === 'assignment') return false;
  return true;
}

function computeSubjectProgressPercent(events = [], attendanceRecords = [], sections = []) {
  const plannedEvents = (events || []).filter((event) => isInstructionalProgressEvent(event));
  if (plannedEvents.length > 0) {
    const plannedEventIdSet = new Set(
      plannedEvents.map((event) => String(event?.id || '').trim()).filter(Boolean)
    );
    const completedEventIdSet = new Set(
      plannedEvents
        .filter((event) => event?.status === 'done')
        .map((event) => String(event?.id || '').trim())
        .filter(Boolean)
    );
    (attendanceRecords || []).forEach((record) => {
      const eventId = String(record?.event_id || '').trim();
      if (!eventId || !plannedEventIdSet.has(eventId)) return;
      if (isAttendancePresentLike(record?.status)) completedEventIdSet.add(eventId);
    });
    const rawPercent = (completedEventIdSet.size / plannedEvents.length) * 100;
    const roundedPercent = Math.min(100, Math.round(rawPercent));
    // Keep a visible sliver in the UI once any event is completed/attended.
    if (roundedPercent <= 0 && completedEventIdSet.size > 0) return 1;
    return roundedPercent;
  }

  if (sections.length > 0) {
    const completedSections = sections.filter((section) => {
      if (!section?.suggested_due_ts) return false;
      const dueDate = new Date(section.suggested_due_ts);
      return dueDate < new Date();
    });
    return Math.round((completedSections.length / sections.length) * 100);
  }

  return null;
}

/** Parent should open the linked calendar event for help or submission review. */
function assignmentAttentionFlags(row) {
  if (!row) return { needHelp: false, needsSubmissionReview: false };
  const needHelp = row.need_help === true;
  const needsSubmissionReview =
    row.status === 'submitted' &&
    (row.review_status == null || row.review_status === 'needs_revision');
  return { needHelp, needsSubmissionReview };
}

function parseLinkedEventIds(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((id) => String(id)).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mergeAssignmentAttentionByEventId(rows) {
  /** @type {Record<string, { needHelp: boolean; needsSubmissionReview: boolean }>} */
  const map = {};
  for (const row of rows || []) {
    const { needHelp, needsSubmissionReview } = assignmentAttentionFlags(row);
    if (!needHelp && !needsSubmissionReview) continue;
    for (const id of parseLinkedEventIds(row?.linked_event_ids)) {
      if (!map[id]) map[id] = { needHelp: false, needsSubmissionReview: false };
      if (needHelp) map[id].needHelp = true;
      if (needsSubmissionReview) map[id].needsSubmissionReview = true;
    }
  }
  return map;
}

function mergeAssignmentsByEventId(rows) {
  /** @type {Record<string, Array<object>>} */
  const map = {};
  for (const row of rows || []) {
    for (const id of parseLinkedEventIds(row?.linked_event_ids)) {
      if (!map[id]) map[id] = [];
      map[id].push(row);
    }
  }
  return map;
}

/**
 * Helper functions for semicolon-separated child IDs
 * These are exported so they can be used in other parts of the app
 */
export function parseChildIds(childIdString) {
  if (!childIdString || childIdString.trim() === '') return [];
  return childIdString.split(';').map(id => id.trim()).filter(Boolean);
}

export function formatChildIds(childIds) {
  if (!childIds || childIds.length === 0) return '';
  return childIds.join(';');
}

export function childIdStringContains(childIdString, childId) {
  if (!childIdString || !childId) return false;
  const ids = parseChildIds(childIdString);
  return ids.includes(childId);
}

/**
 * Get all subjects with overview data for a family
 * Includes: core goal, current focus, upcoming/overdue work
 * Note: child_id column now stores semicolon-separated child IDs (e.g., "child1;child2;child3")
 * Empty string means applies to all children
 * @param {string} familyId - Family ID
 * @param {string|null} childId - Optional child ID (deprecated, use session instead)
 * @param {Object|null} session - Session context for role-based filtering
 */
export async function getSubjectsWithOverview(familyId, childId = null, session = null) {
  if (!familyId) {
    throw new Error('Family ID is required');
  }

  try {
    // Get all subjects for the family
    let subjectsQuery = supabase
      .from('subject')
      .select('id, name, child_id, grade, notes, summary, school_year, school_term, created_at, updated_at')
      .eq('family_id', familyId)
      .order('name');

    const { data: subjects, error: subjectsError } = await subjectsQuery;

    if (subjectsError) throw subjectsError;

    if (!subjects || subjects.length === 0) {
      return [];
    }

    // Filter by childId or session-based accessible children
    // child_id format: semicolon-separated IDs (e.g., "child1;child2") or empty string (all children)
    let filteredSubjects = subjects;
    
    // Use session-based filtering if available
    if (session) {
      const accessibleChildIds = getAccessibleChildIds(session);
      if (accessibleChildIds.length > 0) {
        // Filter subjects that are assigned to accessible children or apply to all
        filteredSubjects = subjects.filter(subject => {
          const childIds = parseChildIds(subject.child_id || '');
          // Include if: empty (applies to all) or intersects with accessible children
          return childIds.length === 0 || childIds.some(id => accessibleChildIds.includes(id));
        });
      } else if (session?.role_flags?.isChild || session?.role_flags?.isTutor) {
        // Child or tutor with no accessible children: return empty
        return [];
      }
      // Parent: no filtering needed (already filtered by family_id)
    } else if (childId) {
      // Legacy: filter by single childId
      filteredSubjects = subjects.filter(subject => {
        const childIds = parseChildIds(subject.child_id || '');
        // Include if: empty (applies to all) or contains the child ID
        return childIds.length === 0 || childIds.includes(childId);
      });
    }

    const subjectIds = filteredSubjects.map(s => s.id);
    const now = new Date().toISOString();

    // Get syllabi for these subjects
    let syllabi = [];
    let syllabiError = null;
    try {
      let syllabiQuery = supabase
        .from('syllabi')
        .select('id, subject_id, child_id, title, start_date, end_date, expected_total_minutes, expected_weekly_minutes')
        .in('subject_id', subjectIds);

      // Apply session-based filtering
      if (session) {
        syllabiQuery = applyChildFilter(syllabiQuery, session, 'child_id');
      } else if (childId) {
        syllabiQuery = syllabiQuery.eq('child_id', childId);
      }

      const result = await syllabiQuery;
      syllabi = result.data || [];
      syllabiError = result.error;
      if (syllabiError && syllabiError.code !== 'PGRST116') { // PGRST116 = table not found
        console.warn('[subjectsClient] Error loading syllabi:', syllabiError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading syllabi:', err);
      syllabi = [];
    }

    // Get syllabus sections for current focus inference
    let sections = [];
    let sectionsError = null;
    try {
      const syllabusIds = (syllabi || []).map(s => s.id);
      if (syllabusIds.length > 0) {
        const sectionsQuery = supabase
          .from('syllabus_sections')
          .select('id, syllabus_id, position, section_type, heading, notes, estimated_minutes, suggested_due_ts')
          .in('syllabus_id', syllabusIds)
          .order('position');

        const result = await sectionsQuery;
        sections = result.data || [];
        sectionsError = result.error;
        if (sectionsError && sectionsError.code !== 'PGRST116') {
          console.warn('[subjectsClient] Error loading sections:', sectionsError);
        }
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading sections:', err);
      sections = [];
    }

    // Get subject goals (manual goals)
    let goals = [];
    let goalsError = null;
    try {
      let goalsQuery = supabase
        .from('subject_goals')
        .select('id, subject_id, child_id, minutes_per_week')
        .in('subject_id', subjectIds);

      // Apply session-based filtering
      if (session) {
        goalsQuery = applyChildFilter(goalsQuery, session, 'child_id');
      } else if (childId) {
        goalsQuery = goalsQuery.eq('child_id', childId);
      }

      const result = await goalsQuery;
      goals = result.data || [];
      goalsError = result.error;
      if (goalsError && goalsError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading goals:', goalsError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading goals:', err);
      goals = [];
    }

    // Get all events (including completed ones for progress calculation).
    // Include rows linked via subject_id and curriculum_metadata.subject_ids.
    let events = [];
    let eventsError = null;
    try {
      const subjectIdSet = new Set(subjectIds.map((id) => String(id)));
      const applyEventChildFilter = (query) => {
        if (session) return applyChildFilter(query, session, 'child_id');
        if (childId) return query.eq('child_id', childId);
        return query;
      };

      let primaryEventsQuery = supabase
        .from('events')
        .select('id, title, start_ts, end_ts, due_ts, subject_id, child_id, status, event_type, description, is_backlog, curriculum_metadata')
        .in('subject_id', subjectIds)
        .is('deleted_at', null)
        .is('canceled_at', null)
        .order('due_ts', { ascending: true, nullsLast: true })
        .order('start_ts', { ascending: true, nullsLast: true })
        .limit(500); // Increased limit to include completed events for progress
      primaryEventsQuery = applyEventChildFilter(primaryEventsQuery);

      let linkedEventsQuery = supabase
        .from('events')
        .select('id, title, start_ts, end_ts, due_ts, subject_id, child_id, status, event_type, description, is_backlog, curriculum_metadata')
        .eq('family_id', familyId)
        .not('curriculum_metadata', 'is', null)
        .is('deleted_at', null)
        .is('canceled_at', null)
        .order('due_ts', { ascending: true, nullsLast: true })
        .order('start_ts', { ascending: true, nullsLast: true })
        .limit(1000);
      linkedEventsQuery = applyEventChildFilter(linkedEventsQuery);

      const [primaryResult, linkedResult] = await Promise.all([primaryEventsQuery, linkedEventsQuery]);
      const primaryEvents = primaryResult?.data || [];
      const linkedEventsRaw = linkedResult?.data || [];
      const linkedEvents = linkedEventsRaw.filter((eventRow) => {
        const linkedIds = extractSubjectIdsFromCurriculumMetadata(eventRow?.curriculum_metadata);
        return linkedIds.some((id) => subjectIdSet.has(id));
      });
      const mergedById = new Map();
      [...primaryEvents, ...linkedEvents].forEach((eventRow) => {
        const eventId = String(eventRow?.id || '').trim();
        if (!eventId) return;
        if (!mergedById.has(eventId)) mergedById.set(eventId, eventRow);
      });
      events = Array.from(mergedById.values()).sort((a, b) => {
        const dueA = a?.due_ts ? new Date(a.due_ts).getTime() : Number.POSITIVE_INFINITY;
        const dueB = b?.due_ts ? new Date(b.due_ts).getTime() : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;
        const startA = a?.start_ts ? new Date(a.start_ts).getTime() : Number.POSITIVE_INFINITY;
        const startB = b?.start_ts ? new Date(b.start_ts).getTime() : Number.POSITIVE_INFINITY;
        return startA - startB;
      });

      const primaryError = primaryResult?.error || null;
      const linkedError = linkedResult?.error || null;
      eventsError = primaryError || linkedError;
      if (primaryError && primaryError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading primary subject events:', primaryError);
      }
      if (linkedError && linkedError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading linked subject events:', linkedError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading events:', err);
      events = [];
    }

    const linkedSubjectIdsByEventId = new Map(
      (events || []).map((eventRow) => [
        String(eventRow?.id || ''),
        extractSubjectIdsFromCurriculumMetadata(eventRow?.curriculum_metadata),
      ])
    );

    // Get attendance records for these subject events.
    // We load full history so progress can reflect attended events even if event status stays "scheduled".
    let attendanceRecords = [];
    let attendanceError = null;
    try {
      // Get event IDs for these subjects to filter attendance
      const eventIds = events.map(e => e.id);
      
      if (eventIds.length > 0) {
        let attendanceQuery = supabase
          .from('attendance_records')
          .select('id, event_id, child_id, day_date, minutes, status, created_at')
          .in('event_id', eventIds);

        if (childId) {
          attendanceQuery = attendanceQuery.eq('child_id', childId);
        }

        const result = await attendanceQuery;
        attendanceRecords = result.data || [];
        attendanceError = result.error;
        if (attendanceError && attendanceError.code !== 'PGRST116') {
          console.warn('[subjectsClient] Error loading attendance:', attendanceError);
        }
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading attendance:', err);
      attendanceRecords = [];
    }

    // Build subject overview data
    const enrichedSubjects = filteredSubjects.map(subject => {
      // Find syllabi for this subject
      const subjectSyllabi = syllabi.filter(s => s.subject_id === subject.id);
      const primarySyllabus = subjectSyllabi.length > 0 ? subjectSyllabi[0] : null;

      // Find sections for primary syllabus
      const syllabusSections = primarySyllabus
        ? sections.filter(s => s.syllabus_id === primarySyllabus.id)
        : [];

      // Find goals for this subject
      const subjectGoals = goals.filter(g => g.subject_id === subject.id);
      const primaryGoal = subjectGoals.length > 0 ? subjectGoals[0] : null;

      // Derive core goal
      let coreGoal = null;
      // Note: subject_goals table doesn't have goal_text, only goal_minutes_per_week
      // So we'll derive from syllabus instead
      if (primarySyllabus && syllabusSections.length > 0) {
        // Try to infer from syllabus - look for first unit or course description
        const firstUnit = syllabusSections.find(s => s.section_type === 'unit');
        if (firstUnit?.notes) {
          coreGoal = firstUnit.notes;
        } else if (syllabusSections.length > 0 && syllabusSections[0].heading) {
          // Use first section heading as fallback
          coreGoal = `Course: ${syllabusSections[0].heading}`;
        }
      }

      // Derive current focus
      let currentFocus = null;
      if (syllabusSections.length > 0) {
        // Find current unit based on date
        const now = new Date();
        const currentSection = syllabusSections.find(section => {
          if (!section.suggested_due_ts) return false;
          const dueDate = new Date(section.suggested_due_ts);
          return dueDate >= now;
        }) || syllabusSections[syllabusSections.length - 1]; // Fallback to last section

        if (currentSection) {
          currentFocus = currentSection.heading || currentSection.notes || null;
        }
      }

      // Get upcoming and overdue work
      // Filter events for this subject
      const subjectIdKey = String(subject.id);
      const subjectEvents = events.filter((e) => {
        if (String(e?.subject_id || '') === subjectIdKey) return true;
        const linkedIds = linkedSubjectIdsByEventId.get(String(e?.id || '')) || [];
        return linkedIds.includes(subjectIdKey);
      });
      
      // Separate into regular events, backlog items, and assignments
      // Event types: Lesson, Assignment, Activity, Scheduled Class Day, Appointment
      const regularEvents = subjectEvents.filter(e => 
        !e.is_backlog && e.event_type !== 'Assignment'
      );
      const backlogEvents = subjectEvents.filter(e => 
        e.is_backlog === true
      );
      const assignmentEvents = subjectEvents.filter(e => 
        e.event_type === 'Assignment'
      );

      // Combine all work items
      const allWorkItems = [
        ...regularEvents.map(e => ({
          id: `event-${e.id}`,
          type: 'event',
          title: e.title,
          dueDate: e.due_ts || e.end_ts || e.start_ts,
          startTs: e.start_ts || null,
          endTs: e.end_ts || null,
          isOverdue: e.due_ts ? new Date(e.due_ts) < new Date() && e.status !== 'done' : false,
          eventType: e.event_type,
          status: e.status,
          childId: e.child_id,
        })),
        ...backlogEvents.map(e => ({
          id: `backlog-${e.id}`,
          type: 'backlog',
          title: e.title,
          dueDate: e.due_ts || e.end_ts || e.start_ts,
          startTs: e.start_ts || null,
          endTs: e.end_ts || null,
          isOverdue: e.due_ts ? new Date(e.due_ts) < new Date() && e.status !== 'done' : false,
          childId: e.child_id,
        })),
        ...assignmentEvents.map(e => ({
          id: `assignment-${e.id}`,
          type: 'assignment',
          title: e.title,
          dueDate: e.due_ts || e.end_ts || e.start_ts,
          startTs: e.start_ts || null,
          endTs: e.end_ts || null,
          isOverdue: e.due_ts ? new Date(e.due_ts) < new Date() && e.status !== 'done' : false,
          status: e.status,
          childId: e.child_id,
        })),
      ].filter(item => item.dueDate); // Only include items with due dates

      // Sort by due date
      allWorkItems.sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate) : new Date(0);
        const dateB = b.dueDate ? new Date(b.dueDate) : new Date(0);
        return dateA - dateB;
      });

      // Upcoming = strictly in the future (after now), using client local time
      const now = new Date();
      const upcomingItems = allWorkItems
        .filter(item => item.dueDate && new Date(item.dueDate) > now)
        .slice(0, 3);
      const overdueItems = allWorkItems.filter(item => item.isOverdue);

      const subjectEventIdSet = new Set(subjectEvents.map((e) => e.id).filter(Boolean));
      const subjectAttendanceRecords = attendanceRecords.filter((record) => subjectEventIdSet.has(record?.event_id));
      const progressPercent = computeSubjectProgressPercent(subjectEvents, subjectAttendanceRecords, syllabusSections);

      // Calculate this week minutes from attendance records
      const weekWindowNow = new Date();
      const weekStart = new Date(weekWindowNow);
      weekStart.setDate(weekWindowNow.getDate() - weekWindowNow.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);
      const weekStartMs = weekStart.getTime();
      const weekEndMs = weekStartMs + (7 * 24 * 60 * 60 * 1000);
      const thisWeekAttendance = subjectAttendanceRecords.filter((record) => {
        const d = record?.day_date ? new Date(`${record.day_date}T00:00:00`) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        const ms = d.getTime();
        return ms >= weekStartMs && ms < weekEndMs;
      });
      const thisWeekMinutes = thisWeekAttendance.reduce((sum, ar) => sum + (ar.minutes || 0), 0);

      // Calculate last activity
      // Use completed events' end_ts (most reliable) and attendance records' created_at as fallback
      const completedEventTimestamps = subjectEvents
        .filter(e => e.status === 'done' && e.end_ts)
        .map(e => new Date(e.end_ts));
      const attendanceTimestamps = subjectAttendanceRecords
        .map(ar => ar.created_at)
        .filter(Boolean)
        .map(ts => new Date(ts));
      const allActivityTimestamps = [...completedEventTimestamps, ...attendanceTimestamps];
      const lastActivity = allActivityTimestamps.length > 0 
        ? new Date(Math.max(...allActivityTimestamps.map(d => d.getTime())))
        : null;

      // Calculate overdue count
      const overdueCount = overdueItems.length;

      // Get next item (earliest upcoming scheduled event)
      const nextItem = upcomingItems.length > 0 ? upcomingItems[0] : null;

      // Calculate status
      // ⚪ Not started (no lessons/events logged)
      // 🟡 Needs attention (overdue items OR no activity in 14 days OR pacing behind)
      // 🟢 On track (otherwise)
      let status = 'on_track';
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      if (subjectEvents.length === 0 || (lastActivity === null)) {
        status = 'not_started';
      } else if (
        overdueCount > 0 || 
        (lastActivity && lastActivity < fourteenDaysAgo) ||
        (progressPercent !== null && progressPercent < 50 && subjectEvents.length > 5) // Pacing behind if less than 50% progress with many events
      ) {
        status = 'needs_attention';
      }

      // Determine assigned children from semicolon-separated child_id string
      // Empty string = applies to all children
      // "child1;child2" = applies to specific children
      const assignedChildren = subject.child_id 
        ? parseChildIds(subject.child_id)
        : []; // Empty child_id means applies to all children

      // If no assigned children from child_id, infer from events
      const childrenFromEvents = [...new Set(subjectEvents.map(e => e.child_id).filter(Boolean))];
      const allAssignedChildren = assignedChildren.length > 0
        ? assignedChildren
        : childrenFromEvents.length > 0 
          ? childrenFromEvents 
          : [];

      return {
        ...subject,
        coreGoal,
        currentFocus,
        upcomingItems,
        overdueItems,
        assignedChildren: allAssignedChildren,
        hasSyllabus: !!primarySyllabus,
        hasGoal: !!primaryGoal,
        syllabusId: primarySyllabus?.id || null,
        // New metrics
        progressPercent,
        thisWeekMinutes,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
        overdueCount,
        nextItem,
        status,
      };
    });

    const parentLike =
      session?.role_flags?.isParent === true ||
      (!session?.role_flags?.isChild && !session?.role_flags?.isTutor);
    if (parentLike && enrichedSubjects.length > 0) {
      try {
        const subjectIds = enrichedSubjects.map((s) => s.id);
        const { data: assignRows } = await supabase
          .from('assignments')
          .select('related_subject, need_help, status, review_status')
          .eq('family_id', familyId)
          .in('related_subject', subjectIds);
        const countBySubject = {};
        const needHelpBySubject = {};
        for (const row of assignRows || []) {
          const sid = row.related_subject;
          if (!sid) continue;
          if (row.need_help === true) {
            needHelpBySubject[sid] = (needHelpBySubject[sid] || 0) + 1;
          }
          const { needHelp, needsSubmissionReview } = assignmentAttentionFlags(row);
          if (!needHelp && !needsSubmissionReview) continue;
          countBySubject[sid] = (countBySubject[sid] || 0) + 1;
        }
        return enrichedSubjects.map((s) => ({
          ...s,
          parentAssignmentAttentionCount: countBySubject[s.id] || 0,
          parentNeedHelpCount: needHelpBySubject[s.id] || 0,
        }));
      } catch (e) {
        console.warn('[subjectsClient] parent assignment attention:', e);
      }
    }

    return enrichedSubjects;
  } catch (error) {
    if (!isAbortLikeError(error)) {
      console.error('[subjectsClient] Error getting subjects with overview:', error);
    }
    throw error;
  }
}

/**
 * Get detailed subject information
 * @param {string} subjectId - Subject ID
 * @param {string} familyId - Family ID
 * @param {string|null} childId - Optional child ID (deprecated, use session instead)
 * @param {Object|null} session - Session context for role-based filtering
 * @returns {Promise<object|null>} Detail payload, or null if the subject row is missing (e.g. deleted)
 */
export async function getSubjectDetail(subjectId, familyId, childId = null, session = null) {
  if (!subjectId || !familyId) {
    throw new Error('Subject ID and Family ID are required');
  }

  try {
    // Get subject (maybeSingle: no error when row was deleted)
    const { data: subject, error: subjectError } = await supabase
      .from('subject')
      .select('*')
      .eq('id', subjectId)
      .eq('family_id', familyId)
      .maybeSingle();

    if (subjectError) throw subjectError;
    if (!subject) return null;

    let attendanceTrackingMode = '';

    // Get syllabi
    let syllabi = [];
    let syllabiError = null;
    try {
      let syllabiQuery = supabase
        .from('syllabi')
        .select('*')
        .eq('subject_id', subjectId);

      // Apply session-based filtering
      if (session) {
        syllabiQuery = applyChildFilter(syllabiQuery, session, 'child_id');
      } else if (childId) {
        syllabiQuery = syllabiQuery.eq('child_id', childId);
      }

      const result = await syllabiQuery;
      syllabi = result.data || [];
      syllabiError = result.error;
      if (syllabiError && syllabiError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading syllabi:', syllabiError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading syllabi:', err);
      syllabi = [];
    }

    // Get sections for all syllabi
    let sections = [];
    let sectionsError = null;
    try {
      const syllabusIds = syllabi.map(s => s.id);
      if (syllabusIds.length > 0) {
        const result = await supabase
          .from('syllabus_sections')
          .select('*')
          .in('syllabus_id', syllabusIds)
          .order('position');
        sections = result.data || [];
        sectionsError = result.error;
        if (sectionsError && sectionsError.code !== 'PGRST116') {
          console.warn('[subjectsClient] Error loading sections:', sectionsError);
        }
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading sections:', err);
      sections = [];
    }

    // Get goals
    let goals = [];
    let goalsError = null;
    try {
      let goalsQuery = supabase
        .from('subject_goals')
        .select('*')
        .eq('subject_id', subjectId);

      // Apply session-based filtering
      if (session) {
        goalsQuery = applyChildFilter(goalsQuery, session, 'child_id');
      } else if (childId) {
        goalsQuery = goalsQuery.eq('child_id', childId);
      }

      const result = await goalsQuery;
      goals = result.data || [];
      goalsError = result.error;
      if (goalsError && goalsError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading goals:', goalsError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading goals:', err);
      goals = [];
    }

    // Get ALL events (including completed ones for progress calculation).
    // Include events linked by legacy subject_id and multi-subject metadata subject_ids.
    let events = [];
    let eventsError = null;
    try {
      const applyEventChildFilter = (query) => {
        if (session) return applyChildFilter(query, session, 'child_id');
        if (childId) return query.eq('child_id', childId);
        return query;
      };

      let primaryEventsQuery = supabase
        .from('events')
        .select('*')
        .eq('subject_id', subjectId)
        .is('deleted_at', null)
        .is('canceled_at', null)
        .order('due_ts', { ascending: true, nullsLast: true })
        .order('start_ts', { ascending: true, nullsLast: true })
        .limit(500); // Increased limit to include completed events for progress
      primaryEventsQuery = applyEventChildFilter(primaryEventsQuery);

      let linkedEventsQuery = supabase
        .from('events')
        .select('*')
        .contains('curriculum_metadata', { subject_ids: [String(subjectId)] })
        .is('deleted_at', null)
        .is('canceled_at', null)
        .order('due_ts', { ascending: true, nullsLast: true })
        .order('start_ts', { ascending: true, nullsLast: true })
        .limit(500);
      linkedEventsQuery = applyEventChildFilter(linkedEventsQuery);

      const [primaryResult, linkedResult] = await Promise.all([primaryEventsQuery, linkedEventsQuery]);
      const primaryEvents = primaryResult?.data || [];
      const linkedEvents = linkedResult?.data || [];
      const primaryError = primaryResult?.error || null;
      const linkedError = linkedResult?.error || null;

      const mergedById = new Map();
      [...primaryEvents, ...linkedEvents].forEach((eventRow) => {
        const eventId = String(eventRow?.id || '').trim();
        if (!eventId) return;
        if (!mergedById.has(eventId)) mergedById.set(eventId, eventRow);
      });
      events = Array.from(mergedById.values()).sort((a, b) => {
        const dueA = a?.due_ts ? new Date(a.due_ts).getTime() : Number.POSITIVE_INFINITY;
        const dueB = b?.due_ts ? new Date(b.due_ts).getTime() : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;
        const startA = a?.start_ts ? new Date(a.start_ts).getTime() : Number.POSITIVE_INFINITY;
        const startB = b?.start_ts ? new Date(b.start_ts).getTime() : Number.POSITIVE_INFINITY;
        return startA - startB;
      });

      eventsError = primaryError || linkedError;
      if (primaryError && primaryError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading primary subject events:', primaryError);
      }
      if (linkedError && linkedError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading linked subject events:', linkedError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading events:', err);
      events = [];
    }

    try {
      const academicYearIds = [...new Set(
        (events || [])
          .map((eventItem) => String(eventItem?.academic_year_id || '').trim())
          .filter(Boolean)
      )];
      if (academicYearIds.length > 0) {
        const { data: yearRows } = await supabase
          .from('academic_years')
          .select('id, attendance_tracking_mode, updated_at')
          .in('id', academicYearIds)
          .order('updated_at', { ascending: false })
          .limit(1);
        const rawYearMode = Array.isArray(yearRows) && yearRows.length > 0
          ? yearRows[0]?.attendance_tracking_mode
          : '';
        if (rawYearMode) {
          attendanceTrackingMode = getAttendanceMode({ academicYearMode: rawYearMode });
        }
      } else {
        const subjectSchoolYear = String(subject?.school_year || '').trim();
        if (subjectSchoolYear) {
          const match = subjectSchoolYear.match(/^(\d{4})\/(\d{2})$/);
          if (match) {
            const startYear = Number(match[1]);
            const endYear = 2000 + Number(match[2]);
            const minStart = `${startYear}-01-01`;
            const maxStart = `${endYear}-12-31`;
            const { data: yearRows } = await supabase
              .from('academic_years')
              .select('attendance_tracking_mode, updated_at, start_date')
              .eq('family_id', familyId)
              .gte('start_date', minStart)
              .lte('start_date', maxStart)
              .order('updated_at', { ascending: false })
              .limit(1);
            const rawYearMode = Array.isArray(yearRows) && yearRows.length > 0
              ? yearRows[0]?.attendance_tracking_mode
              : '';
            if (rawYearMode) {
              attendanceTrackingMode = getAttendanceMode({ academicYearMode: rawYearMode });
            }
          }
        }
      }
      if (!attendanceTrackingMode) {
        const subjectSchoolYear = String(subject?.school_year || '').trim();
        let settingsQuery = supabase
          .from('family_planner_settings')
          .select('attendance_tracking_mode')
          .eq('family_id', familyId);
        if (subjectSchoolYear) {
          settingsQuery = settingsQuery.eq('school_year_label', subjectSchoolYear);
        }
        settingsQuery = settingsQuery.limit(1);
        const { data: settingsRows } = await settingsQuery;
        const rawSettingsMode = Array.isArray(settingsRows) && settingsRows.length > 0
          ? settingsRows[0]?.attendance_tracking_mode
          : '';
        if (rawSettingsMode) {
          attendanceTrackingMode = getAttendanceMode({ plannerSettingsMode: rawSettingsMode });
        }
      }
    } catch (_) {
      attendanceTrackingMode = '';
    }
    attendanceTrackingMode = getAttendanceMode({
      academicYearMode: attendanceTrackingMode,
      fallback: ATTENDANCE_MODES.SUBJECT,
    });

    const isMissingDayDateColumn = (error) => {
      const msg = String(error?.message || error?.detail || '').toLowerCase();
      return msg.includes('day_date') && (msg.includes('column') || msg.includes('schema cache') || msg.includes('does not exist'));
    };

    // Get attendance records for this subject's events
    let attendanceRecords = [];
    let attendanceError = null;
    try {
      const eventIds = events.map(e => e.id);
      if (eventIds.length > 0) {
        let attendanceQuery = supabase
          .from('attendance_records')
          .select('id, event_id, child_id, day_date, minutes, status, created_at')
          .in('event_id', eventIds);

        // Apply session-based filtering
        if (session) {
          attendanceQuery = applyChildFilter(attendanceQuery, session, 'child_id');
        } else if (childId) {
          attendanceQuery = attendanceQuery.eq('child_id', childId);
        }

        let result = await attendanceQuery;
        if (result.error && isMissingDayDateColumn(result.error)) {
          let legacyQuery = supabase
            .from('attendance_records')
            .select('id, event_id, child_id, date, minutes_present, status, created_at')
            .in('event_id', eventIds);

          if (session) {
            legacyQuery = applyChildFilter(legacyQuery, session, 'child_id');
          } else if (childId) {
            legacyQuery = legacyQuery.eq('child_id', childId);
          }
          const legacy = await legacyQuery;
          result = {
            data: (legacy.data || []).map((row) => ({
              id: row.id,
              event_id: row.event_id,
              child_id: row.child_id,
              day_date: row.date || null,
              minutes: row.minutes_present ?? 0,
              status: row.status || 'present',
              created_at: row.created_at,
            })),
            error: legacy.error,
          };
        }

        attendanceRecords = result.data || [];
        attendanceError = result.error;
        if (attendanceError && attendanceError.code !== 'PGRST116') {
          console.warn('[subjectsClient] Error loading attendance:', attendanceError);
        }
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading attendance:', err);
      attendanceRecords = [];
    }

    // Get grades for this subject
    let grades = [];
    let gradesError = null;
    try {
      let gradesQuery = supabase
        .from('grades')
        .select('id, child_id, subject_id, score, grade, possible, created_at')
        .eq('subject_id', subjectId);

      // Apply session-based filtering
      if (session) {
        gradesQuery = applyChildFilter(gradesQuery, session, 'child_id');
      } else if (childId) {
        gradesQuery = gradesQuery.eq('child_id', childId);
      }

      const result = await gradesQuery
        .order('created_at', { ascending: false })
        .limit(30); // Last 30 graded items
      grades = result.data || [];
      gradesError = result.error;
      if (gradesError && gradesError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading grades:', gradesError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading grades:', err);
      grades = [];
    }

    // Get event outcomes (may contain grades)
    let eventOutcomes = [];
    let outcomesError = null;
    try {
      const eventIds = events.map(e => e.id);
      if (eventIds.length > 0) {
        let outcomesQuery = supabase
          .from('event_outcomes')
          .select('id, event_id, child_id, grade, rating, created_at')
          .in('event_id', eventIds);

        // Apply session-based filtering
        if (session) {
          outcomesQuery = applyChildFilter(outcomesQuery, session, 'child_id');
        } else if (childId) {
          outcomesQuery = outcomesQuery.eq('child_id', childId);
        }

        const result = await outcomesQuery;
        eventOutcomes = result.data || [];
        outcomesError = result.error;
        if (outcomesError && outcomesError.code !== 'PGRST116') {
          console.warn('[subjectsClient] Error loading event outcomes:', outcomesError);
        }
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading event outcomes:', err);
      eventOutcomes = [];
    }

    // Get compliance data
    let complianceItems = [];
    let complianceError = null;
    try {
      // Get compliance checklist items for children assigned to this subject
      const assignedChildIds = subject.child_id 
        ? parseChildIds(subject.child_id)
        : []; // If empty, applies to all children

      if (assignedChildIds.length > 0 || !childId) {
        let complianceQuery = supabase
          .from('family_compliance_checklist')
          .select(`
            id,
            child_id,
            requirement_id,
            status,
            completed_at,
            state_code
          `)
          .eq('family_id', familyId);

        // Apply session-based filtering
        if (session) {
          complianceQuery = applyChildFilter(complianceQuery, session, 'child_id');
        } else if (childId) {
          complianceQuery = complianceQuery.eq('child_id', childId);
        } else if (assignedChildIds.length > 0) {
          complianceQuery = complianceQuery.in('child_id', assignedChildIds);
        }

        const result = await complianceQuery;
        complianceItems = result.data || [];
        complianceError = result.error;
        if (complianceError && complianceError.code !== 'PGRST116') {
          console.warn('[subjectsClient] Error loading compliance:', complianceError);
        }
        // Enrich with state_requirements (no FK embed in schema, so fetch separately)
        if (complianceItems.length > 0) {
          const reqIds = [...new Set(complianceItems.map(ci => ci.requirement_id).filter(Boolean))];
          if (reqIds.length > 0) {
            const { data: reqs } = await supabase
              .from('state_requirements')
              .select('id, requirement_type, requirement_title, requirement_description')
              .in('id', reqIds);
            const reqMap = (reqs || []).reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
            complianceItems = complianceItems.map(ci => ({
              ...ci,
              state_requirements: ci.requirement_id ? reqMap[ci.requirement_id] || null : null,
            }));
          }
        }
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading compliance:', err);
      complianceItems = [];
    }

    // Get related materials (Materials Snapshot: syllabus + lesson plans only, same role tags as Library)
    let materials = [];
    let materialsError = null;
    try {
      let materialsQuery = supabase
        .from('materials')
        .select('id, title, provider_name, provider_url, subject_id, subject_key, tags, mime, storage_path, created_at, updated_at')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Match by subject_id when present, but also fall back to subject_key for older materials
      if (subject?.name) {
        materialsQuery = materialsQuery.or(
          `subject_id.eq.${subjectId},subject_key.eq.${subject.name}`
        );
      } else {
        materialsQuery = materialsQuery.eq('subject_id', subjectId);
      }

      const result = await materialsQuery.limit(80);
      const raw = result.data || [];
      materials = raw
        .filter((m) => {
          const r = deriveRoleFromTags(m?.tags);
          return r === DOCUMENT_ROLES.SYLLABUS || r === DOCUMENT_ROLES.LESSON_PLAN;
        })
        .slice(0, 6);
      materialsError = result.error;
      if (materialsError && materialsError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading materials:', materialsError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading materials:', err);
      materials = [];
    }

    let eventAttachmentMaterials = [];
    try {
      const eventMaterialIds = [...new Set(
        (events || []).flatMap((eventRow) => {
          const ids = [];
          const primaryId = String(eventRow?.material_id || '').trim();
          if (primaryId) ids.push(primaryId);
          const attachmentIds = Array.isArray(eventRow?.materials_attachment_ids)
            ? eventRow.materials_attachment_ids
            : [];
          attachmentIds.forEach((id) => {
            const normalized = String(id || '').trim();
            if (normalized) ids.push(normalized);
          });
          return ids;
        })
      )];
      if (eventMaterialIds.length > 0) {
        const { data: attachmentRows, error: attachmentError } = await supabase
          .from('materials')
          .select('id, title, provider_name, provider_url, subject_id, mime, storage_path, created_at, updated_at')
          .eq('family_id', familyId)
          .in('id', eventMaterialIds)
          .is('deleted_at', null);
        if (attachmentError && attachmentError.code !== 'PGRST116') {
          console.warn('[subjectsClient] Error loading event attachment materials:', attachmentError);
        }
        eventAttachmentMaterials = attachmentRows || [];
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading event attachment materials:', err);
      eventAttachmentMaterials = [];
    }

    // Calculate metrics
    // 1. Progress percent: attended or completed planned events / planned events (else syllabus milestones)
    const progressPercent = computeSubjectProgressPercent(events, attendanceRecords, sections);

    // 2. Attendance rate (last 30 days): present / (present+absent)
    let attendanceRate30 = null;
    if (attendanceRecords.length > 0) {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const last30 = attendanceRecords.filter((ar) => {
        const d = ar?.day_date ? new Date(`${ar.day_date}T00:00:00`) : null;
        return d && !Number.isNaN(d.getTime()) && d >= thirtyDaysAgo && d <= now;
      });
      const present = last30.filter(ar => ar.status === 'present').length;
      const absent = last30.filter(ar => ar.status === 'absent').length;
      const total = present + absent;
      if (total > 0) {
        attendanceRate30 = Math.round((present / total) * 100);
      }
    }

    // 3. Average grade percent: avg(score/possible) over last N items
    let avgGradePercent = null;
    const gradedItems = [
      ...grades.filter(g => (g.score !== null && g.score !== undefined) || g.grade),
      ...eventOutcomes.filter(eo => eo.grade !== null && eo.grade !== undefined),
      ...events.filter(e => e.grade !== null && e.grade !== undefined),
    ];
    
    if (gradedItems.length > 0) {
      const percentages = gradedItems
        .map(item => {
          // If we have score and possible, calculate percentage
          if (item.score !== null && item.score !== undefined && item.possible !== null && item.possible !== undefined && item.possible > 0) {
            const score = typeof item.score === 'number' ? item.score : parseFloat(item.score);
            const possible = typeof item.possible === 'number' ? item.possible : parseFloat(item.possible);
            if (!isNaN(score) && !isNaN(possible) && possible > 0) {
              return Math.round((score / possible) * 100);
            }
          }
          // If score exists but no possible, assume it's already a percentage (0-100)
          if (item.score !== null && item.score !== undefined) {
            const score = typeof item.score === 'number' ? item.score : parseFloat(item.score);
            if (!isNaN(score) && score >= 0 && score <= 100) {
              return score;
            }
          }
          // Try to parse grade (e.g., "A" = 95, "B+" = 87, etc.)
          if (item.grade) {
            const gradeMap = {
              'A+': 98, 'A': 95, 'A-': 92,
              'B+': 87, 'B': 85, 'B-': 82,
              'C+': 77, 'C': 75, 'C-': 72,
              'D+': 67, 'D': 65, 'D-': 62,
              'F': 50,
            };
            return gradeMap[item.grade] || null;
          }
          return null;
        })
        .filter(percent => percent !== null && !isNaN(percent));
      
      if (percentages.length > 0) {
        const sum = percentages.reduce((a, b) => a + b, 0);
        avgGradePercent = Math.round(sum / percentages.length);
      }
    }

    // 4. Compliance ready: count of compliance_items where status in [met|on_track] vs total
    let complianceReady = null;
    if (complianceItems.length > 0) {
      const ready = complianceItems.filter(ci => 
        ci.status === 'met' || ci.status === 'on_track' || ci.status === 'completed'
      ).length;
      complianceReady = {
        met: ready,
        total: complianceItems.length,
      };
    }

    // Process events for timeline
    const allWorkItems = [
      ...events.map(e => ({
        id: `event-${e.id}`,
        type: 'event',
        title: e.title,
        dueDate: e.due_ts || e.end_ts || e.start_ts,
        isOverdue: e.due_ts ? new Date(e.due_ts) < new Date() && e.status !== 'done' : false,
        eventType: e.event_type,
        status: e.status,
        childId: e.child_id,
        description: e.description,
      })),
    ].filter(item => item.dueDate);

    allWorkItems.sort((a, b) => {
      const dateA = a.dueDate ? new Date(a.dueDate) : new Date(0);
      const dateB = b.dueDate ? new Date(b.dueDate) : new Date(0);
      return dateA - dateB;
    });

    // Upcoming = strictly in the future (after now), using client local time
    const now = new Date();
    const upcomingItems = allWorkItems
      .filter(item => item.dueDate && new Date(item.dueDate) > now)
      .slice(0, 5);
    const overdueItems = allWorkItems.filter(item => item.isOverdue);
    const nextItem = upcomingItems.length > 0 ? upcomingItems[0] : null;

    let assignmentAttentionByEventId = {};
    try {
      let aq = supabase
        .from('assignments')
        .select('linked_event_ids, need_help, status, review_status')
        .eq('family_id', familyId)
        .eq('related_subject', subjectId);
      if (session) {
        aq = applyChildFilter(aq, session, 'child_id');
      } else if (childId) {
        aq = aq.eq('child_id', childId);
      }
      const { data: assignRows } = await aq;
      assignmentAttentionByEventId = mergeAssignmentAttentionByEventId(assignRows || []);
    } catch (err) {
      console.warn('[subjectsClient] assignment attention by event:', err);
    }

    let assignmentsNeedingHelp = [];
    let assignmentsAssignedToStudent = [];
    let subjectAssignments = [];
    let assignmentsByEventId = {};
    const subjectDetailParentLike =
      session?.role_flags?.isParent === true ||
      (!session?.role_flags?.isChild && !session?.role_flags?.isTutor);
    try {
      const assignSelect =
        'id, title, description, child_id, due_date, start_work_by, need_help, help_message_log, linked_event_ids, linked_evidence_ids, linked_review_attachment_ids, status, review_status, review_feedback, submitted_at, progress_percent, grade_display, grade_value, family_id, related_subject, updated_at, created_at';
      let assignQ = supabase
        .from('assignments')
        .select(assignSelect)
        .eq('family_id', familyId)
        .eq('related_subject', subjectId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (session) {
        assignQ = applyChildFilter(assignQ, session, 'child_id');
      } else if (childId) {
        assignQ = assignQ.eq('child_id', childId);
      }
      const { data: assignRows } = await assignQ;
      subjectAssignments = assignRows || [];
      assignmentsByEventId = mergeAssignmentsByEventId(subjectAssignments);
      if (subjectDetailParentLike) {
        assignmentsNeedingHelp = subjectAssignments.filter((row) => row?.need_help === true);
        assignmentsAssignedToStudent = subjectAssignments.filter((row) => {
          const status = String(row?.status || '').trim().toLowerCase();
          return status === 'not_started' || status === 'in_progress';
        });
      }
    } catch (e) {
      console.warn('[subjectsClient] subject detail assignment lists:', e);
    }

    return {
      subject,
      syllabi,
      sections,
      goals,
      events, // Includes both regular events, backlog items (is_backlog=true), and assignments (event_type='assignment')
      materials,
      eventAttachmentMaterials,
      // New metrics
      progressPercent,
      attendanceRate30,
      avgGradePercent,
      complianceReady,
      // Timeline data
      upcomingItems,
      overdueItems,
      nextItem,
      // Raw data for sections
      attendanceRecords,
      grades,
      eventOutcomes,
      complianceItems,
      /** For parent UI: which calendar events have linked help/submission work. */
      assignmentAttentionByEventId,
      /** Parent: assignments with student “need help” for this subject. */
      assignmentsNeedingHelp,
      /** Parent: work assigned to students but not yet submitted (not_started / in_progress). */
      assignmentsAssignedToStudent,
      /** All subject-linked assignments keyed by calendar event id. */
      assignmentsByEventId,
      subjectAssignments,
      attendance_tracking_mode: attendanceTrackingMode,
    };
  } catch (error) {
    if (!isAbortLikeError(error)) {
      console.error('[subjectsClient] Error getting subject detail:', error);
    }
    throw error;
  }
}

/**
 * Initialize compliance checklist for given children and state (e.g. from Subject Details "Generate requirements").
 * For each child, if no checklist items exist for (childId, stateCode), fetches state_requirements for that state
 * and inserts rows into family_compliance_checklist. Does not filter by is_common so all state requirements are included.
 * @param {string} familyId
 * @param {string[]} childIds
 * @param {string} stateCode - e.g. 'DC', 'CA'
 * @returns {Promise<{ initialized: number, skipped: number, requirementCount: number, error?: string }>}
 */
export async function initializeComplianceChecklistForSubject(familyId, childIds, stateCode) {
  if (!familyId || !stateCode || !childIds || childIds.length === 0) {
    return { initialized: 0, skipped: 0, requirementCount: 0 };
  }
  const normalizedState = stateCode.toUpperCase();
  let initialized = 0;
  let skipped = 0;
  let requirementCount = 0;

  for (const childId of childIds) {
    const { data: existing, error: existingErr } = await supabase
      .from('family_compliance_checklist')
      .select('id')
      .eq('child_id', childId)
      .eq('state_code', normalizedState)
      .limit(1);
    if (existingErr) {
      console.warn('[subjectsClient] initializeCompliance: existing check failed', existingErr);
      return { initialized, skipped, requirementCount, error: existingErr.message };
    }
    if (existing && existing.length > 0) {
      skipped += 1;
      continue;
    }

    const { data: requirements, error: reqErr } = await supabase
      .from('state_requirements')
      .select('id')
      .eq('state_code', normalizedState);
    if (reqErr) {
      console.warn('[subjectsClient] initializeCompliance: state_requirements fetch failed', reqErr);
      return { initialized, skipped, requirementCount: 0, error: reqErr.message };
    }
    if (!requirements || requirements.length === 0) {
      return { initialized, skipped, requirementCount: 0, error: `No requirements found for state ${normalizedState}. Run the seed script.` };
    }
    requirementCount = requirements.length;

    const rows = requirements.map((r) => ({
      family_id: familyId,
      child_id: childId,
      state_code: normalizedState,
      requirement_id: r.id,
      status: 'pending',
    }));
    const { error: insertErr } = await supabase
      .from('family_compliance_checklist')
      .insert(rows);
    if (insertErr) {
      console.warn('[subjectsClient] initializeCompliance: insert failed', insertErr);
      return { initialized, skipped, requirementCount, error: insertErr.message };
    }
    initialized += 1;
  }
  return { initialized, skipped, requirementCount };
}
