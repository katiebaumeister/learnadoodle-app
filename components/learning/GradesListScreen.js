import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../contexts/SessionContext';
import ChildAvatarCluster, { sourceForChild } from '../ui/ChildAvatarCluster';

const ALL_CHILDREN = 'all';
const ALL_SUBJECTS = 'all';

const ASSIGNMENT_SELECT =
  'id, title, child_id, due_date, submitted_at, linked_event_ids, status, review_status, reviewed_at, grade_display, grade_value, related_subject, updated_at, created_at';

function firstLinkedEventId(raw) {
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

function getAssignmentGradeLabel(assignment) {
  if (assignment?.grade_display) return String(assignment.grade_display).trim();
  if (assignment?.grade_value != null) {
    const n = Number(assignment.grade_value);
    if (Number.isFinite(n)) return `${Math.round(n)}%`;
  }
  return null;
}

function assignmentIsAwaitingGrade(assignment) {
  if (getAssignmentGradeLabel(assignment)) return false;
  const status = String(assignment?.status || '').trim().toLowerCase();
  const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
  if (assignment?.submitted_at) return true;
  if (status === 'submitted' || status === 'reviewed' || status === 'accepted') return true;
  if (reviewStatus === 'approved' || reviewStatus === 'reviewed') return true;
  return false;
}

function assignmentBelongsInGradesList(assignment) {
  return Boolean(getAssignmentGradeLabel(assignment)) || assignmentIsAwaitingGrade(assignment);
}

function resolveEventChildId(event, fallbackChildId = null) {
  if (event?.child_id) return String(event.child_id);
  const ids = event?.child_ids;
  if (Array.isArray(ids) && ids.length === 1) return String(ids[0]);
  return fallbackChildId;
}

function formatGradeDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortGradeRows(rows) {
  return [...rows].sort((a, b) => {
    const dateA = new Date(a?.sortDate || 0).getTime();
    const dateB = new Date(b?.sortDate || 0).getTime();
    return dateB - dateA;
  });
}

function resolveRowGradeLabel(assignment, eventId, eventsById, outcomesByEventId) {
  const fromAssignment = getAssignmentGradeLabel(assignment);
  if (fromAssignment) return fromAssignment;
  if (!eventId) return null;
  const outcomeGrade = outcomesByEventId[eventId]?.grade;
  if (outcomeGrade) return String(outcomeGrade).trim();
  const eventGrade = eventsById[eventId]?.grade;
  if (eventGrade) return String(eventGrade).trim();
  return null;
}

export default function GradesListScreen({
  familyId,
  children = [],
  subjects = [],
  userRole = 'parent',
  accessibleChildren = [],
  viewingAsChildId = null,
}) {
  const session = useSession();
  const safeChildren = Array.isArray(children) ? children : [];
  const safeSubjects = Array.isArray(subjects) ? subjects : [];
  const isChildView = userRole === 'child' || userRole === 'student';
  const scopedChildId = viewingAsChildId || (isChildView && accessibleChildren?.[0]?.id) || null;
  const isParentViewer =
    session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true;

  const [gradeRows, setGradeRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChildFilter, setSelectedChildFilter] = useState(() => {
    if (scopedChildId) return String(scopedChildId);
    return ALL_CHILDREN;
  });
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState(ALL_SUBJECTS);

  useEffect(() => {
    if (scopedChildId) {
      setSelectedChildFilter(String(scopedChildId));
    }
  }, [scopedChildId]);

  const subjectNameById = useMemo(() => {
    const map = {};
    safeSubjects.forEach((subject) => {
      const id = String(subject?.id || '').trim();
      if (!id) return;
      map[id] = subject?.name || 'Subject';
    });
    return map;
  }, [safeSubjects]);

  const childNameById = useMemo(() => {
    const map = {};
    safeChildren.forEach((child) => {
      const id = String(child?.id || '').trim();
      if (!id) return;
      map[id] = child?.first_name || child?.name || child?.full_name || 'Student';
    });
    return map;
  }, [safeChildren]);

  const loadGradeRows = useCallback(async () => {
    if (!familyId) {
      setGradeRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let assignQuery = supabase
        .from('assignments')
        .select(ASSIGNMENT_SELECT)
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (scopedChildId) {
        assignQuery = assignQuery.eq('child_id', scopedChildId);
      } else if (isChildView && accessibleChildren?.length) {
        const childIds = accessibleChildren
          .map((child) => (typeof child === 'string' ? child : child?.id))
          .filter(Boolean);
        if (childIds.length) assignQuery = assignQuery.in('child_id', childIds);
      }

      let outcomesQuery = supabase
        .from('event_outcomes')
        .select(
          'id, event_id, child_id, subject_id, grade, created_at, events(id, title, start_ts, end_ts, subject_id, child_id, child_ids, grade)'
        )
        .eq('family_id', familyId);

      if (scopedChildId) {
        outcomesQuery = outcomesQuery.eq('child_id', scopedChildId);
      } else if (isChildView && accessibleChildren?.length) {
        const childIds = accessibleChildren
          .map((child) => (typeof child === 'string' ? child : child?.id))
          .filter(Boolean);
        if (childIds.length) outcomesQuery = outcomesQuery.in('child_id', childIds);
      }

      let eventsQuery = supabase
        .from('events')
        .select('id, title, child_id, child_ids, subject_id, start_ts, end_ts, grade, updated_at')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .not('grade', 'is', null);

      const [assignResult, outcomesResult, eventsResult] = await Promise.all([
        assignQuery,
        outcomesQuery,
        eventsQuery,
      ]);

      if (assignResult.error) throw assignResult.error;
      if (outcomesResult.error) throw outcomesResult.error;
      if (eventsResult.error) throw eventsResult.error;

      const assignments = (assignResult.data || []).filter(assignmentBelongsInGradesList);
      const outcomes = outcomesResult.data || [];
      const gradedEvents = eventsResult.data || [];

      const eventsById = {};
      gradedEvents.forEach((event) => {
        eventsById[String(event.id)] = event;
      });

      const outcomesByEventId = {};
      outcomes.forEach((outcome) => {
        if (!outcome?.grade) return;
        outcomesByEventId[String(outcome.event_id)] = outcome;
        const linkedEvent = outcome.events;
        if (linkedEvent?.id) {
          eventsById[String(linkedEvent.id)] = linkedEvent;
        }
      });

      const assignmentLinkedEventIds = new Set();
      const rows = [];

      assignments.forEach((assignment) => {
        const eventId = firstLinkedEventId(assignment.linked_event_ids);
        if (eventId) assignmentLinkedEventIds.add(eventId);

        const childId = String(assignment.child_id || '');
        const gradeLabel = resolveRowGradeLabel(
          assignment,
          eventId,
          eventsById,
          outcomesByEventId
        );
        const sortDate =
          assignment.submitted_at ||
          assignment.updated_at ||
          assignment.due_date ||
          assignment.created_at;

        rows.push({
          id: `assignment-${assignment.id}`,
          kind: 'assignment',
          title: assignment.title || 'Assignment',
          childId,
          subjectId: String(assignment.related_subject || ''),
          sortDate,
          gradeLabel,
          awaiting: !gradeLabel,
          assignment,
          eventId,
        });
      });

      outcomes.forEach((outcome) => {
        const eventId = String(outcome.event_id || '');
        if (!eventId || !outcome.grade || assignmentLinkedEventIds.has(eventId)) return;

        const event = eventsById[eventId];
        const childId =
          String(outcome.child_id || '') ||
          resolveEventChildId(event, null) ||
          '';
        const subjectId = String(
          outcome.subject_id || event?.subject_id || ''
        );
        const sortDate =
          event?.end_ts ||
          event?.start_ts ||
          outcome.created_at;

        rows.push({
          id: `outcome-${outcome.id}`,
          kind: 'event',
          title: event?.title || 'Event',
          childId,
          subjectId,
          sortDate,
          gradeLabel: String(outcome.grade).trim(),
          awaiting: false,
          assignment: null,
          eventId,
        });
      });

      gradedEvents.forEach((event) => {
        const eventId = String(event.id || '');
        if (!eventId || !event.grade) return;
        if (assignmentLinkedEventIds.has(eventId)) return;
        if (outcomesByEventId[eventId]) return;

        const childId = resolveEventChildId(event, null) || '';
        if (scopedChildId && childId && childId !== String(scopedChildId)) return;

        rows.push({
          id: `event-${eventId}`,
          kind: 'event',
          title: event.title || 'Event',
          childId,
          subjectId: String(event.subject_id || ''),
          sortDate: event.end_ts || event.start_ts || event.updated_at,
          gradeLabel: String(event.grade).trim(),
          awaiting: false,
          assignment: null,
          eventId,
        });
      });

      setGradeRows(sortGradeRows(rows));
    } catch (err) {
      console.error('[GradesListScreen] load error:', err);
      setGradeRows([]);
    } finally {
      setLoading(false);
    }
  }, [familyId, scopedChildId, isChildView, accessibleChildren]);

  useEffect(() => {
    loadGradeRows();
  }, [loadGradeRows]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = () => loadGradeRows();
    window.addEventListener('assignmentsUpdated', refresh);
    window.addEventListener('refreshAssignmentsList', refresh);
    window.addEventListener('assignmentReviewed', refresh);
    window.addEventListener('subjectsDataRefresh', refresh);
    return () => {
      window.removeEventListener('assignmentsUpdated', refresh);
      window.removeEventListener('refreshAssignmentsList', refresh);
      window.removeEventListener('assignmentReviewed', refresh);
      window.removeEventListener('subjectsDataRefresh', refresh);
    };
  }, [loadGradeRows]);

  const subjectFilterOptions = useMemo(() => {
    const ids = new Set();
    gradeRows.forEach((row) => {
      const id = String(row?.subjectId || '').trim();
      if (id) ids.add(id);
    });
    safeSubjects.forEach((subject) => {
      const id = String(subject?.id || '').trim();
      if (id) ids.add(id);
    });
    return Array.from(ids)
      .map((id) => ({ id, name: subjectNameById[id] || 'Subject' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [gradeRows, safeSubjects, subjectNameById]);

  const filteredGradeRows = useMemo(() => {
    return gradeRows.filter((row) => {
      const childId = String(row?.childId || '');
      if (selectedChildFilter !== ALL_CHILDREN && childId !== String(selectedChildFilter)) {
        return false;
      }
      const subjectId = String(row?.subjectId || '');
      if (selectedSubjectFilter !== ALL_SUBJECTS && subjectId !== String(selectedSubjectFilter)) {
        return false;
      }
      return true;
    });
  }, [gradeRows, selectedChildFilter, selectedSubjectFilter]);

  const openGradeRow = useCallback(
    (row) => {
      if (!row) return;

      if (row.kind === 'assignment' && row.assignment) {
        const assignment = row.assignment;
        const studentStatusSubmitted =
          assignment.submitted_at ||
          ['submitted', 'reviewed', 'accepted'].includes(
            String(assignment.status || '').trim().toLowerCase()
          );

        if (isParentViewer && studentStatusSubmitted) {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('openReviewForAssignment', { detail: { assignment } })
            );
          }
          return;
        }
      }

      const eventId = row.eventId;
      if (eventId && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('openEventModal', {
            detail: { eventId, schedulingMode: true },
          })
        );
      }
    },
    [isParentViewer]
  );

  const showChildFilters = !scopedChildId && safeChildren.length > 1;

  return (
    <View style={styles.container}>
      {showChildFilters ? (
        <View style={[styles.filterRow, styles.filterRowTop]}>
          <Text style={styles.filterLabel}>Children</Text>
          <View style={styles.filterChipsWrap}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedChildFilter === ALL_CHILDREN && styles.filterChipActive,
              ]}
              onPress={() => setSelectedChildFilter(ALL_CHILDREN)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedChildFilter === ALL_CHILDREN && styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {safeChildren.map((child) => {
              const childId = String(child.id);
              const isActive = selectedChildFilter === childId;
              return (
                <TouchableOpacity
                  key={child.id}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setSelectedChildFilter(childId)}
                >
                  <View style={styles.filterChipAvatarWrap}>
                    <Image
                      source={sourceForChild(child)}
                      style={styles.filterChipAvatar}
                      resizeMode="cover"
                    />
                  </View>
                  <Text
                    style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                    numberOfLines={1}
                  >
                    {child.name || child.first_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {subjectFilterOptions.length > 0 ? (
        <View style={[styles.filterRow, !showChildFilters && styles.filterRowTop]}>
          <Text style={styles.filterLabel}>Subjects</Text>
          <View style={styles.filterChipsWrap}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedSubjectFilter === ALL_SUBJECTS && styles.filterChipActive,
              ]}
              onPress={() => setSelectedSubjectFilter(ALL_SUBJECTS)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedSubjectFilter === ALL_SUBJECTS && styles.filterChipTextActive,
                ]}
              >
                All subjects
              </Text>
            </TouchableOpacity>
            {subjectFilterOptions.map((subject) => {
              const isActive = selectedSubjectFilter === subject.id;
              return (
                <TouchableOpacity
                  key={subject.id}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setSelectedSubjectFilter(subject.id)}
                >
                  <Text
                    style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                    numberOfLines={1}
                  >
                    {subject.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : filteredGradeRows.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>No grades yet</Text>
          <Text style={styles.emptyText}>
            Graded work and submissions awaiting grades will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredGradeRows.map((row) => {
            const childName = childNameById[row.childId] || 'Student';
            const subjectName = subjectNameById[row.subjectId] || null;
            const dateLine = formatGradeDate(row.sortDate);
            const metaParts = [childName];
            if (subjectName) metaParts.push(subjectName);
            if (dateLine) metaParts.push(dateLine);

            return (
              <TouchableOpacity
                key={row.id}
                style={styles.row}
                onPress={() => openGradeRow(row)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Open ${row.title}`}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {row.title}
                  </Text>
                  <View style={styles.rowMetaRow}>
                    <ChildAvatarCluster
                      childIds={row.childId ? [row.childId] : []}
                      familyChildren={safeChildren}
                      size={22}
                      overlap={0}
                    />
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {metaParts.join(' · ')}
                    </Text>
                  </View>
                </View>
                {row.gradeLabel ? (
                  <Text style={styles.gradeValue}>{row.gradeLabel}</Text>
                ) : (
                  <Text style={styles.awaitingGrade}>Awaiting grade</Text>
                )}
                <ChevronRight size={20} color="#94a3b8" />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    minHeight: 0,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
  },
  filterRowTop: {
    paddingTop: 20,
  },
  filterLabel: {
    width: 72,
    paddingTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  filterChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  filterChipAvatarWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  filterChipAvatar: {
    width: 20,
    height: 20,
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowMeta: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  awaitingGrade: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D28D9',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
});
