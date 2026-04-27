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
import { useSession } from '../../contexts/SessionContext';
import MaterialDocViewerModal, {
  resolveMaterialDocViewerUrl,
  getMaterialFileTypeLabel,
} from '../materials/MaterialDocViewerModal';
import { useToast } from '../Toast';
import { comingSoonModalStyles } from '../../theme/comingSoonModalTheme';
import SubjectProgressPlanSection from './SubjectProgressPlanSection';
import SubjectPastEventsAttendanceModal from './SubjectPastEventsAttendanceModal';
import SubjectAssignedToStudentModal from './SubjectAssignedToStudentModal';
import RespondToHelpRequestModal from '../parent/RespondToHelpRequestModal';
import AssignmentDetailModal from '../assignments/AssignmentDetailModal';
import { extractStudentHelpReason, formatDueShort } from '../tutor/tutorHelpUtils';
import { deriveRoleFromTags, roleLabel } from '../../lib/docs/roles';

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
  const [showAssignedToStudentModal, setShowAssignedToStudentModal] = useState(false);
  /** Web-only: which export icon is hovered (portal tooltip, matches planner RightToolbar). */
  const [exportTooltipKey, setExportTooltipKey] = useState(null);
  const [exportTooltipPos, setExportTooltipPos] = useState({ x: 0, y: 0 });
  const [helpModalAssignment, setHelpModalAssignment] = useState(null);
  const [assignedDetailAssignment, setAssignedDetailAssignment] = useState(null);
  const [showMaterialDocViewer, setShowMaterialDocViewer] = useState(false);
  const [materialDocViewerUrl, setMaterialDocViewerUrl] = useState('');
  const [materialDocViewerTitle, setMaterialDocViewerTitle] = useState('');
  const [materialDocViewerKind, setMaterialDocViewerKind] = useState('pdf');
  const loadingRef = useRef(false);
  /** Parent often passes inline callbacks; keep loadSubjectDetail stable so mount effect does not loop. */
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onSubjectDataUpdateRef = useRef(onSubjectDataUpdate);
  onSubjectDataUpdateRef.current = onSubjectDataUpdate;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (preloadedSubjectData) {
      setSubjectData(preloadedSubjectData);
      setLoading(false);
      setError(null);
    }
  }, [preloadedSubjectData]);

  const loadSubjectDetail = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!subjectId || !familyId) return;
    if (!silent && loadingRef.current) return;
    if (!silent) {
      loadingRef.current = true;
      setLoading(true);
    }
    setError(null);
    try {
      // Pass session for role-based filtering
      const data = await getSubjectDetail(subjectId, familyId, null, sessionRef.current);
      if (data == null) {
        if (typeof onBackRef.current === 'function') onBackRef.current();
        return;
      }
      setSubjectData(data);
      if (onSubjectDataUpdateRef.current) {
        onSubjectDataUpdateRef.current(data);
      }
    } catch (err) {
      console.error('[SubjectDetailPage] Error loading subject detail:', err);
      setError(err.message || 'Failed to load subject details');
    } finally {
      if (!silent) {
        setLoading(false);
        loadingRef.current = false;
      }
    }
  }, [subjectId, familyId]);

  useEffect(() => {
    if (!subjectId || !familyId) {
      setLoading(false);
      setError('Subject ID and Family ID are required');
      return;
    }
    loadSubjectDetail({ silent: !!preloadedSubjectData });
    // Intentionally omit preloadedSubjectData: parent updates cache object after each fetch; re-running would loop.
  }, [subjectId, familyId, loadSubjectDetail]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRefresh = () => loadSubjectDetail({ silent: true });
    const handleSubjectDetailRefresh = (e) => {
      if (e.detail?.subjectId === subjectId) loadSubjectDetail({ silent: true });
    };
    const handleMaterialsStale = (e) => {
      const fid = e.detail?.familyId;
      const ids = e.detail?.subjectIds;
      if (fid !== familyId) return;
      if (Array.isArray(ids) && ids.some((id) => String(id) === String(subjectId))) {
        loadSubjectDetail({ silent: true });
      }
    };
    window.addEventListener('refreshSubjects', handleRefresh);
    window.addEventListener('refreshPlanDefaults', handleRefresh);
    window.addEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
    window.addEventListener('childAssignmentsNeedRefresh', handleRefresh);
    window.addEventListener('subjectDetailMaterialsStale', handleMaterialsStale);
    return () => {
      window.removeEventListener('refreshSubjects', handleRefresh);
      window.removeEventListener('refreshPlanDefaults', handleRefresh);
      window.removeEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
      window.removeEventListener('childAssignmentsNeedRefresh', handleRefresh);
      window.removeEventListener('subjectDetailMaterialsStale', handleMaterialsStale);
    };
  }, [subjectId, familyId, loadSubjectDetail]);

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

  const openAddMaterialModal = useCallback(() => {
    if (!subject?.id || Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('openAddMaterialModal', {
        detail: {
          subjectId: subject.id,
          subjectName: subject.name || null,
          childIds: assignedChildren,
          role: null,
        },
      })
    );
  }, [subject?.id, subject?.name, assignedChildren]);

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

  /** Shown in Grades header: API aggregate when present, else average of percents on listed items. */
  const displayGradeAveragePercent = useMemo(() => {
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));
    if (avgGradePercent != null && Number.isFinite(Number(avgGradePercent))) {
      return clamp(avgGradePercent);
    }
    const withPct = gradedItems.filter((i) => i.percent != null && Number.isFinite(i.percent));
    if (withPct.length === 0) return null;
    const sum = withPct.reduce((s, i) => s + i.percent, 0);
    return clamp(sum / withPct.length);
  }, [avgGradePercent, gradedItems]);

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

  const handleOpenAssignedFromModal = useCallback(
    (a) => {
      setShowAssignedToStudentModal(false);
      openAssignedWorkItem(a);
    },
    [openAssignedWorkItem],
  );

  const handleExportHover = useCallback((key, isEnter, event) => {
    if (Platform.OS !== 'web') return;
    if (isEnter) {
      setExportTooltipKey(key);
      const node = event?.currentTarget || event?.target;
      if (node && typeof node.getBoundingClientRect === 'function') {
        const rect = node.getBoundingClientRect();
        setExportTooltipPos({ x: rect.left + rect.width / 2, y: rect.bottom });
      }
    } else {
      setExportTooltipKey(null);
    }
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
                onPress={handleAddAssignment}
                accessibilityRole="button"
                accessibilityLabel="Add assignment"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={16} color="#6B7280" />
                <Text style={styles.actionButtonText}>Add assignment</Text>
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
            {displayGradeAveragePercent != null ? (
              <>
                <Text style={styles.summaryTileValue}>{displayGradeAveragePercent}%</Text>
                <Text style={styles.summaryTileCaption}>current average</Text>
              </>
            ) : gradedItems.length > 0 ? (
              <>
                <Text style={styles.summaryTileValue}>
                  {gradedItems.length} recorded
                </Text>
                <Text style={styles.summaryTileSubtext} numberOfLines={2}>
                  Add numeric scores to see an average percentage.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryTileValue}>No grades yet</Text>
                <Text style={styles.summaryTileSubtext} numberOfLines={2}>
                  Add assignments or assessments for {subject?.name || 'this subject'}.
                </Text>
              </>
            )}
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
          </View>
          <View style={styles.materialsActionsRow}>
            <TouchableOpacity
              style={styles.materialsAddCta}
              onPress={openAddMaterialModal}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add material"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={16} color="#6BB3E8" />
              <Text style={styles.materialsAddCtaText}>Add material</Text>
            </TouchableOpacity>
          </View>
          {materials.length > 0 ? (
            <View style={styles.materialsList}>
              <View style={styles.materialsListHeader}>
                <Text style={styles.materialsListHeaderTitle}>TITLE</Text>
                <Text style={styles.materialsListHeaderDate}>DATE</Text>
              </View>
              {materials.map((material) => {
                const baseName = material.title || material.provider_name || 'Material';
                const typeLabel = getMaterialFileTypeLabel(material);
                const roleTag = roleLabel(deriveRoleFromTags(material?.tags));
                const createdDate = formatDate(material.created_at || material.updated_at);
                return (
                  <TouchableOpacity
                    key={material.id}
                    style={styles.materialListItem}
                    onPress={() => handleMaterialChipPress(material)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.materialListItemLeft}>
                      <FileText size={16} color="#64748b" />
                      <View style={styles.materialListItemTextWrap}>
                        <Text style={styles.materialListItemTitle} numberOfLines={1}>
                          {baseName}
                        </Text>
                        {(roleTag || typeLabel) ? (
                          <View style={styles.materialListItemTagsRow}>
                            {roleTag ? (
                              <View style={styles.materialListItemTag}>
                                <Text style={styles.materialListItemTagText}>{roleTag}</Text>
                              </View>
                            ) : null}
                            {typeLabel ? (
                              <View style={styles.materialListItemTag}>
                                <Text style={styles.materialListItemTagText}>{typeLabel}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.materialListItemDate}>{createdDate || '—'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.materialsEmptyText}>No materials added yet.</Text>
          )}
        </View>

        {/* Section 1: Progress — plan summary, curriculum */}
        <View id="progress-section" style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Progress</Text>
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
            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={styles.exportIconButton}
                onPress={() => typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openExportPlannerModal', { detail: { subjectId, subjectName: subject?.name || '' } }))}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Export attendance"
                accessibilityHint="Download"
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: (e) => handleExportHover('attendance', true, e),
                  onMouseLeave: (e) => handleExportHover('attendance', false, e),
                })}
              >
                <Download size={18} color="#6B7280" />
              </TouchableOpacity>
            )}
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
                Attendance appears once you complete an event attached to this subject.
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
          <View style={styles.gradesSectionHeader}>
            <View style={styles.gradesSectionTitleRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Grades</Text>
              <TouchableOpacity
                style={styles.exportIconButton}
                onPress={() => setShowExportComingSoonModal(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Export grades"
                accessibilityHint="Download"
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: (e) => handleExportHover('grades', true, e),
                  onMouseLeave: (e) => handleExportHover('grades', false, e),
                })}
              >
                <Download size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {hasGradesAttention && isParentViewer ? (
              <Text style={styles.attentionHintText} accessibilityRole="text">
                * Open the listed event for a help request or submission review.
              </Text>
            ) : null}
          </View>
          {gradedItems.length > 0 && (
            <View style={styles.gradeAverage}>
              <View style={styles.gradeAverageRow}>
                <Text style={styles.gradeAverageLabel}>Current average</Text>
                <Text
                  style={
                    displayGradeAveragePercent != null
                      ? styles.gradeAverageValue
                      : styles.gradeAveragePlaceholder
                  }
                  accessibilityRole="text"
                  accessibilityLabel={
                    displayGradeAveragePercent != null
                      ? `Current grade average, ${displayGradeAveragePercent} percent`
                      : 'No numeric average yet'
                  }
                >
                  {displayGradeAveragePercent != null ? `${displayGradeAveragePercent}%` : '—'}
                </Text>
              </View>
              {displayGradeAveragePercent == null ? (
                <Text style={styles.gradeAverageHint}>
                  Average uses numeric scores or mapped letter grades. Add scores on assignments or assessments to see a
                  percentage.
                </Text>
              ) : null}
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
              {isParentViewer && assignmentsAssignedToStudent.length > 0 ? (
                <TouchableOpacity
                  style={[styles.emptyStateButton, styles.gradesAssignedToStudentButton]}
                  onPress={() => setShowAssignedToStudentModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View work assigned to student that has not been submitted"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Calendar size={18} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Assigned to student</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Grades appear once you add grades to assignments or assessments for this subject.
              </Text>
              {isParentViewer && assignmentsAssignedToStudent.length > 0 ? (
                <TouchableOpacity
                  style={styles.emptyStateButton}
                  onPress={() => setShowAssignedToStudentModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View work assigned to student that has not been submitted"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Calendar size={18} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Assigned to student</Text>
                </TouchableOpacity>
              ) : null}
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
              accessibilityHint="Download"
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
                onMouseEnter: (e) => handleExportHover('learningGoals', true, e),
                onMouseLeave: (e) => handleExportHover('learningGoals', false, e),
              })}
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
      <SubjectAssignedToStudentModal
        visible={showAssignedToStudentModal}
        onClose={() => setShowAssignedToStudentModal(false)}
        assignments={assignmentsAssignedToStudent}
        getChildName={getChildName}
        formatDueShort={formatDueShort}
        onOpenAssignment={handleOpenAssignedFromModal}
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
      {Platform.OS === 'web' &&
        exportTooltipKey &&
        (() => {
          let ReactDOM;
          try {
            ReactDOM = require('react-dom');
          } catch (e) {
            return null;
          }
          const tip = (
            <View
              pointerEvents="none"
              style={[
                styles.exportHoverTooltip,
                {
                  position: 'fixed',
                  left: exportTooltipPos.x,
                  top: exportTooltipPos.y,
                  transform: [{ translateX: '-50%' }],
                  marginTop: 6,
                },
              ]}
            >
              <Text style={styles.exportHoverTooltipText}>Download</Text>
            </View>
          );
          return ReactDOM.createPortal ? ReactDOM.createPortal(tip, document.body) : null;
        })()}
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
  /** Grades: spacing for Assigned to student below the list (same idea as attendance past-lessons CTA) */
  gradesAssignedToStudentButton: {
    marginTop: 8,
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
  materialsActionsRow: {
    marginTop: 8,
    marginBottom: 10,
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
    borderColor: 'rgba(133, 196, 242, 0.8)',
    borderStyle: 'dashed',
    backgroundColor: '#F4FAFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  materialsAddCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsList: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  materialsListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
    backgroundColor: '#F8FAFC',
  },
  materialsListHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsListHeaderDate: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.14)',
  },
  materialListItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  materialListItemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  materialListItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialListItemTagsRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  materialListItemTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  materialListItemTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialListItemDate: {
    fontSize: 12,
    color: '#64748B',
    minWidth: 96,
    textAlign: 'right',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsEmptyText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  gradesSectionHeader: {
    marginBottom: 16,
  },
  gradesSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** Past lessons CTA when attendance list is non-empty: spacing below list / show more */
  attendancePastLessonsButton: {
    marginTop: 8,
  },
  exportIconButton: {
    padding: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  /** Web hover tooltip — same idea as RightToolbar (dark pill, portal to body) */
  exportHoverTooltip: {
    backgroundColor: '#0f172a',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 10000,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.35)',
    }),
  },
  exportHoverTooltipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
  },
  gradeAverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  gradeAverageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    flexShrink: 0,
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
  gradeAveragePlaceholder: {
    fontSize: 22,
    fontWeight: '600',
    color: '#9CA3AF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeAverageHint: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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