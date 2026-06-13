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
import { formatDueShort } from '../tutor/tutorHelpUtils';
import { getStudentSubmissionStatusLabel, getWorkStatusLabel } from '../../lib/workEventHelpers';
import { openAssignmentForParent } from '../../lib/openAssignmentWorkflow';
import ChildAvatarCluster, { sourceForChild } from '../ui/ChildAvatarCluster';

const ALL_CHILDREN = 'all';
const ALL_SUBJECTS = 'all';

const ASSIGNMENT_SELECT =
  'id, title, description, child_id, due_date, start_work_by, need_help, linked_event_ids, status, review_status, review_feedback, submitted_at, progress_percent, grade_display, grade_value, related_subject, updated_at, created_at';

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

function sortAssignments(rows) {
  return [...rows].sort((a, b) => {
    const dueA = a?.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    const dueB = b?.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    const updatedA = new Date(a?.updated_at || a?.created_at || 0).getTime();
    const updatedB = new Date(b?.updated_at || b?.created_at || 0).getTime();
    return updatedB - updatedA;
  });
}

export default function AssignmentsListScreen({
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

  const [assignments, setAssignments] = useState([]);
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

  const loadAssignments = useCallback(async () => {
    if (!familyId) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('assignments')
        .select(ASSIGNMENT_SELECT)
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (scopedChildId) {
        query = query.eq('child_id', scopedChildId);
      } else if (isChildView && accessibleChildren?.length) {
        const childIds = accessibleChildren
          .map((child) => (typeof child === 'string' ? child : child?.id))
          .filter(Boolean);
        if (childIds.length) query = query.in('child_id', childIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAssignments(sortAssignments(data || []));
    } catch (err) {
      console.error('[AssignmentsListScreen] load error:', err);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [familyId, scopedChildId, isChildView, accessibleChildren]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = () => loadAssignments();
    window.addEventListener('assignmentsUpdated', refresh);
    window.addEventListener('refreshAssignmentsList', refresh);
    return () => {
      window.removeEventListener('assignmentsUpdated', refresh);
      window.removeEventListener('refreshAssignmentsList', refresh);
    };
  }, [loadAssignments]);

  const subjectFilterOptions = useMemo(() => {
    const ids = new Set();
    assignments.forEach((row) => {
      const id = String(row?.related_subject || '').trim();
      if (id) ids.add(id);
    });
    safeSubjects.forEach((subject) => {
      const id = String(subject?.id || '').trim();
      if (id) ids.add(id);
    });
    return Array.from(ids)
      .map((id) => ({ id, name: subjectNameById[id] || 'Subject' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, safeSubjects, subjectNameById]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((row) => {
      const childId = String(row?.child_id || '');
      if (selectedChildFilter !== ALL_CHILDREN && childId !== String(selectedChildFilter)) {
        return false;
      }
      const subjectId = String(row?.related_subject || '');
      if (selectedSubjectFilter !== ALL_SUBJECTS && subjectId !== String(selectedSubjectFilter)) {
        return false;
      }
      return true;
    });
  }, [assignments, selectedChildFilter, selectedSubjectFilter]);

  const isParentViewer =
    session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true;

  const openAssignment = useCallback((assignment) => {
    if (!assignment) return;

    if (isParentViewer) {
      openAssignmentForParent(assignment);
      return;
    }

    const eventId = firstLinkedEventId(assignment.linked_event_ids);
    if (eventId && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: { eventId, schedulingMode: true },
        })
      );
    }
  }, [isParentViewer]);

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
      ) : filteredAssignments.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>No assignments yet</Text>
          <Text style={styles.emptyText}>
            Assignments you create will appear here as a simple list.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredAssignments.map((assignment) => {
            const childId = String(assignment.child_id || '');
            const childName = childNameById[childId] || 'Student';
            const subjectName =
              subjectNameById[String(assignment.related_subject || '')] || null;
            const dueLine = formatDueShort(assignment.due_date);
            const statusLabel = getWorkStatusLabel(assignment);
            const metaParts = [childName];
            if (subjectName) metaParts.push(subjectName);
            if (dueLine) metaParts.push(dueLine);
            metaParts.push(statusLabel);

            return (
              <TouchableOpacity
                key={assignment.id}
                style={styles.row}
                onPress={() => openAssignment(assignment)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Open assignment ${assignment.title || ''}`}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <View style={styles.rowMain}>
                  <View style={styles.rowTitleRow}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {assignment.title || 'Assignment'}
                    </Text>
                    {assignment.need_help ? (
                      <View style={styles.helpBadge}>
                        <Text style={styles.helpBadgeText}>Help</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.rowMetaRow}>
                    <ChildAvatarCluster
                      childIds={[childId]}
                      familyChildren={safeChildren}
                      size={22}
                      overlap={0}
                    />
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {metaParts.join(' · ')}
                    </Text>
                  </View>
                </View>
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
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helpBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  helpBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
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
