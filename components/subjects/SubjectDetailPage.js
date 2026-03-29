import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import {
  ArrowLeft,
  Edit2,
  Calendar,
  Clock,
  FileText,
  ExternalLink,
  Plus,
  CheckCircle,
  XCircle,
  Download,
  X,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectDetail, parseChildIds } from '../../lib/services/subjectsClient';
import { deriveRoleFromTags, DOCUMENT_ROLES } from '../../lib/docs/roles';
import { useSession } from '../../contexts/SessionContext';
import MaterialDocViewerModal, {
  resolveMaterialDocViewerUrl,
  getMaterialFileTypeLabel,
} from '../materials/MaterialDocViewerModal';
import { useToast } from '../Toast';
import { comingSoonModalStyles } from '../../theme/comingSoonModalTheme';
import SubjectProgressPlanSection from './SubjectProgressPlanSection';
import SubjectPastEventsAttendanceModal from './SubjectPastEventsAttendanceModal';
import RespondToHelpRequestModal from '../parent/RespondToHelpRequestModal';
import AssignmentDetailModal from '../assignments/AssignmentDetailModal';
import { extractStudentHelpReason, formatDueShort } from '../tutor/tutorHelpUtils';

const ATTENDANCE_LIST_LIMIT = 5;

function firstLinkedEventId(raw) {
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length > 0) return String(p[0]);
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

export default function SubjectDetailPage({
  subjectId,
  familyId,
  children = [],
  onBack,
  onEditSubject,
  onNavigateToPlanner,
  onNavigateToLibrary,
  onNavigateToPlannerAttendance,
  preloadedSubjectData = null,
  onSubjectDataUpdate = null,
  initialScrollToSectionId = null,
}) {
  const session = useSession();
  const toast = useToast();
  const [loading, setLoading] = useState(!preloadedSubjectData);
  const [error, setError] = useState(null);
  const [subjectData, setSubjectData] = useState(preloadedSubjectData || null);
  const [showAttendanceExpanded, setShowAttendanceExpanded] = useState(false);
  const [showExportComingSoonModal, setShowExportComingSoonModal] = useState(false);
  const [showPastEventsAttendanceModal, setShowPastEventsAttendanceModal] = useState(false);
  const [helpModalAssignment, setHelpModalAssignment] = useState(null);
  const [assignedDetailAssignment, setAssignedDetailAssignment] = useState(null);
  const [showMaterialDocViewer, setShowMaterialDocViewer] = useState(false);
  const [materialDocViewerUrl, setMaterialDocViewerUrl] = useState('');
  const [materialDocViewerTitle, setMaterialDocViewerTitle] = useState('');
  const [materialDocViewerKind, setMaterialDocViewerKind] = useState('pdf');
  const loadingRef = useRef(false);

  useEffect(() => {
    if (preloadedSubjectData) {
      setSubjectData(preloadedSubjectData);
      setLoading(false);
      setError(null);
    }
  }, [preloadedSubjectData]);

  useEffect(() => {
    if (!subjectId || !familyId) {
      setLoading(false);
      setError('Subject ID and Family ID are required');
      return;
    }
    if (preloadedSubjectData) return;
    loadSubjectDetail();
  }, [subjectId, familyId]);

  const loadSubjectDetail = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!subjectId || !familyId || loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      // Pass session for role-based filtering
      const data = await getSubjectDetail(subjectId, familyId, null, session);
      if (data == null) {
        if (typeof onBack === 'function') onBack();
        return;
      }
      setSubjectData(data);
      if (onSubjectDataUpdate) {
        onSubjectDataUpdate(data);
      }
    } catch (err) {
      console.error('[SubjectDetailPage] Error loading subject detail:', err);
      setError(err.message || 'Failed to load subject details');
    } finally {
      if (!silent) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  }, [subjectId, familyId, onSubjectDataUpdate, onBack, session]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRefresh = () => loadSubjectDetail({ silent: true });
    const handleSubjectDetailRefresh = (e) => {
      if (e.detail?.subjectId === subjectId) loadSubjectDetail({ silent: true });
    };
    window.addEventListener('refreshSubjects', handleRefresh);
    window.addEventListener('refreshPlanDefaults', handleRefresh);
    window.addEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
    window.addEventListener('childAssignmentsNeedRefresh', handleRefresh);
    return () => {
      window.removeEventListener('refreshSubjects', handleRefresh);
      window.removeEventListener('refreshPlanDefaults', handleRefresh);
      window.removeEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
      window.removeEventListener('childAssignmentsNeedRefresh', handleRefresh);
    };
  }, [subjectId, loadSubjectDetail]);

  const getChildName = useCallback((childId) => {
    const child = children.find(c => c.id === childId);
    return child?.first_name || child?.name || 'Unknown';
  }, [children]);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  // Helper to safely format percentage values
  const formatPercent = useCallback((value) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '—';
    }
    return `${value}%`;
  }, []);

  const scrollToSection = useCallback((sectionId) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, []);

  useEffect(() => {
    if (!initialScrollToSectionId) return;
    const t = setTimeout(() => scrollToSection(initialScrollToSectionId), 300);
    return () => clearTimeout(t);
  }, [initialScrollToSectionId, scrollToSection]);

  const handleMaterialChipPress = useCallback(
    async (material) => {
      if (!material?.id) return;
      const fallbackTitle = material.title || material.provider_name || 'Material';
      try {
        const { url, title, error, viewerKind } = await resolveMaterialDocViewerUrl(material.id);
        if (error || !url) {
          const isInfo =
            error &&
            /cannot be viewed|does not have a viewable|isn’t available|isn't available|Preview isn’t/i.test(error);
          toast.push(error || 'Could not open this material.', isInfo ? 'info' : 'error');
          return;
        }
        setMaterialDocViewerTitle(title || fallbackTitle);
        setMaterialDocViewerUrl(url);
        setMaterialDocViewerKind(viewerKind || 'pdf');
        setShowMaterialDocViewer(true);
      } catch (err) {
        console.error('[SubjectDetailPage] material viewer:', err);
        toast.push('Failed to load material. Please try again.', 'error');
      }
    },
    [toast]
  );

  const closeMaterialDocViewer = useCallback(() => {
    setShowMaterialDocViewer(false);
    setMaterialDocViewerUrl('');
    setMaterialDocViewerTitle('');
    setMaterialDocViewerKind('pdf');
  }, []);

  // Extract data
  const subject = subjectData?.subject;
  const materials = subjectData?.materials || [];
  const syllabusMaterials = useMemo(
    () => materials.filter((m) => deriveRoleFromTags(m?.tags) === DOCUMENT_ROLES.SYLLABUS),
    [materials]
  );
  const lessonPlanMaterials = useMemo(
    () => materials.filter((m) => deriveRoleFromTags(m?.tags) === DOCUMENT_ROLES.LESSON_PLAN),
    [materials]
  );
  const upcomingItems = subjectData?.upcomingItems || [];
  const overdueItems = subjectData?.overdueItems || [];
  const nextItem = subjectData?.nextItem;
  const attendanceRecords = subjectData?.attendanceRecords || [];
  const grades = subjectData?.grades || [];
  const eventOutcomes = subjectData?.eventOutcomes || [];

  // Metrics (with proper null/undefined handling)
  const progressPercent = subjectData?.progressPercent ?? null;
  const attendanceRate30 = subjectData?.attendanceRate30 ?? null;
  const avgGradePercent = subjectData?.avgGradePercent ?? null;

  // Get assigned children (IDs)
  const assignedChildren = useMemo(() => {
    if (!subject) return [];
    if (subject.child_id) {
      return parseChildIds(subject.child_id);
    }
    return [...new Set((subjectData?.events || []).map(e => e.child_id).filter(Boolean))];
  }, [subject, subjectData?.events]);

  const childrenNames = assignedChildren.map(getChildName).filter(Boolean);

  const openAddMaterialModalForRole = useCallback(
    (role) => {
      if (!subject?.id || Platform.OS !== 'web' || typeof window === 'undefined') return;
      window.dispatchEvent(
        new CustomEvent('openAddMaterialModal', {
          detail: {
            subjectId: subject.id,
            subjectName: subject.name || null,
            childIds: assignedChildren,
            role,
          },
        })
      );
    },
    [subject?.id, subject?.name, assignedChildren]
  );

  const handleAddLesson = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskModal', {
        detail: {
          date: new Date(),
          subjectId,
          eventType: 'lesson',
          childIds: assignedChildren.length > 0 ? assignedChildren : undefined,
        }
      }));
    }
  }, [subjectId, assignedChildren]);

  const handleAddAssignment = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskModal', {
        detail: {
          date: new Date(),
          subjectId,
          eventType: 'assignment',
          childIds: assignedChildren.length > 0 ? assignedChildren : undefined,
        }
      }));
    }
  }, [subjectId, assignedChildren]);

  // Process attendance for last 30 days
  const attendance30Days = useMemo(() => {
    const present = attendanceRecords.filter(ar => ar.status === 'present').length;
    const absent = attendanceRecords.filter(ar => ar.status === 'absent').length;
    return { present, absent, total: attendanceRecords.length };
  }, [attendanceRecords]);

  // Process graded items
  const gradedItems = useMemo(() => {
    const items = [
      ...grades.map(g => {
        let percent = null;
        if (g.score !== null && g.score !== undefined && g.possible !== null && g.possible !== undefined && g.possible > 0) {
          percent = Math.round((g.score / g.possible) * 100);
        } else if (g.score !== null && g.score !== undefined) {
          const score = typeof g.score === 'number' ? g.score : parseFloat(g.score);
          if (!isNaN(score) && score >= 0 && score <= 100) {
            percent = score;
          }
        }
        return {
          id: `grade-${g.id}`,
          name: `Grade ${g.id.slice(0, 8)}`,
          date: g.created_at,
          score: g.score,
          possible: g.possible,
          grade: g.grade,
          percent,
        };
      }),
      ...eventOutcomes.filter(eo => eo.grade).map(eo => {
        const event = (subjectData?.events || []).find(e => e.id === eo.event_id);
        // Convert grade to percentage if possible
        const gradeMap = {
          'A+': 98, 'A': 95, 'A-': 92,
          'B+': 87, 'B': 85, 'B-': 82,
          'C+': 77, 'C': 75, 'C-': 72,
          'D+': 67, 'D': 65, 'D-': 62,
          'F': 50,
        };
        const percent = gradeMap[eo.grade] || null;
        return {
          id: `outcome-${eo.id}`,
          eventId: eo.event_id,
          event: event || null,
          name: event?.title || 'Assessment',
          date: eo.created_at,
          score: null,
          possible: null,
          grade: eo.grade,
          percent,
        };
      }),
      ...(subjectData?.events || []).filter(e => e.grade).map(e => {
        const gradeMap = {
          'A+': 98, 'A': 95, 'A-': 92,
          'B+': 87, 'B': 85, 'B-': 82,
          'C+': 77, 'C': 75, 'C-': 72,
          'D+': 67, 'D': 65, 'D-': 62,
          'F': 50,
        };
        const percent = gradeMap[e.grade] || null;
        return {
          id: `event-${e.id}`,
          eventId: e.id,
          event: e,
          name: e.title,
          date: e.end_ts || e.start_ts,
          score: null,
          possible: null,
          grade: e.grade,
          percent,
        };
      }),
    ];
    return items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  }, [grades, eventOutcomes, subjectData?.events]);

  const assignmentAttentionByEventId = subjectData?.assignmentAttentionByEventId;
  const assignmentsNeedingHelp = subjectData?.assignmentsNeedingHelp || [];
  const assignmentsAssignedToStudent = subjectData?.assignmentsAssignedToStudent || [];
  const isParentViewer =
    session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true;

  const openAssignedWorkItem = useCallback((a) => {
    if (!a) return;
    const eid = firstLinkedEventId(a.linked_event_ids);
    if (eid && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: { eventId: eid, initialEvent: null, parentEventFocus: null },
        })
      );
      return;
    }
    setAssignedDetailAssignment(a);
  }, []);

  const hasGradesAttention = useMemo(() => {
    if (!isParentViewer || !assignmentAttentionByEventId) return false;
    return gradedItems.some((item) => {
      if (!item.eventId) return false;
      const a = assignmentAttentionByEventId[item.eventId];
      return a && (a.needHelp || a.needsSubmissionReview);
    });
  }, [isParentViewer, gradedItems, assignmentAttentionByEventId]);

  const handleOpenEventDetails = useCallback((eventId, initialEvent) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openEventModal', {
        detail: { eventId, initialEvent: initialEvent || null },
      }));
    }
  }, []);

  if (loading && !preloadedSubjectData) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading subject details...</Text>
        </View>
      </View>
    );
  }

  if (error || !subjectData || !subject) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error || 'Subject not found'}</Text>
          {onBack && (
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <ArrowLeft size={18} color={colors.accent} />
              <Text style={styles.backButtonText}>Back to Subjects</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {onBack && (
              <TouchableOpacity style={styles.backButton} onPress={onBack}>
                <ArrowLeft size={20} color={colors.text || '#1F2937'} />
              </TouchableOpacity>
            )}
            <View style={styles.headerTitleSection}>
              <Text style={styles.title}>{subject.name}</Text>
              {subject.grade && (
                <Text style={styles.subtext}>Grade: {subject.grade}</Text>
              )}
              {childrenNames.length > 0 && (
                <Text style={styles.subtext}>Students: {childrenNames.join(', ')}</Text>
              )}
            </View>
            <View style={styles.headerActions}>
              {onEditSubject && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => onEditSubject(subject)}
                >
                  <Edit2 size={16} color="#6B7280" />
                  <Text style={styles.actionButtonText}>Edit subject</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onNavigateToPlanner?.({ subjectId: subject.id, view: 'month' })}
              >
                <Calendar size={16} color="#6B7280" />
                <Text style={styles.actionButtonText}>View in Planner</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Top Summary Panel - 4 Tiles */}
        <View style={styles.summaryPanel}>
          {/* Progress Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => {
              if (progressPercent !== null && progressPercent !== undefined && !isNaN(progressPercent)) {
                scrollToSection('progress-section');
              } else {
                handleAddLesson();
              }
            }}
          >
            <Text style={styles.summaryTileLabel}>Progress</Text>
            {progressPercent !== null && progressPercent !== undefined && !isNaN(progressPercent) ? (
              <>
                <Text style={styles.summaryTileValue}>{progressPercent}%</Text>
                <View style={styles.summaryProgressBar}>
                  <View 
                    style={[
                      styles.summaryProgressBarFill,
                      { width: `${Math.max(0, Math.min(100, progressPercent))}%` }
                    ]} 
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.summaryTileValue}>Not started</Text>
                <Text style={styles.summaryTileSubtext}>Add a lesson to begin tracking.</Text>
                <View style={styles.summaryProgressBar}>
                  <View style={styles.summaryProgressBarSkeleton} />
                </View>
                <TouchableOpacity
                  style={styles.summaryTileAction}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleAddLesson();
                  }}
                >
                  <Text style={styles.summaryTileActionText}>Add lesson</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>

          {/* Attendance Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => {
              if (attendanceRate30 !== null && attendanceRate30 !== undefined && !isNaN(attendanceRate30)) {
                scrollToSection('attendance-section');
              } else {
                scrollToSection('attendance-section');
              }
            }}
          >
            <Text style={styles.summaryTileLabel}>Attendance</Text>
            {attendanceRate30 !== null && attendanceRate30 !== undefined && !isNaN(attendanceRate30) ? (
              <>
                <Text style={styles.summaryTileValue}>{attendanceRate30}% present</Text>
                <Text style={styles.summaryTileCaption}>last 30 days</Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryTileValue}>None attended</Text>
                <Text style={styles.summaryTileEmptyAttendanceDetail}>
                  No events related to {subject?.name || 'this subject'} have been marked as attended.
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Grades Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => scrollToSection('grades-section')}
          >
            <Text style={styles.summaryTileLabel}>Grades</Text>
            <Text style={styles.summaryTileValue}>Coming soon</Text>
            {isParentViewer && assignmentsAssignedToStudent.length > 0 ? (
              <Text style={styles.summaryTileSubtext} numberOfLines={2}>
                {assignmentsAssignedToStudent.length} assignment
                {assignmentsAssignedToStudent.length !== 1 ? 's' : ''} assigned to student
                {assignmentsAssignedToStudent.length !== 1 ? 's' : ''} — see Grades below.
              </Text>
            ) : null}
          </TouchableOpacity>

          {/* Learning Goals Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => scrollToSection('learning-goals-section')}
            activeOpacity={0.8}
          >
            <Text style={styles.summaryTileLabel}>Learning Goals</Text>
            <Text style={styles.summaryTileValue}>Coming soon</Text>
          </TouchableOpacity>
        </View>

        {isParentViewer && assignmentsNeedingHelp.length > 0 ? (
          <View id="needs-help-section" style={styles.needsHelpSection}>
            <View style={styles.needsHelpHeader}>
              <HelpCircle size={22} color="#b45309" strokeWidth={2} />
              <View style={styles.needsHelpHeaderText}>
                <Text style={styles.needsHelpTitle}>Needs help</Text>
                <Text style={styles.needsHelpSubtitle}>
                  Your student asked for help on the following. Open one to reply or mark resolved.
                </Text>
              </View>
            </View>
            <View style={styles.needsHelpList}>
              {assignmentsNeedingHelp.map((a) => {
                const reason = extractStudentHelpReason(a);
                const dueLine = formatDueShort(a.due_date);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.needsHelpRow}
                    onPress={() => setHelpModalAssignment(a)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Respond to help: ${a.title || 'assignment'}`}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.needsHelpRowBody}>
                      <Text style={styles.needsHelpRowTitle} numberOfLines={2}>
                        {a.title || 'Schoolwork'}
                      </Text>
                      <Text style={styles.needsHelpRowMeta}>
                        {getChildName(a.child_id)}
                        {dueLine ? ` · ${dueLine}` : ''}
                      </Text>
                      <Text style={styles.needsHelpRowReason} numberOfLines={2}>
                        “{reason}”
                      </Text>
                    </View>
                    <ChevronRight size={20} color="#94a3b8" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Materials Snapshot */}
        <View style={styles.section}>
          <View style={[styles.attendanceSectionHeader, styles.materialsSectionHeader]}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Materials Snapshot</Text>
            {onNavigateToLibrary && (
              <TouchableOpacity
                style={styles.exportIconButton}
                onPress={() => onNavigateToLibrary(subjectId)}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <ExternalLink size={18} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.materialsSubsections}>
            <View style={styles.materialsSubsection}>
              <Text style={styles.materialsSubsectionLabel}>Syllabus</Text>
              {syllabusMaterials.length > 0 ? (
                <View style={styles.materialsGrid}>
                  {syllabusMaterials.map((material) => {
                    const baseName = material.title || material.provider_name || 'Material';
                    const typeLabel = getMaterialFileTypeLabel(material);
                    const chipLabel = typeLabel ? `${baseName} (${typeLabel})` : baseName;
                    return (
                      <TouchableOpacity
                        key={material.id}
                        style={styles.materialChip}
                        onPress={() => handleMaterialChipPress(material)}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.materialChipText} numberOfLines={1}>
                          {chipLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.materialsAddCta}
                  onPress={() => openAddMaterialModalForRole(DOCUMENT_ROLES.SYLLABUS)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add syllabus"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color={colors.accent || '#4F46E5'} />
                  <Text style={styles.materialsAddCtaText}>Add Syllabus</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.materialsSubsection}>
              <Text style={styles.materialsSubsectionLabel}>Lesson plan</Text>
              {lessonPlanMaterials.length > 0 ? (
                <View style={styles.materialsGrid}>
                  {lessonPlanMaterials.map((material) => {
                    const baseName = material.title || material.provider_name || 'Material';
                    const typeLabel = getMaterialFileTypeLabel(material);
                    const chipLabel = typeLabel ? `${baseName} (${typeLabel})` : baseName;
                    return (
                      <TouchableOpacity
                        key={material.id}
                        style={styles.materialChip}
                        onPress={() => handleMaterialChipPress(material)}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.materialChipText} numberOfLines={1}>
                          {chipLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.materialsAddCta}
                  onPress={() => openAddMaterialModalForRole(DOCUMENT_ROLES.LESSON_PLAN)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add lesson plan"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color={colors.accent || '#4F46E5'} />
                  <Text style={styles.materialsAddCtaText}>Add Lesson Plan</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Section 1: Progress — plan summary, curriculum */}
        <View id="progress-section" style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Progress</Text>
            {onNavigateToPlanner && (
              <TouchableOpacity
                style={styles.exportIconButton}
                onPress={() => onNavigateToPlanner({ subjectId: subject.id, view: 'month' })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View full schedule in Planner month view"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <ExternalLink size={18} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
          {Platform.OS === 'web' ? (
            <SubjectProgressPlanSection
              familyId={familyId}
              subjectId={subject.id}
              subjectName={subject.name}
              children={children}
              assignedChildIds={assignedChildren}
              isParentViewer={isParentViewer}
              onRefresh={() => loadSubjectDetail({ silent: true })}
            />
          ) : (
            <Text style={styles.emptyStateText}>Open this subject on the web to manage your class plan and scheduled dates.</Text>
          )}
        </View>

        {/* Section 2: Attendance */}
        <View id="attendance-section" style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Attendance</Text>
            <View style={styles.attendanceHeaderActions}>
              {onNavigateToPlannerAttendance && (
                <TouchableOpacity
                  style={styles.exportIconButton}
                  onPress={onNavigateToPlannerAttendance}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View full attendance"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <ExternalLink size={18} color="#6B7280" />
                </TouchableOpacity>
              )}
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={styles.exportIconButton}
                  onPress={() => typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openExportPlannerModal', { detail: { subjectId, subjectName: subject?.name || '' } }))}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Export attendance"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Download size={18} color="#6B7280" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {attendanceRecords.length > 0 ? (
            <View style={styles.emptyStateBox}>
              <View style={styles.attendanceChips}>
                <View style={styles.attendanceChip}>
                  <CheckCircle size={14} color="#10B981" />
                  <Text style={styles.attendanceChipText}>
                    {attendance30Days.present} Present
                  </Text>
                </View>
                <View style={styles.attendanceChip}>
                  <XCircle size={14} color="#EF4444" />
                  <Text style={styles.attendanceChipText}>
                    {attendance30Days.absent} Absent
                  </Text>
                </View>
              </View>
              <View style={styles.attendanceList}>
                {(showAttendanceExpanded ? attendanceRecords : attendanceRecords.slice(0, ATTENDANCE_LIST_LIMIT)).map((record) => {
                  const event = (subjectData?.events || []).find(e => e.id === record.event_id);
                  return (
                    <TouchableOpacity
                      key={record.id}
                      style={styles.attendanceItem}
                      onPress={() => event && handleOpenEventDetails(event.id, event)}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' && { cursor: event ? 'pointer' : 'default' })}
                    >
                      <Text style={styles.attendanceItemDate}>{formatDate(record.day_date)}</Text>
                      <Text style={styles.attendanceItemTitle}>
                        {event?.title || 'Lesson'}
                      </Text>
                      <Text style={styles.attendanceItemStatus}>{record.status}</Text>
                      <Text style={styles.attendanceItemMinutes}>{record.minutes} min</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {attendanceRecords.length > ATTENDANCE_LIST_LIMIT && (
                <TouchableOpacity
                  style={styles.attendanceShowMoreBtn}
                  onPress={() => setShowAttendanceExpanded((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.attendanceShowMoreText}>
                    {showAttendanceExpanded
                      ? 'Show less'
                      : `Show more (${attendanceRecords.length - ATTENDANCE_LIST_LIMIT} more)`}
                  </Text>
                </TouchableOpacity>
              )}
              {Platform.OS === 'web' && isParentViewer && (subjectData?.events || []).length > 0 && (
                <TouchableOpacity
                  style={[styles.emptyStateButton, styles.attendancePastLessonsButton]}
                  onPress={() => setShowPastEventsAttendanceModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View past lessons and bulk update attendance"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Calendar size={18} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Past lessons & bulk actions</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Attendance appears after you complete lessons or log time.
              </Text>
              {Platform.OS === 'web' && isParentViewer && (subjectData?.events || []).length > 0 && (
                <TouchableOpacity
                  style={styles.emptyStateButton}
                  onPress={() => setShowPastEventsAttendanceModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View past lessons and bulk update attendance"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Calendar size={18} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Past lessons & bulk actions</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Section 3: Grades */}
        <View id="grades-section" style={styles.section}>
          <View style={[styles.attendanceSectionHeader, styles.attendanceSectionHeaderMultiLine]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Grades</Text>
              {hasGradesAttention && isParentViewer ? (
                <Text style={styles.attentionHintText} accessibilityRole="text">
                  * Open the listed event for a help request or submission review.
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.exportIconButton}
              onPress={() => setShowExportComingSoonModal(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Export grades"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Download size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          {isParentViewer && assignmentsAssignedToStudent.length > 0 ? (
            <View style={styles.assignedToStudentBlock}>
              <Text style={styles.assignedToStudentHeading}>Assigned to student</Text>
              <Text style={styles.assignedToStudentHint}>
                Work you’ve assigned that hasn’t been submitted yet. Open the planner event or assignment details.
              </Text>
              <View style={styles.assignedToStudentList}>
                {assignmentsAssignedToStudent.map((a) => {
                  const dueLine = formatDueShort(a.due_date);
                  const statusLabel = a.status === 'in_progress' ? 'In progress' : 'Not started';
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={styles.assignedToStudentRow}
                      onPress={() => openAssignedWorkItem(a)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Open assignment ${a.title || ''}`}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={styles.assignedToStudentRowBody}>
                        <Text style={styles.assignedToStudentRowTitle} numberOfLines={2}>
                          {a.title || 'Assignment'}
                        </Text>
                        <Text style={styles.assignedToStudentRowMeta}>
                          {getChildName(a.child_id)}
                          {dueLine ? ` · ${dueLine}` : ''} · {statusLabel}
                        </Text>
                      </View>
                      <ChevronRight size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {gradedItems.length > 0 && (
            <View style={styles.gradeAverage}>
              <Text style={styles.gradeAverageLabel}>Current Average</Text>
              <Text style={styles.gradeAverageComingSoon}>Logic for calculating grade averages is still being built, check back soon...</Text>
            </View>
          )}
          {gradedItems.length > 0 ? (
            <>
              <View style={styles.gradesList}>
                {gradedItems.map((item) => {
                  const Wrapper = item.eventId ? TouchableOpacity : View;
                  const wrapperProps = item.eventId
                    ? {
                        onPress: () => handleOpenEventDetails(item.eventId, item.event),
                        activeOpacity: 0.7,
                        ...(Platform.OS === 'web' && { cursor: 'pointer' }),
                      }
                    : {};
                  const gAtt =
                    item.eventId && assignmentAttentionByEventId
                      ? assignmentAttentionByEventId[item.eventId]
                      : null;
                  const needsGradeMark =
                    isParentViewer &&
                    gAtt &&
                    (gAtt.needHelp || gAtt.needsSubmissionReview);
                  return (
                    <Wrapper key={item.id} style={styles.gradeItem} {...wrapperProps}>
                      <View style={styles.gradeItemContent}>
                        <Text style={styles.gradeItemName}>
                          {needsGradeMark ? '* ' : ''}
                          {item.name}
                        </Text>
                        <Text style={styles.gradeItemDate}>{formatDate(item.date)}</Text>
                      </View>
                      <View style={styles.gradeItemScore}>
                        {item.score !== null && item.possible !== null && item.possible > 0 ? (
                          <>
                            <Text style={styles.gradeItemScoreText}>
                              {item.score}/{item.possible}
                            </Text>
                            {item.percent !== null && (
                              <Text style={styles.gradeItemPercent}>
                                {item.percent}%
                              </Text>
                            )}
                          </>
                        ) : item.score !== null ? (
                          <>
                            <Text style={styles.gradeItemScoreText}>
                              {item.score}
                            </Text>
                            {item.percent !== null && (
                              <Text style={styles.gradeItemPercent}>
                                {item.percent}%
                              </Text>
                            )}
                          </>
                        ) : item.grade ? (
                          <Text style={styles.gradeItemGrade}>{item.grade}</Text>
                        ) : null}
                      </View>
                    </Wrapper>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Grades appear once you add assignments or assessments.
              </Text>
              <TouchableOpacity style={styles.emptyStateButton} onPress={handleAddAssignment}>
                <Plus size={18} color="#6B7280" />
                <Text style={styles.emptyStateButtonText}>Add Assignment</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Section: Learning Goals */}
        <View id="learning-goals-section" style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Learning Goals</Text>
            <TouchableOpacity
              style={styles.exportIconButton}
              onPress={() => setShowExportComingSoonModal(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Export learning goals"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Download size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.emptyStateBox}>
            <Text style={styles.emptyStateText}>
              Learning Goals logic is still being built to provide you with typical state learning requirements. Check back soon...
            </Text>
          </View>
        </View>
      </ScrollView>
      <SubjectPastEventsAttendanceModal
        visible={showPastEventsAttendanceModal}
        onClose={() => setShowPastEventsAttendanceModal(false)}
        familyId={familyId}
        subjectId={subject.id}
        events={subjectData?.events || []}
        getChildName={getChildName}
        onOpenEvent={handleOpenEventDetails}
        onCompleted={() => loadSubjectDetail({ silent: true })}
      />
      <Modal
        visible={showExportComingSoonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportComingSoonModal(false)}
      >
        <View style={comingSoonModalStyles.overlay}>
          <View style={comingSoonModalStyles.content}>
            <TouchableOpacity
              style={comingSoonModalStyles.close}
              onPress={() => setShowExportComingSoonModal(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={comingSoonModalStyles.title}>Coming soon</Text>
            <Text style={comingSoonModalStyles.body}>
              This feature is in development. Stay tuned for updates!
            </Text>
            <TouchableOpacity
              style={comingSoonModalStyles.button}
              onPress={() => setShowExportComingSoonModal(false)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={comingSoonModalStyles.buttonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <MaterialDocViewerModal
        visible={showMaterialDocViewer && !!materialDocViewerUrl}
        onClose={closeMaterialDocViewer}
        url={materialDocViewerUrl}
        title={materialDocViewerTitle}
        viewerKind={materialDocViewerKind}
      />
      <RespondToHelpRequestModal
        visible={!!helpModalAssignment}
        assignment={helpModalAssignment}
        onClose={() => setHelpModalAssignment(null)}
        onResponded={() => {
          setHelpModalAssignment(null);
          loadSubjectDetail({ silent: true });
        }}
      />
      <AssignmentDetailModal
        visible={!!assignedDetailAssignment}
        assignment={assignedDetailAssignment}
        childId={assignedDetailAssignment?.child_id}
        familyId={familyId}
        onClose={() => setAssignedDetailAssignment(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      marginHorizontal: 'auto',
      width: '100%',
    }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.muted || '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    fontSize: 16,
    color: colors.redBold || '#EF4444',
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  header: {
    marginBottom: 32,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  backButtonText: {
    fontSize: 14,
    color: colors.accent || '#4F46E5',
    fontWeight: '500',
    marginLeft: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerTitleSection: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerActions: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginLeft: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryPanel: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  needsHelpSection: {
    marginBottom: 28,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(255, 251, 235, 0.95)',
  },
  needsHelpHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  needsHelpHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  needsHelpTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpSubtitle: {
    fontSize: 14,
    color: '#a16207',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpList: {
    gap: 0,
  },
  needsHelpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(234, 179, 8, 0.25)',
  },
  needsHelpRowBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  needsHelpRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpRowMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpRowReason: {
    fontSize: 13,
    color: '#854d0e',
    marginTop: 6,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignedToStudentBlock: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.25)',
  },
  assignedToStudentHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignedToStudentHint: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignedToStudentList: {},
  assignedToStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#f8fafc',
  },
  assignedToStudentRowBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  assignedToStudentRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignedToStudentRowMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  summaryTileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTileValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTileCaption: {
    fontSize: 11,
    color: '#9CA3AF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTileEmptyAttendanceDetail: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 15,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryProgressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  summaryProgressBarFill: {
    height: '100%',
    backgroundColor: Platform.OS === 'web' ? 'transparent' : (colors.accent || '#4F46E5'), // Fallback for native
    borderRadius: 2,
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(90deg, #f4b4f8 0%, #c4b5fd 20%, #93c5fd 40%, #a5f3fc 60%, #bbf7d0 80%, #facc15 100%)',
    }),
  },
  summaryProgressBarSkeleton: {
    height: '100%',
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
  },
  summaryTileSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTileAction: {
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  summaryTileActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      textDecorationLine: 'underline',
    }),
  },
  section: {
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  materialsSectionHeader: {
    marginBottom: 2,
  },
  materialsSubsections: {
    marginTop: 8,
    gap: 20,
  },
  materialsSubsection: {
    gap: 8,
  },
  materialsSubsectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsAddCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.35)',
    borderStyle: 'dashed',
    backgroundColor: '#FAFBFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  materialsAddCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  attendanceSectionHeaderMultiLine: {
    alignItems: 'flex-start',
  },
  attendanceHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  /** Past lessons CTA when attendance list is non-empty: spacing below list / show more */
  attendancePastLessonsButton: {
    marginTop: 8,
  },
  exportIconButton: {
    padding: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attentionHintText: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 6,
    lineHeight: 16,
    maxWidth: '100%',
  },
  progressCheckInModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  progressCheckInModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    maxWidth: 400,
    width: '100%',
  },
  progressCheckInModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  progressCheckInModalBody: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  progressCheckInModalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  progressCheckInModalCloseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  nextItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  nextItemContent: {
    flex: 1,
  },
  nextItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  nextItemDate: {
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  overdueText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.redBold || '#EF4444',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timelineList: {
    gap: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  timelineItemOverdue: {
    borderColor: colors.redBold || '#EF4444',
    borderWidth: 2,
  },
  timelineItemContent: {
    flex: 1,
  },
  timelineItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timelineItemTitleOverdue: {
    color: colors.redBold || '#EF4444',
  },
  timelineItemDate: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  emptyStateButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  emptyStateBanner: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.muted || '#6B7280',
    lineHeight: 20,
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  attendanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  attendanceChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceList: {
    gap: 8,
  },
  attendanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  attendanceItemDate: {
    fontSize: 12,
    color: '#6B7280',
    width: 80,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceItemStatus: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'capitalize',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceShowMoreBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.bgSubtle || '#F3F4F6',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceShowMoreText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceItemMinutes: {
    fontSize: 12,
    color: '#6B7280',
    width: 50,
    textAlign: 'right',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeAverage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
  },
  gradeAverageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeAverageValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeAverageComingSoon: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradesList: {
    gap: 8,
  },
  gradeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  gradeItemContent: {
    flex: 1,
  },
  gradeItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeItemDate: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeItemScore: {
    alignItems: 'flex-end',
  },
  gradeItemScoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeItemPercent: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeItemGrade: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  viewAllButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  materialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    maxWidth: 200,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  materialChipText: {
    fontSize: 13,
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  benefitsList: {
    marginBottom: 20,
  },
  benefitText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});