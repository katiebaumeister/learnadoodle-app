import { supabase } from '../supabase';
import { applyChildFilter, getAccessibleChildIds } from '../queryFilters';
import { deriveRoleFromTags, DOCUMENT_ROLES } from '../docs/roles';

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
      .select('id, name, child_id, grade, notes, summary, school_year, created_at, updated_at')
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
      } else if (session.role_flags?.isChild || session.role_flags?.isTutor) {
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

    // Get all events (including completed ones for progress calculation)
    let events = [];
    let eventsError = null;
    try {
      const now = new Date().toISOString();
      let eventsQuery = supabase
        .from('events')
        .select('id, title, start_ts, end_ts, due_ts, subject_id, child_id, status, event_type, description, is_backlog')
        .in('subject_id', subjectIds)
        .is('deleted_at', null)
        .is('canceled_at', null)
        .order('due_ts', { ascending: true, nullsLast: true })
        .order('start_ts', { ascending: true, nullsLast: true })
        .limit(500); // Increased limit to include completed events for progress

      // Apply session-based filtering
      if (session) {
        eventsQuery = applyChildFilter(eventsQuery, session, 'child_id');
      } else if (childId) {
        eventsQuery = eventsQuery.eq('child_id', childId);
      }

      const result = await eventsQuery;
      events = result.data || [];
      eventsError = result.error;
      if (eventsError && eventsError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading events:', eventsError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading events:', err);
      events = [];
    }

    // Get attendance records for this week (for thisWeekMinutes calculation)
    // We'll filter by event_id after getting events
    let attendanceRecords = [];
    let attendanceError = null;
    try {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get event IDs for these subjects to filter attendance
      const eventIds = events.map(e => e.id);
      
      if (eventIds.length > 0) {
        let attendanceQuery = supabase
          .from('attendance_records')
          .select('id, event_id, child_id, day_date, minutes, created_at')
          .gte('day_date', weekStartStr)
          .lt('day_date', weekEndStr)
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
      const subjectEvents = events.filter(e => e.subject_id === subject.id);
      
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

      // Calculate progress percent
      // Option 1: Use syllabus milestones if available
      let progressPercent = null;
      if (syllabusSections.length > 0) {
        const completedSections = syllabusSections.filter(s => {
          if (!s.suggested_due_ts) return false;
          const dueDate = new Date(s.suggested_due_ts);
          return dueDate < new Date();
        });
        progressPercent = Math.round((completedSections.length / syllabusSections.length) * 100);
      } else {
        // Option 2: Use completed events / total planned events
        const completedEvents = subjectEvents.filter(e => e.status === 'done');
        const totalPlannedEvents = subjectEvents.filter(e => 
          e.status !== 'canceled' && !e.is_backlog
        );
        if (totalPlannedEvents.length > 0) {
          progressPercent = Math.min(100, Math.round((completedEvents.length / totalPlannedEvents.length) * 100));
        }
      }

      // Calculate this week minutes from attendance records
      const subjectEventIds = subjectEvents.map(e => e.id);
      const thisWeekAttendance = attendanceRecords.filter(ar => 
        subjectEventIds.includes(ar.event_id)
      );
      const thisWeekMinutes = thisWeekAttendance.reduce((sum, ar) => sum + (ar.minutes || 0), 0);

      // Calculate last activity
      // Use completed events' end_ts (most reliable) and attendance records' created_at as fallback
      const completedEventTimestamps = subjectEvents
        .filter(e => e.status === 'done' && e.end_ts)
        .map(e => new Date(e.end_ts));
      const attendanceTimestamps = thisWeekAttendance
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

    return enrichedSubjects;
  } catch (error) {
    console.error('[subjectsClient] Error getting subjects with overview:', error);
    throw error;
  }
}

/**
 * Get detailed subject information
 * @param {string} subjectId - Subject ID
 * @param {string} familyId - Family ID
 * @param {string|null} childId - Optional child ID (deprecated, use session instead)
 * @param {Object|null} session - Session context for role-based filtering
 */
export async function getSubjectDetail(subjectId, familyId, childId = null, session = null) {
  if (!subjectId || !familyId) {
    throw new Error('Subject ID and Family ID are required');
  }

  try {
    // Get subject
    const { data: subject, error: subjectError } = await supabase
      .from('subject')
      .select('*')
      .eq('id', subjectId)
      .eq('family_id', familyId)
      .single();

    if (subjectError) throw subjectError;

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

    // Get ALL events (including completed ones for progress calculation)
    let events = [];
    let eventsError = null;
    try {
      let eventsQuery = supabase
        .from('events')
        .select('*')
        .eq('subject_id', subjectId)
        .is('deleted_at', null)
        .is('canceled_at', null)
        .order('due_ts', { ascending: true, nullsLast: true })
        .order('start_ts', { ascending: true, nullsLast: true })
        .limit(500); // Increased limit to include completed events for progress

      // Apply session-based filtering
      if (session) {
        eventsQuery = applyChildFilter(eventsQuery, session, 'child_id');
      } else if (childId) {
        eventsQuery = eventsQuery.eq('child_id', childId);
      }

      const result = await eventsQuery;
      events = result.data || [];
      eventsError = result.error;
      if (eventsError && eventsError.code !== 'PGRST116') {
        console.warn('[subjectsClient] Error loading events:', eventsError);
      }
    } catch (err) {
      console.warn('[subjectsClient] Exception loading events:', err);
      events = [];
    }

    // Get attendance records for last 30 days
    let attendanceRecords = [];
    let attendanceError = null;
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];

      const eventIds = events.map(e => e.id);
      if (eventIds.length > 0) {
        let attendanceQuery = supabase
          .from('attendance_records')
          .select('id, event_id, child_id, day_date, minutes, status, created_at')
          .gte('day_date', thirtyDaysAgoStr)
          .lte('day_date', todayStr)
          .in('event_id', eventIds);

        // Apply session-based filtering
        if (session) {
          attendanceQuery = applyChildFilter(attendanceQuery, session, 'child_id');
        } else if (childId) {
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
        .select('id, title, provider_name, provider_url, subject_id, subject_key, tags')
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

    // Calculate metrics
    // 1. Progress percent: completed_events / planned_events (if planned exists), else null
    const completedEvents = events.filter(e => e.status === 'done');
    const plannedEvents = events.filter(e => 
      e.status !== 'canceled' && !e.is_backlog
    );
    let progressPercent = null;
    if (plannedEvents.length > 0) {
      progressPercent = Math.min(100, Math.round((completedEvents.length / plannedEvents.length) * 100));
    } else if (sections.length > 0) {
      // Use syllabus milestones if available
      const completedSections = sections.filter(s => {
        if (!s.suggested_due_ts) return false;
        const dueDate = new Date(s.suggested_due_ts);
        return dueDate < new Date();
      });
      progressPercent = Math.round((completedSections.length / sections.length) * 100);
    }

    // 2. Attendance rate (last 30 days): present / (present+absent)
    let attendanceRate30 = null;
    if (attendanceRecords.length > 0) {
      const present = attendanceRecords.filter(ar => ar.status === 'present').length;
      const absent = attendanceRecords.filter(ar => ar.status === 'absent').length;
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

    return {
      subject,
      syllabi,
      sections,
      goals,
      events, // Includes both regular events, backlog items (is_backlog=true), and assignments (event_type='assignment')
      materials,
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
    };
  } catch (error) {
    console.error('[subjectsClient] Error getting subject detail:', error);
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
