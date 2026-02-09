import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  Edit2,
  Calendar,
  Clock,
  AlertTriangle,
  FileText,
  BookOpen,
  ChevronRight,
  ExternalLink,
  Plus,
  TrendingUp,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectDetail } from '../../lib/services/subjectsClient';
import { parseChildIds } from '../../lib/services/subjectsClient';

export default function SubjectDetailPage({
  subjectId,
  familyId,
  children = [],
  onBack,
  onEditSubject,
  onNavigateToPlanner,
  onNavigateToLibrary,
  preloadedSubjectData = null,
  onSubjectDataUpdate = null,
}) {
  const [loading, setLoading] = useState(!preloadedSubjectData);
  const [error, setError] = useState(null);
  const [subjectData, setSubjectData] = useState(preloadedSubjectData || null);
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
      const data = await getSubjectDetail(subjectId, familyId);
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

  const handleAddLesson = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskCreateModal', {
        detail: { subjectId, eventType: 'lesson' }
      }));
    }
  }, [subjectId]);

  const handleAddAssignment = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskCreateModal', {
        detail: { subjectId, eventType: 'assignment' }
      }));
    }
  }, [subjectId]);

  // Extract data
  const subject = subjectData?.subject;
  const materials = subjectData?.materials || [];
  const upcomingItems = subjectData?.upcomingItems || [];
  const overdueItems = subjectData?.overdueItems || [];
  const nextItem = subjectData?.nextItem;
  const attendanceRecords = subjectData?.attendanceRecords || [];
  const grades = subjectData?.grades || [];
  const eventOutcomes = subjectData?.eventOutcomes || [];
  const complianceItems = subjectData?.complianceItems || [];

  // Metrics (with proper null/undefined handling)
  const progressPercent = subjectData?.progressPercent ?? null;
  const attendanceRate30 = subjectData?.attendanceRate30 ?? null;
  const avgGradePercent = subjectData?.avgGradePercent ?? null;
  const complianceReady = subjectData?.complianceReady ?? null;

  // Get assigned children
  const assignedChildren = useMemo(() => {
    if (!subject) return [];
    if (subject.child_id) {
      return parseChildIds(subject.child_id);
    }
    return [...new Set((subjectData?.events || []).map(e => e.child_id).filter(Boolean))];
  }, [subject, subjectData?.events]);

  const childrenNames = assignedChildren.map(getChildName).filter(Boolean);

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

  // What's Next: upcoming events from today onwards (lesson, activity, assignment, project, exam)
  const whatsNextEvents = useMemo(() => {
    const events = subjectData?.events || [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    
    const validTypes = ['lesson', 'activity', 'assignment', 'project', 'exam'];
    
    const filteredEvents = events
      .filter(event => {
        if (!event.start_ts || !event.id) return false;

        const eventDate = new Date(event.start_ts);
        eventDate.setHours(0, 0, 0, 0);
        if (eventDate < now) return false; // Only upcoming / today+

        const rawType = event.event_type || event.type || '';
        const eventType = typeof rawType === 'string' ? rawType.toLowerCase() : '';
        if (!validTypes.includes(eventType)) return false;

        // Exclude canceled or backlog events if those flags exist
        if (event.status === 'canceled' || event.is_backlog) return false;

        return true;
      })
      .map(event => {
        const eventDate = new Date(event.start_ts);
        return {
          id: event.id,
          title: event.title || 'Untitled',
          dueDate: event.start_ts,
          childId: event.child_id,
          eventType: event.event_type || event.type,
          date: eventDate,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 10);

    return filteredEvents;
  }, [subjectData?.events]);

  const hasAnyEvents = useMemo(() => {
    return (subjectData?.events || []).length > 0;
  }, [subjectData?.events]);

  // Process compliance by requirement type
  const complianceByType = useMemo(() => {
    const grouped = {};
    complianceItems.forEach(item => {
      const req = item.state_requirements;
      if (!req) return;
      const type = req.requirement_type || 'Other';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push({
        id: item.id,
        title: req.requirement_title,
        description: req.requirement_description,
        status: item.status,
      });
    });
    return grouped;
  }, [complianceItems]);

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
                onPress={() => onNavigateToPlanner?.({ subjectId: subject.id })}
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
                // Could open a log time modal or scroll to attendance section
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
                <Text style={styles.summaryTileValue}>No time logged</Text>
                <Text style={styles.summaryTileSubtext}>Log a completed lesson to see trends.</Text>
                <TouchableOpacity
                  style={styles.summaryTileAction}
                  onPress={(e) => {
                    e.stopPropagation();
                    // Could open log time modal or navigate to planner
                    scrollToSection('attendance-section');
                  }}
                >
                  <Text style={styles.summaryTileActionText}>Log time</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>

          {/* Grades Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => {
              if (avgGradePercent !== null && avgGradePercent !== undefined && !isNaN(avgGradePercent)) {
                scrollToSection('grades-section');
              } else {
                handleAddAssignment();
              }
            }}
          >
            <Text style={styles.summaryTileLabel}>Grades</Text>
            {avgGradePercent !== null && avgGradePercent !== undefined && !isNaN(avgGradePercent) ? (
              <>
                <Text style={styles.summaryTileValue}>Avg: {avgGradePercent}%</Text>
                <Text style={styles.summaryTileCaption}>graded items</Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryTileValue}>Not graded yet</Text>
                <Text style={styles.summaryTileSubtext}>Add 1 assignment to track progress.</Text>
                <TouchableOpacity
                  style={styles.summaryTileAction}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleAddAssignment();
                  }}
                >
                  <Text style={styles.summaryTileActionText}>Add assignment</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>

          {/* Compliance Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => {
              if (complianceReady && complianceReady.met !== undefined && complianceReady.total !== undefined) {
                scrollToSection('compliance-section');
              } else {
                scrollToSection('compliance-section');
              }
            }}
          >
            <Text style={styles.summaryTileLabel}>Compliance</Text>
            {complianceReady && complianceReady.met !== undefined && complianceReady.total !== undefined ? (
              <>
                <Text style={styles.summaryTileValue}>{complianceReady.met}/{complianceReady.total} ready</Text>
                <Text style={styles.summaryTileCaption}>requirements</Text>
              </>
            ) : complianceItems.length > 0 ? (
              <>
                <Text style={styles.summaryTileValue}>Ready to track</Text>
                <Text style={styles.summaryTileSubtext}>Requirements update as you log work.</Text>
                <TouchableOpacity
                  style={styles.summaryTileAction}
                  onPress={(e) => {
                    e.stopPropagation();
                    scrollToSection('compliance-section');
                  }}
                >
                  <Text style={styles.summaryTileActionText}>View checklist</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.summaryTileValue}>Not configured</Text>
                <Text style={styles.summaryTileSubtext}>Choose a state to generate requirements.</Text>
                <TouchableOpacity
                  style={styles.summaryTileAction}
                  onPress={(e) => {
                    e.stopPropagation();
                    // Could open settings or compliance setup
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('openSettings', { detail: { tab: 'compliance' } }));
                    }
                  }}
                >
                  <Text style={styles.summaryTileActionText}>Set state</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Section 1: Timeline / What's Next */}
        <View id="progress-section" style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline / What's Next</Text>
          {whatsNextEvents.length > 0 ? (
            <View style={styles.timelineList}>
              {whatsNextEvents.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.timelineItem}
                  onPress={() =>
                    onNavigateToPlanner?.({
                      subjectId: subject.id,
                      childId: item.childId,
                      date: item.dueDate,
                    })
                  }
                >
                  <View style={styles.timelineItemContent}>
                    <Text style={styles.timelineItemTitle}>
                      {item.title}
                    </Text>
                    <Text style={styles.timelineItemDate}>
                      {formatRelativeDate(item.dueDate)} ({formatDayOfWeek(item.dueDate)})
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.muted || '#6B7280'} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <>
              {hasAnyEvents ? (
                <View style={styles.emptyStateBox}>
                  <Text style={styles.emptyStateBanner}>You're all caught up.</Text>
                  <Text style={styles.emptyStateText}>
                    No upcoming lessons, activities, or assignments are scheduled.
                  </Text>
                  <TouchableOpacity style={styles.emptyStateButton} onPress={handleAddLesson}>
                    <Plus size={18} color="#6B7280" />
                    <Text style={styles.emptyStateButtonText}>Add Lesson</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyStateBox}>
                  <Text style={styles.emptyStateBanner}>This subject hasn't started yet.</Text>
                  <Text style={styles.emptyStateText}>
                    Add a lesson or syllabus to begin tracking progress.
                  </Text>
                  <TouchableOpacity style={styles.emptyStateButton} onPress={handleAddLesson}>
                    <Plus size={18} color="#6B7280" />
                    <Text style={styles.emptyStateButtonText}>Add Lesson</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* Section 2: Attendance */}
        <View id="attendance-section" style={styles.section}>
          <Text style={styles.sectionTitle}>Attendance</Text>
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
                {attendanceRecords.slice(0, 10).map((record) => {
                  const event = (subjectData?.events || []).find(e => e.id === record.event_id);
                  return (
                    <View key={record.id} style={styles.attendanceItem}>
                      <Text style={styles.attendanceItemDate}>{formatDate(record.day_date)}</Text>
                      <Text style={styles.attendanceItemTitle}>
                        {event?.title || 'Lesson'}
                      </Text>
                      <Text style={styles.attendanceItemStatus}>{record.status}</Text>
                      <Text style={styles.attendanceItemMinutes}>{record.minutes} min</Text>
                    </View>
                  );
                })}
              </View>
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
          <Text style={styles.sectionTitle}>Grades</Text>
          {gradedItems.length > 0 ? (
            <>
              {avgGradePercent !== null && (
                <View style={styles.gradeAverage}>
                  <Text style={styles.gradeAverageLabel}>Current Average</Text>
                  <Text style={styles.gradeAverageValue}>{avgGradePercent}%</Text>
                </View>
              )}
              <View style={styles.gradesList}>
                {gradedItems.map((item) => (
                  <View key={item.id} style={styles.gradeItem}>
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
                  </View>
                ))}
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

        {/* Section 4: Compliance */}
        <View id="compliance-section" style={styles.section}>
          <Text style={styles.sectionTitle}>Compliance</Text>
          {Object.keys(complianceByType).length > 0 ? (
            Object.entries(complianceByType).map(([type, items]) => (
              <View key={type} style={styles.complianceGroup}>
                <Text style={styles.complianceGroupTitle}>{type}</Text>
                {items.map((item) => {
                  const statusConfig = {
                    met: { color: '#10B981', label: 'On track' },
                    on_track: { color: '#10B981', label: 'On track' },
                    completed: { color: '#10B981', label: 'On track' },
                    needs_attention: { color: '#F59E0B', label: 'Needs attention' },
                    not_started: { color: '#9CA3AF', label: 'Not started' },
                  };
                  const config = statusConfig[item.status] || statusConfig.not_started;
                  return (
                    <View key={item.id} style={styles.complianceItem}>
                      <View style={[styles.complianceStatusPill, { backgroundColor: config.color + '20' }]}>
                        <Text style={[styles.complianceStatusText, { color: config.color }]}>
                          {config.label}
                        </Text>
                      </View>
                      <Text style={styles.complianceItemText}>{item.title}</Text>
                    </View>
                  );
                })}
              </View>
            ))
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Compliance becomes clearer as you log lessons, work, and portfolio items.
              </Text>
              <TouchableOpacity style={styles.emptyStateButton}>
                <Text style={styles.emptyStateButtonText}>View state requirements</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Section 5: Materials Snapshot */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Materials Snapshot</Text>
            {materials.length > 0 && (
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => onNavigateToLibrary?.(subjectId)}
              >
                <Text style={styles.viewAllButtonText}>Go to Library</Text>
                <ExternalLink size={14} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
          {materials.length > 0 ? (
            <View style={styles.materialsGrid}>
              {materials.slice(0, 6).map((material) => (
                <TouchableOpacity
                  key={material.id}
                  style={styles.materialChip}
                  onPress={() => onNavigateToLibrary?.(subjectId)}
                >
                  <BookOpen size={14} color={colors.accent || '#4F46E5'} />
                  <Text style={styles.materialChipText} numberOfLines={1}>
                    {material.title || material.provider_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Materials help Learnadoodle plan lessons, track coverage, and generate insights.
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => onNavigateToLibrary?.(subjectId)}
              >
                <BookOpen size={18} color="#6B7280" />
                <Text style={styles.emptyStateButtonText}>Go to Library</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
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
  complianceGroup: {
    marginBottom: 20,
  },
  complianceGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  complianceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  complianceStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  complianceStatusText: {
    fontSize: 11,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  complianceItemText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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