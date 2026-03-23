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
  BookOpen,
  ChevronRight,
  ExternalLink,
  Plus,
  TrendingUp,
  CheckCircle,
  XCircle,
  Download,
  X,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectDetail, parseChildIds } from '../../lib/services/subjectsClient';
import { deriveRoleFromTags, DOCUMENT_ROLES } from '../../lib/docs/roles';
import { useSession } from '../../contexts/SessionContext';
import MaterialDocViewerModal, { resolveMaterialDocViewerUrl } from '../materials/MaterialDocViewerModal';
import { useToast } from '../Toast';
const ATTENDANCE_LIST_LIMIT = 5;

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
  const [showProgressCheckInModal, setShowProgressCheckInModal] = useState(false);
  const [showExportComingSoonModal, setShowExportComingSoonModal] = useState(false);
  const [showMaterialDocViewer, setShowMaterialDocViewer] = useState(false);
  const [materialDocViewerUrl, setMaterialDocViewerUrl] = useState('');
  const [materialDocViewerTitle, setMaterialDocViewerTitle] = useState('');
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

  const loadSubjectDetail = useCallback(async () => {
    if (!subjectId || !familyId || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      // Pass session for role-based filtering
      const data = await getSubjectDetail(subjectId, familyId, null, session);
      setSubjectData(data);
      if (onSubjectDataUpdate) {
        onSubjectDataUpdate(data);
      }
    } catch (err) {
      console.error('[SubjectDetailPage] Error loading subject detail:', err);
      setError(err.message || 'Failed to load subject details');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [subjectId, familyId, onSubjectDataUpdate]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRefresh = () => loadSubjectDetail();
    const handleSubjectDetailRefresh = (e) => {
      if (e.detail?.subjectId === subjectId) loadSubjectDetail();
    };
    window.addEventListener('refreshSubjects', handleRefresh);
    window.addEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
    return () => {
      window.removeEventListener('refreshSubjects', handleRefresh);
      window.removeEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
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

  const formatRelativeDate = useCallback((dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays < 7) {
      return `In ${diffDays} days`;
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }, []);

  const formatDayOfWeek = useCallback((dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }, []);

  const formatTimeLabel = useCallback((dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
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

  const handleOpenPlanYear = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openPlanYearModal', {
        detail: { from: 'subject_detail', subjectId }
      }));
    }
  }, [subjectId]);

  const handleMaterialChipPress = useCallback(
    async (material) => {
      if (!material?.id) return;
      const fallbackTitle = material.title || material.provider_name || 'Material';
      try {
        const { url, title, error } = await resolveMaterialDocViewerUrl(material.id);
        if (error || !url) {
          const isInfo = error && /cannot be viewed|does not have a viewable/i.test(error);
          toast.push(error || 'Could not open this material.', isInfo ? 'info' : 'error');
          return;
        }
        setMaterialDocViewerTitle(title || fallbackTitle);
        setMaterialDocViewerUrl(url);
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

  // What's Next in detail: only next 7 days (from current time); rest show "View more in Planner"
  const { whatsNextInNext7Days, hasMoreBeyond7Days } = useMemo(() => {
    const list = subjectData?.upcomingItems || [];
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    const inNext7 = list.filter(item => item.dueDate && new Date(item.dueDate) <= end);
    const hasMore = list.some(item => item.dueDate && new Date(item.dueDate) > end);
    return { whatsNextInNext7Days: inNext7, hasMoreBeyond7Days: hasMore };
  }, [subjectData?.upcomingItems]);

  const hasAnyEvents = useMemo(() => {
    return (subjectData?.events || []).length > 0;
  }, [subjectData?.events]);

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
                  {syllabusMaterials.map((material) => (
                    <TouchableOpacity
                      key={material.id}
                      style={styles.materialChip}
                      onPress={() => handleMaterialChipPress(material)}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <BookOpen size={14} color={colors.accent || '#4F46E5'} />
                      <Text style={styles.materialChipText} numberOfLines={1}>
                        {material.title || material.provider_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
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
                  {lessonPlanMaterials.map((material) => (
                    <TouchableOpacity
                      key={material.id}
                      style={styles.materialChip}
                      onPress={() => handleMaterialChipPress(material)}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <BookOpen size={14} color={colors.accent || '#4F46E5'} />
                      <Text style={styles.materialChipText} numberOfLines={1}>
                        {material.title || material.provider_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
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

        {/* Section 1: Progress - next 7 days only; then link to Planner */}
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
          <View style={styles.attendanceChips}>
            <TouchableOpacity
              style={styles.attendanceChip}
              onPress={() => setShowProgressCheckInModal(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Where are you in the syllabus? Open progress check-in."
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <TrendingUp size={14} color="#10B981" />
              <Text style={styles.attendanceChipText}>
                {progressPercent !== null &&
                progressPercent !== undefined &&
                !isNaN(Number(progressPercent))
                  ? `${Math.round(Math.max(0, Math.min(100, Number(progressPercent))))}%`
                  : '0%'}
              </Text>
            </TouchableOpacity>
          </View>
          {whatsNextInNext7Days.length > 0 ? (
            <>
              <View style={styles.timelineList}>
                {whatsNextInNext7Days.map((item) => {
                  const eventId = item.type === 'event' && typeof item.id === 'string' && item.id.startsWith('event-')
                    ? item.id.slice(6)
                    : item.id;
                  const event = (subjectData?.events || []).find(e => e.id === eventId);
                  const timeLabel = formatTimeLabel(item.dueDate);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.timelineItem}
                      onPress={() => {
                        if (eventId) handleOpenEventDetails(eventId, event);
                      }}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={styles.timelineItemContent}>
                        <Text style={styles.timelineItemTitle}>
                          {item.title}
                        </Text>
                        <Text style={styles.timelineItemDate}>
                          {formatRelativeDate(item.dueDate)} ({formatDayOfWeek(item.dueDate)})
                          {timeLabel ? ` · ${timeLabel}` : ''}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={colors.muted || '#6B7280'} />
                    </TouchableOpacity>
                  );
                })}
              </View>
              {hasMoreBeyond7Days && onNavigateToPlanner && (
                <TouchableOpacity
                  style={styles.attendanceViewTotalBtn}
                  onPress={() => onNavigateToPlanner({ subjectId: subject.id, view: 'month' })}
                  activeOpacity={0.7}
                >
                  <Calendar size={16} color={colors.accent || '#4F46E5'} />
                  <Text style={styles.attendanceViewTotalText}>View more in Planner</Text>
                  <ChevronRight size={16} color={colors.muted || '#6B7280'} />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {hasMoreBeyond7Days && onNavigateToPlanner ? (
                <View style={styles.emptyStateBox}>
                  <Text style={styles.emptyStateBanner}>Nothing in the next 7 days</Text>
                  <Text style={styles.emptyStateText}>
                    Upcoming lessons are later. View the full schedule in Planner.
                  </Text>
                  <View style={styles.emptyStateButtonRow}>
                    <TouchableOpacity
                      style={styles.attendanceViewTotalBtn}
                      onPress={() => onNavigateToPlanner({ subjectId: subject.id, view: 'month' })}
                      activeOpacity={0.7}
                    >
                      <Calendar size={16} color={colors.accent || '#4F46E5'} />
                      <Text style={styles.attendanceViewTotalText}>View in Planner</Text>
                      <ChevronRight size={16} color={colors.muted || '#6B7280'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.emptyStateButton} onPress={handleOpenPlanYear} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                      <Calendar size={18} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Plan my year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.emptyStateButton} onPress={() => setShowExportComingSoonModal(true)} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                      <FileText size={18} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Recently submitted</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : hasAnyEvents ? (
                <View style={styles.emptyStateBox}>
                  <Text style={styles.emptyStateBanner}>You're all caught up.</Text>
                  <Text style={styles.emptyStateText}>
                    No upcoming lessons, activities, or assignments are scheduled.
                  </Text>
                  <View style={styles.emptyStateButtonRow}>
                    <TouchableOpacity style={styles.emptyStateButton} onPress={handleAddLesson} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                      <Plus size={18} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Add Lesson</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.emptyStateButton} onPress={handleOpenPlanYear} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                      <Calendar size={18} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Plan my year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.emptyStateButton} onPress={() => setShowExportComingSoonModal(true)} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                      <FileText size={18} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Recently submitted</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyStateBox}>
                  <Text style={styles.emptyStateBanner}>This subject hasn't started yet.</Text>
                  <Text style={styles.emptyStateText}>
                    Add a lesson or syllabus to begin tracking progress.
                  </Text>
                  <View style={styles.emptyStateButtonRow}>
                    <TouchableOpacity style={styles.emptyStateButton} onPress={handleAddLesson} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                      <Plus size={18} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Add Lesson</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.emptyStateButton} onPress={handleOpenPlanYear} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                      <Calendar size={18} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Plan my year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.emptyStateButton} onPress={() => setShowExportComingSoonModal(true)} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                      <FileText size={18} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Recently submitted</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
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
            <>
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
            </>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Attendance appears after you complete lessons or log time.
              </Text>
            </View>
          )}
        </View>

        {/* Section 3: Grades */}
        <View id="grades-section" style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Grades</Text>
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
                  return (
                    <Wrapper key={item.id} style={styles.gradeItem} {...wrapperProps}>
                      <View style={styles.gradeItemContent}>
                        <Text style={styles.gradeItemName}>{item.name}</Text>
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
      <Modal
        visible={showProgressCheckInModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProgressCheckInModal(false)}
      >
        <TouchableOpacity
          style={styles.progressCheckInModalOverlay}
          activeOpacity={1}
          onPress={() => setShowProgressCheckInModal(false)}
        >
          <View style={styles.progressCheckInModalContent}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.progressCheckInModalTitle}>Where are you in the syllabus?</Text>
              <Text style={styles.progressCheckInModalBody}>
                We're building a quick check-in so you can tell us where you are (e.g. % through the year or which unit). We'll then offer to mark attendance based on that pace and show your year progress here. Check back soon.
              </Text>
              <TouchableOpacity
                style={styles.progressCheckInModalCloseButton}
                onPress={() => setShowProgressCheckInModal(false)}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.progressCheckInModalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={showExportComingSoonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportComingSoonModal(false)}
      >
        <View style={styles.comingSoonModalOverlay}>
          <View style={styles.comingSoonModalContent}>
            <TouchableOpacity
              style={styles.comingSoonModalClose}
              onPress={() => setShowExportComingSoonModal(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.comingSoonModalTitle}>Coming soon</Text>
            <Text style={styles.comingSoonModalText}>
              This feature is in development. Stay tuned for updates!
            </Text>
            <TouchableOpacity
              style={styles.comingSoonModalButton}
              onPress={() => setShowExportComingSoonModal(false)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.comingSoonModalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <MaterialDocViewerModal
        visible={showMaterialDocViewer && !!materialDocViewerUrl}
        onClose={closeMaterialDocViewer}
        url={materialDocViewerUrl}
        title={materialDocViewerTitle}
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
  attendanceHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  comingSoonModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  comingSoonModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  comingSoonModalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 1,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  comingSoonModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    marginTop: 8,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  comingSoonModalText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  comingSoonModalButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  comingSoonModalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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
  attendanceViewTotalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceViewTotalText: {
    flex: 1,
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