import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { ChevronRight } from 'lucide-react';
import { getWorkStatusLabel, parseWorkSpec } from '../../lib/workEventHelpers';
import { isPlannerLearningDayEvent } from '../../lib/planner/plannerLearningDayChip';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import {
  CLASSWORK_FG,
  CLASSWORK_MUTED,
} from '../../lib/classworkPanelTheme';

const LEAGUE_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const COOPER_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

function parseLinkedEventIds(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (_) {
      /* ignore */
    }
  }
  return [];
}

function buildEventById(events = []) {
  const map = new Map();
  (events || []).forEach((event) => {
    if (event?.id != null) map.set(String(event.id), event);
  });
  return map;
}

function resolvePrimaryAssignmentEvent(assignment, eventById) {
  for (const eventId of parseLinkedEventIds(assignment?.linked_event_ids)) {
    const event = eventById.get(String(eventId));
    if (!event || isPlannerLearningDayEvent(event)) continue;
    return event;
  }
  return null;
}

function resolveAssignmentMaxPoints(assignment, eventById) {
  const event = resolvePrimaryAssignmentEvent(assignment, eventById);
  if (!event) return 100;
  const spec = parseWorkSpec(event.work_spec, event.event_type);
  if (spec?.points_possible != null && Number.isFinite(Number(spec.points_possible))) {
    return Math.max(1, Math.round(Number(spec.points_possible)));
  }
  if (event.percent_of_total_grade != null && Number.isFinite(Number(event.percent_of_total_grade))) {
    return Math.max(1, Math.round(Number(event.percent_of_total_grade)));
  }
  const configuredGrade = String(event.grade || '').trim();
  if (/^\d+$/.test(configuredGrade)) {
    return Math.max(1, Number(configuredGrade));
  }
  return 100;
}

function assignmentHasReviewGrade(assignment) {
  if (!assignment?.reviewed_at) return false;
  if (assignment?.grade_display) return true;
  return assignment?.grade_value != null && Number.isFinite(Number(assignment.grade_value));
}

function assignmentIsGradable(assignment, eventById) {
  const event = resolvePrimaryAssignmentEvent(assignment, eventById);
  if (!event) return true;
  const spec = parseWorkSpec(event.work_spec, event.event_type);
  return spec?.graded !== false;
}

function resolveAssignmentGradeRow(assignment, eventById) {
  const maxPoints = resolveAssignmentMaxPoints(assignment, eventById);
  if (assignmentHasReviewGrade(assignment)) {
    if (assignment.grade_display) {
      return {
        grade: String(assignment.grade_display).trim(),
        isGraded: true,
      };
    }
    const score = Math.round(Number(assignment.grade_value));
    return {
      grade: `${score}/${maxPoints}`,
      isGraded: true,
    };
  }
  if (!assignmentIsGradable(assignment, eventById)) return null;
  return {
    grade: `__/${maxPoints}`,
    isGraded: false,
    pendingLabel: 'Not graded',
  };
}

function isMissingWork(assignment, eventById) {
  const label = String(getWorkStatusLabel(assignment) || '').toLowerCase();
  if (label.includes('missing') || label.includes('overdue') || label.includes('past due')) {
    return true;
  }
  if (assignment?.submitted_at || assignmentHasReviewGrade(assignment)) return false;
  if (!assignment?.due_date) return false;
  const due = new Date(assignment.due_date);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function GradesPanelHeader() {
  return (
    <View style={styles.panelToolbar}>
      <Text style={styles.panelTitle}>Grades</Text>
    </View>
  );
}

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={styles.sectionHeaderRule} />
    </View>
  );
}

function StudentAvatar({ child }) {
  const source = sourceForChild(child);
  const ringColor = getChildColorFromAvatar(child?.avatar_key || child?.avatar_url || child?.avatar);
  return (
    <View style={[styles.avatarRing, { borderColor: ringColor || '#E2E8F0' }]}>
      <Image source={source} style={styles.avatarImage} />
    </View>
  );
}

export default function SubjectGradesPanel({
  assignments = [],
  events = [],
  gradedItems = [],
  children = [],
  onOpenAssignment,
  onOpenGradedItem,
}) {
  const eventById = useMemo(() => buildEventById(events), [events]);

  const childById = useMemo(() => {
    const map = new Map();
    (children || []).forEach((child) => {
      if (child?.id != null) map.set(String(child.id), child);
    });
    return map;
  }, [children]);

  const studentSections = useMemo(() => {
    const byChild = new Map();

    const ensureChild = (childId, fallbackName = 'Student') => {
      const key = childId ? String(childId) : 'unknown';
      if (!byChild.has(key)) {
        const child = childById.get(key);
        byChild.set(key, {
          childId: key,
          child,
          name: child?.first_name || child?.name || fallbackName,
          assignments: [],
          assessments: [],
          sum: 0,
          count: 0,
        });
      }
      return byChild.get(key);
    };

    (children || []).forEach((child) => {
      if (child?.id) ensureChild(String(child.id));
    });

    (assignments || []).forEach((a) => {
      const row = ensureChild(a.child_id ? String(a.child_id) : 'unknown');
      row.assignments.push(a);
      if (assignmentHasReviewGrade(a)) {
        row.sum += Number(a.grade_value);
        row.count += 1;
      }
    });

    (gradedItems || []).forEach((item) => {
      const childId = item.event?.child_id || item.event?.childId;
      if (!childId) return;
      const row = ensureChild(String(childId));
      row.assessments.push(item);
    });

    return [...byChild.values()]
      .map((row) => {
        const missingWork = row.assignments
          .filter((a) => isMissingWork(a, eventById))
          .map((a) => ({
            id: a.id,
            title: a.title || 'Assignment',
            onPress: () => onOpenAssignment?.(a),
          }));

        const assignmentEventIds = new Set();
        row.assignments.forEach((assignment) => {
          parseLinkedEventIds(assignment.linked_event_ids).forEach((eventId) => {
            assignmentEventIds.add(String(eventId));
          });
        });

        const recentGrades = [
          ...row.assignments
            .map((a) => {
              const gradeRow = resolveAssignmentGradeRow(a, eventById);
              if (!gradeRow) return null;
              return {
                id: a.id,
                title: a.title || 'Assignment',
                grade: gradeRow.grade,
                isGraded: gradeRow.isGraded,
                pendingLabel: gradeRow.pendingLabel || null,
                onPress: () => onOpenAssignment?.(a),
              };
            })
            .filter(Boolean),
          ...row.assessments
            .filter((item) => {
              if (!item.grade && item.percent == null) return false;
              if (item.eventId && assignmentEventIds.has(String(item.eventId))) return false;
              return true;
            })
            .map((item) => ({
              id: item.id,
              title: item.name || 'Assessment',
              grade: item.grade || `${item.percent}%`,
              isGraded: true,
              pendingLabel: null,
              onPress: () => onOpenGradedItem?.(item),
              disabled: !item.eventId,
            })),
        ].slice(0, 8);

        return {
          ...row,
          overall: row.count > 0 ? Math.round(row.sum / row.count) : null,
          recentGrades,
          missingWork,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, gradedItems, children, childById, eventById, onOpenAssignment, onOpenGradedItem]);

  const panelBody = studentSections.length === 0 ? (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyHeading}>No grades yet</Text>
      <Text style={styles.emptySubtext}>
        Grades appear here when you score submitted work.
      </Text>
    </View>
  ) : (
    <View style={styles.wrap}>
      {studentSections.map((section) => (
        <View key={section.childId} style={styles.studentCard}>
          <View style={styles.studentHeader}>
            {section.child ? <StudentAvatar child={section.child} /> : null}
            <View style={styles.studentHeaderText}>
              <Text style={styles.studentName}>{section.name}</Text>
              <Text style={styles.studentAverage}>
                {section.overall != null ? `${section.overall}% average` : 'No average yet'}
              </Text>
            </View>
          </View>

          <View style={styles.recentSection}>
            {section.missingWork.length > 0 ? (
              <>
                <SectionHeader title="Missing work" />
                <View style={styles.gradeList}>
                  {section.missingWork.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.gradeRow, styles.missingRow]}
                      onPress={item.onPress}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={styles.gradeRowContent}>
                        <Text style={styles.gradeRowTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                      </View>
                      <View style={styles.gradeRowTrailing}>
                        <Text style={styles.missingRowLabel}>Open in classwork</Text>
                        <ChevronRight size={18} color="#94A3B8" strokeWidth={2.25} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <SectionHeader title="Recent grades" />
            {section.recentGrades.length === 0 ? (
              <Text style={styles.recentEmpty}>No grades yet.</Text>
            ) : (
              <View style={styles.gradeList}>
                {section.recentGrades.map((item) => {
                  const Wrapper = item.disabled ? View : TouchableOpacity;
                  return (
                    <Wrapper
                      key={item.id}
                      style={styles.gradeRow}
                      onPress={item.disabled ? undefined : item.onPress}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' && !item.disabled && { cursor: 'pointer' })}
                    >
                      <View style={styles.gradeRowContent}>
                        <Text style={styles.gradeRowTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                      </View>
                      <View style={styles.gradeRowTrailing}>
                        {!item.isGraded && item.pendingLabel ? (
                          <Text style={styles.pendingGradeLabel}>{item.pendingLabel}</Text>
                        ) : null}
                        <Text
                          style={[
                            styles.gradeRowValue,
                            !item.isGraded && styles.gradeRowValuePending,
                          ]}
                        >
                          {item.grade}
                        </Text>
                        {!item.disabled ? (
                          <ChevronRight size={18} color="#94A3B8" strokeWidth={2.25} />
                        ) : null}
                      </View>
                    </Wrapper>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.root, styles.rootExpanded]}>
      <GradesPanelHeader />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {panelBody}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  rootExpanded: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      maxHeight: '100%',
    }),
  },
  panelToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    flexShrink: 0,
    gap: 12,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: -0.2,
    flex: 1,
    minWidth: 0,
    ...LEAGUE_FONT,
  },
  panelScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    }),
  },
  scrollContent: {
    flexGrow: 1,
  },
  wrap: {
    width: '100%',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 16,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 10,
    minHeight: 280,
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: CLASSWORK_FG,
    letterSpacing: -0.2,
    textAlign: 'center',
    ...LEAGUE_FONT,
  },
  emptySubtext: {
    fontSize: 14,
    lineHeight: 21,
    color: CLASSWORK_MUTED,
    maxWidth: 360,
    textAlign: 'center',
    ...COOPER_FONT,
  },
  studentCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 18,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
    }),
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  studentHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    padding: 2,
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  studentName: {
    fontSize: 18,
    fontWeight: '700',
    color: CLASSWORK_FG,
    letterSpacing: -0.2,
    ...LEAGUE_FONT,
  },
  studentAverage: {
    fontSize: 14,
    lineHeight: 20,
    color: CLASSWORK_MUTED,
    ...COOPER_FONT,
  },
  recentSection: {
    gap: 10,
  },
  sectionHeader: {
    gap: 8,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#64748B',
    ...LEAGUE_FONT,
  },
  sectionHeaderRule: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  recentEmpty: {
    fontSize: 14,
    lineHeight: 21,
    color: '#94A3B8',
    ...COOPER_FONT,
  },
  gradeList: {
    gap: 8,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.14)',
  },
  gradeRowContent: {
    flex: 1,
    minWidth: 0,
  },
  gradeRowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    lineHeight: 20,
    ...LEAGUE_FONT,
  },
  gradeRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  gradeRowValue: {
    fontSize: 15,
    fontWeight: '700',
    color: CLASSWORK_FG,
    ...LEAGUE_FONT,
  },
  gradeRowValuePending: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  pendingGradeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.2,
    ...COOPER_FONT,
  },
  missingRow: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  missingRowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
    ...COOPER_FONT,
  },
});
