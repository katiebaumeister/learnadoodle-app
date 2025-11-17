import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, Platform, Image } from 'react-native';
import { ExternalLink, X, Calendar, Search, AlertCircle, RefreshCw, BookOpen, Filter } from 'lucide-react';
import { fetchExternalCourses, fetchCourseOutline, scheduleExternalCourse, fetchExternalProgress, upsertExternalProgress, addExternalLink } from '../lib/apiClient';
import { useToast } from './Toast';
import AddFromLink from './AddFromLink';

const LIMIT = 24;
const SUBJECT_OPTIONS = [
  { label: 'All Subjects', value: null },
  { label: 'Math', value: 'math' },
  { label: 'Science', value: 'science' },
  { label: 'Language Arts', value: 'language_arts' },
  { label: 'History', value: 'history' },
];

const STAGE_OPTIONS = [
  { label: 'All Stages', value: null },
  { label: 'Early Years', value: 'early_years' },
  { label: 'Primary', value: 'primary' },
  { label: 'Middle School', value: 'ms' },
  { label: 'High School', value: 'hs' },
];

export default function ExploreContent({ familyId, children = [] }) {
  const [courses, setCourses] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [outline, setOutline] = useState(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleParams, setScheduleParams] = useState({
    childId: children[0]?.id || null,
    startDate: new Date().toISOString().split('T')[0],
    daysPerWeek: 4,
    sessionsPerDay: 1,
  });
  const [scheduling, setScheduling] = useState(false);
  const [filters, setFilters] = useState({
    subjectKey: null,
    stageKey: null,
    search: '',
  });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [activeChildId, setActiveChildId] = useState(children[0]?.id || null);
  const [progressByLesson, setProgressByLesson] = useState({});
  const [progressLoading, setProgressLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null); // 'network' | 'server' | 'not_found'
  const toast = useToast();
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const [showComplianceBanner, setShowComplianceBanner] = useState(true);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [modalCourse, setModalCourse] = useState(null);
  const [schedulingAuto, setSchedulingAuto] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 350);
    return () => clearTimeout(handle);
  }, [filters.search]);

  const loadCourses = useCallback(
    async (append = false, nextOffset = 0) => {
      if (append) {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
      }

      try {
        const { data, error } = await fetchExternalCourses({
          provider: 'Khan Academy',
          limit: LIMIT,
          offset: nextOffset,
          subject_key: filters.subjectKey || undefined,
          stage_key: filters.stageKey || undefined,
          q: debouncedSearch || undefined,
        });

        if (error) {
          console.error('Error loading courses:', error);
          const errorMsg = error.message || String(error);
          const isNetworkError = errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('ECONNREFUSED');
          const isServerError = errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503');
          
          setError(errorMsg);
          setErrorType(isNetworkError ? 'network' : isServerError ? 'server' : 'unknown');
          
          if (!append) {
            setCourses([]);
            setTotal(0);
          }
          
          if (!append) {
            toast.push('Failed to load courses', 'error');
          }
          return;
        }
        
        setError(null);
        setErrorType(null);

        const items = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
        const totalCount = typeof data?.total === 'number' ? data.total : items.length;

        setCourses((prev) => {
          if (append) {
            const existingIds = new Set(prev.map((item) => item.id));
            const filtered = items.filter((item) => !existingIds.has(item.id));
            return [...prev, ...filtered];
          }
          return items;
        });
        setTotal(totalCount);
        setOffset(nextOffset);
      } catch (err) {
        console.error('Error in loadCourses:', err);
        const errorMsg = err.message || String(err);
        const isNetworkError = errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('ECONNREFUSED');
        
        setError(errorMsg);
        setErrorType(isNetworkError ? 'network' : 'server');
        
        if (!append) {
          setCourses([]);
          setTotal(0);
        }
        
        if (!append) {
          toast.push('Failed to load courses', 'error');
        }
      } finally {
        if (append) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        } else {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [filters.subjectKey, filters.stageKey, debouncedSearch, toast]
  );

  const filtersActive = Boolean(filters.subjectKey || filters.stageKey || filters.search.trim());

  useEffect(() => {
    loadCourses(false, 0);
  }, [loadCourses]);

  const loadOutline = async (courseId, childId = activeChildId) => {
    setOutlineLoading(true);
    setOutlineError(null);
    try {
      const { data, error } = await fetchCourseOutline(courseId);
      if (error) {
        console.error('Error loading outline:', error);
        setOutlineError(error.message || 'Failed to load course outline');
        toast.push('Failed to load course outline', 'error');
        return;
      }
      setOutline(data);
      setSelectedCourse(courses.find(c => c.id === courseId));
      if (childId) {
        await loadProgress(childId);
      }
    } catch (err) {
      console.error('Error in loadOutline:', err);
      setOutlineError(err.message || 'Failed to load course outline');
      toast.push('Failed to load course outline', 'error');
    } finally {
      setOutlineLoading(false);
    }
  };

  const loadProgress = useCallback(async (childId) => {
    if (!childId) {
      setProgressByLesson({});
      return;
    }
    setProgressLoading(true);
    try {
      const { data, error } = await fetchExternalProgress(childId);
      if (error) {
        console.error('Error loading progress:', error);
        toast.push('Failed to load progress', 'error');
        setProgressByLesson({});
        return;
      }
      const map = {};
      (data || []).forEach((item) => {
        map[item.external_lesson_id] = item.status;
      });
      setProgressByLesson(map);
    } catch (err) {
      console.error('Error in loadProgress:', err);
      toast.push('Failed to load progress', 'error');
      setProgressByLesson({});
    } finally {
      setProgressLoading(false);
    }
  }, [toast]);

  const handleSchedule = async () => {
    if (!activeChildId || !selectedCourse) {
      toast.push('Please select a child', 'error');
      return;
    }

    setScheduling(true);
    try {
      const { data, error } = await scheduleExternalCourse({
        familyId,
        childId: activeChildId,
        courseId: selectedCourse.id,
        startDate: scheduleParams.startDate,
        daysPerWeek: scheduleParams.daysPerWeek,
        sessionsPerDay: scheduleParams.sessionsPerDay,
      });

      if (error) {
        console.error('Error scheduling course:', error);
        toast.push('Failed to schedule course', 'error');
      } else {
        toast.push(`Scheduled ${data?.scheduled_events || 0} lessons`, 'success');
        setShowScheduleModal(false);
      }
    } catch (err) {
      console.error('Error in handleSchedule:', err);
      toast.push('Failed to schedule course', 'error');
    } finally {
      setScheduling(false);
    }
  };

  const handleSubjectChange = (value) => {
    setFilters((prev) => ({ ...prev, subjectKey: value }));
  };

  const handleStageChange = (value) => {
    setFilters((prev) => ({ ...prev, stageKey: value }));
  };

  const handleLoadMore = () => {
    if (loadingMore || courses.length >= total) return;
    loadCourses(true, courses.length);
  };

  const hasMore = courses.length < total;

  useEffect(() => {
    // Reset list when filters change (subject/stage or search debounced)
    setOffset(0);
  }, [filters.subjectKey, filters.stageKey, debouncedSearch]);

  useEffect(() => {
    setScheduleParams((prev) => ({ ...prev, childId: activeChildId }));
    if (outline) {
      loadProgress(activeChildId);
    }
  }, [activeChildId, outline, loadProgress]);

  const handleProgressUpdate = async (lessonId, nextStatus) => {
    if (!activeChildId) {
      toast.push('Select a child to track progress', 'error');
      return;
    }
    try {
      const { error } = await upsertExternalProgress({
        childId: activeChildId,
        lessonId,
        status: nextStatus,
      });
      if (error) {
        console.error('Error updating progress:', error);
        toast.push('Failed to update progress', 'error');
        return;
      }
      setProgressByLesson((prev) => ({ ...prev, [lessonId]: nextStatus }));
      toast.push('Progress updated', 'success');
    } catch (err) {
      console.error('Error in handleProgressUpdate:', err);
      toast.push('Failed to update progress', 'error');
    }
  };

  const cycleStatus = (current) => {
    const order = ['not_started', 'in_progress', 'done', 'skipped'];
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
  };

  const handleScheduleAutomatically = async (course) => {
    if (!activeChildId) {
      toast.push('Please select a child', 'error');
      return;
    }

    setSchedulingAuto(true);
    try {
      // For now, use the existing scheduleExternalCourse endpoint
      // This creates events from the course outline
      const { data, error } = await scheduleExternalCourse({
        familyId,
        childId: activeChildId,
        courseId: course.id,
        startDate: new Date().toISOString().split('T')[0],
        daysPerWeek: 4,
        sessionsPerDay: 1,
      });

      if (error) {
        console.error('Error scheduling course:', error);
        toast.push('Failed to schedule course automatically', 'error');
      } else {
        toast.push(`Scheduled ${data?.scheduled_events || 0} lessons automatically`, 'success');
      }
    } catch (err) {
      console.error('Error in handleScheduleAutomatically:', err);
      toast.push('Failed to schedule course automatically', 'error');
    } finally {
      setSchedulingAuto(false);
    }
  };

  const childActive = activeChildId && children.some((c) => c.id === activeChildId);

  useEffect(() => {
    if (!childActive && children.length > 0) {
      setActiveChildId(children[0].id);
    }
  }, [children, childActive]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
        <Text style={styles.subtitle}>Link-only catalog of external educational content</Text>
      </View>

      {showComplianceBanner && (
        <View style={styles.banner}>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>Third-Party Educational Content Notice</Text>
            <Text style={styles.bannerText}>
              Learnadoodle links to external providers like Khan Academy. We don&apos;t host their lessons.
              Content opens in a new tab under the provider&apos;s terms. Families remain responsible for
              following provider licenses and local education rules.
            </Text>
          </View>
          <TouchableOpacity onPress={() => setShowComplianceBanner(false)} style={styles.bannerDismiss}>
            <X size={14} color="#6b7280" />
          </TouchableOpacity>
        </View>
      )}

      <AddFromLink
        familyId={familyId}
        children={children}
        onCreated={(data) => {
          // Refresh course list to show newly added course
          if (data?.course_id) {
            loadCourses(false, 0);
          }
        }}
      />

      <View style={styles.filtersContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search courses"
          placeholderTextColor="#9ca3af"
          value={filters.search}
          onChangeText={(text) => setFilters((prev) => ({ ...prev, search: text }))}
          returnKeyType="search"
        />

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {SUBJECT_OPTIONS.map((option) => {
              const isActive = filters.subjectKey === option.value || (!filters.subjectKey && option.value === null);
              return (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => handleSubjectChange(option.value)}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {children.length === 0 ? (
              <Text style={styles.noChildText}>Add a child to track progress and scheduling.</Text>
            ) : (
              children.map((child) => {
                const isActive = activeChildId === child.id;
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => setActiveChildId(child.id)}
                  >
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{child.first_name || child.name}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {STAGE_OPTIONS.map((option) => {
              const isActive = filters.stageKey === option.value || (!filters.stageKey && option.value === null);
              return (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => handleStageChange(option.value)}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading courses...</Text>
          <Text style={styles.loadingSubtext}>Searching our catalog...</Text>
        </View>
      ) : error && courses.length === 0 ? (
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>
            {errorType === 'network' ? 'Connection Error' : errorType === 'server' ? 'Server Error' : 'Error Loading Courses'}
          </Text>
          <Text style={styles.errorMessage}>
            {errorType === 'network'
              ? 'Unable to connect to the server. Please check your internet connection.'
              : errorType === 'server'
                ? 'The server encountered an error. Please try again in a moment.'
                : error || 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadCourses(false, 0)}>
            <RefreshCw size={16} color="#ffffff" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          {errorType === 'network' && (
            <Text style={styles.errorHint}>
              Make sure the FastAPI server is running on port 8000
            </Text>
          )}
        </View>
      ) : courses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <BookOpen size={48} color="#9ca3af" />
          <Text style={styles.emptyText}>
            {filtersActive ? 'No courses found' : 'No courses available'}
          </Text>
          <Text style={styles.emptySubtext}>
            {filtersActive ? (
              <>
                No courses match your current filters.{'\n'}
                Try adjusting your search or clearing filters to see more options.
              </>
            ) : (
              <>
                Courses will appear here once they&apos;re added to the catalog.{'\n\n'}
                To get started:{'\n'}
                1. Run the SQL migration (add-external-content-integration.sql){'\n'}
                2. Start the FastAPI server on port 8000{'\n'}
                3. Ingest course data using the ingestion script
              </>
            )}
          </Text>
          {filtersActive && (
            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={() => {
                setFilters({ subjectKey: null, stageKey: null, search: '' });
              }}
            >
              <Filter size={16} color="#3b82f6" />
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.coursesList} contentContainerStyle={styles.coursesListContent}>
          {courses.map((course) => (
            <TouchableOpacity 
              key={course.id} 
              style={styles.courseCard}
              onPress={() => {
                setModalCourse(course);
                setShowCourseModal(true);
              }}
            >
              <View style={styles.courseHeader}>
                {course.thumbnail_url && (
                  <View style={styles.courseThumbnail}>
                    <Image 
                      source={{ uri: course.thumbnail_url }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  </View>
                )}
                <View style={styles.courseBadge}>
                  <Text style={styles.courseBadgeText}>{course.provider_name}</Text>
                  <Text style={styles.courseBadgeSubtext}>Link-only</Text>
                </View>
                <View style={styles.courseInfo}>
                  <Text style={styles.courseSubject}>
                    {course.subject || 'General'} {course.grade_band ? `• ${course.grade_band}` : ''}
                  </Text>
                  {(course.subject_key || course.stage_key) && (
                    <Text style={styles.courseMeta}>
                      {course.subject_key ? `Subject: ${course.subject_key}` : ''}
                      {course.subject_key && course.stage_key ? ' • ' : ''}
                      {course.stage_key ? `Stage: ${course.stage_key}` : ''}
                    </Text>
                  )}
                  <Text style={styles.courseLessons}>
                    {course.lesson_count ?? '—'} lessons
                  </Text>
                </View>

                <View style={styles.courseActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      if (Platform.OS === 'web') {
                        window.open(course.public_url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    <ExternalLink size={16} color="#3b82f6" />
                    <Text style={styles.actionButtonText}>Open course</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonPrimary]}
                    onPress={(e) => {
                      e.stopPropagation();
                      loadOutline(course.id);
                    }}
                  >
                    <Text style={styles.actionButtonTextPrimary}>View outline</Text>
                  </TouchableOpacity>
                  {activeChildId && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.actionButtonSchedule]}
                      onPress={async (e) => {
                        e.stopPropagation();
                        await handleScheduleAutomatically(course);
                      }}
                    >
                      <Calendar size={16} color="#10b981" />
                      <Text style={styles.actionButtonScheduleText}>Schedule</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.externalBadge}>
                    <ExternalLink size={12} color="#3b82f6" />
                    <Text style={styles.externalBadgeText}>Opens externally</Text>
                  </View>
                </View>

                {course.attribution_text && (
                  <Text style={styles.attribution}>{course.attribution_text}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}

          {hasMore && (
            <View style={styles.loadMoreContainer}>
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <Text style={styles.loadMoreText}>Load More</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Outline Modal/Drawer */}
      {outline && (
        <Modal
          visible={!!outline}
          animationType="slide"
          transparent={true}
          onRequestClose={() => {
            setOutline(null);
            setOutlineError(null);
            setSelectedCourse(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalProvider}>{outline.provider_name}</Text>
                  <Text style={styles.modalTitle}>
                    {outline.subject} {outline.grade_band ? `• ${outline.grade_band}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setOutline(null);
                    setOutlineError(null);
                    setSelectedCourse(null);
                  }}
                  style={styles.closeButton}
                >
                  <X size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              {outlineLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#3b82f6" />
                  <Text style={styles.loadingText}>Loading course outline...</Text>
                </View>
              ) : outlineError ? (
                <View style={styles.errorContainer}>
                  <AlertCircle size={48} color="#ef4444" />
                  <Text style={styles.errorTitle}>Error Loading Outline</Text>
                  <Text style={styles.errorMessage}>{outlineError}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => loadOutline(selectedCourse?.id)}
                  >
                    <RefreshCw size={16} color="#ffffff" />
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : outline && (!outline.units || outline.units.length === 0) ? (
                <View style={styles.emptyContainer}>
                  <BookOpen size={48} color="#9ca3af" />
                  <Text style={styles.emptyText}>No outline available</Text>
                  <Text style={styles.emptySubtext}>
                    This course doesn&apos;t have a detailed outline yet.
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.outlineContent}>
                  {progressLoading && (
                    <Text style={styles.progressHint}>Loading progress…</Text>
                  )}
                  {outline.units?.map((unit) => (
                    <View key={unit.ordinal} style={styles.unitCard}>
                      <Text style={styles.unitTitle}>
                        {unit.ordinal}. {unit.title_safe}
                      </Text>
                      <View style={styles.lessonsList}>
                        {unit.lessons?.map((lesson) => {
                          const lessonId = lesson.id;
                          const status = progressByLesson[lessonId] || 'not_started';
                          const nextStatus = cycleStatus(status);
                          const statusLabelMap = {
                            not_started: 'Not Started',
                            in_progress: 'In Progress',
                            done: 'Completed',
                            skipped: 'Skipped',
                          };
                          const statusColorMap = {
                            not_started: '#d1d5db',
                            in_progress: '#f59e0b',
                            done: '#10b981',
                            skipped: '#9ca3af',
                          };
                          return (
                            <View key={lesson.ordinal} style={styles.lessonItem}>
                              <View style={styles.lessonInfo}>
                                <Text style={styles.lessonText}>
                                  {unit.ordinal}.{lesson.ordinal} {lesson.title_safe}
                                  {lesson.resource_type ? ` • ${lesson.resource_type}` : ''}
                                </Text>
                                <View style={styles.lessonActions}>
                                  <TouchableOpacity
                                    style={[styles.statusChip, { backgroundColor: statusColorMap[status] || '#d1d5db' }]}
                                    onPress={() => handleProgressUpdate(lessonId || lesson.public_url, nextStatus)}
                                  >
                                    <Text style={styles.statusChipText}>{statusLabelMap[status] || 'Not Started'}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (Platform.OS === 'web') {
                                        window.open(lesson.public_url, '_blank', 'noopener,noreferrer');
                                      }
                                    }}
                                  >
                                    <Text style={styles.lessonLink}>Open</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.scheduleButton}
                  onPress={() => setShowScheduleModal(true)}
                >
                  <Calendar size={16} color="#ffffff" />
                  <Text style={styles.scheduleButtonText}>Schedule this course</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.openButton}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      window.open(outline.public_url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                >
                  <Text style={styles.openButtonText}>Open course homepage</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.complianceText}>
                Lesson metadata and links provided for convenience. © Original content belongs to the provider.
                {selectedCourse?.license && ` ${selectedCourse.provider_name} content is licensed ${selectedCourse.license}.`}
                {' '}Learnadoodle links externally, displays provider attribution, and does not host or reproduce provider materials.
              </Text>
            </View>
          </View>
        </Modal>
      )}

      {/* Course Detail Modal */}
      <Modal
        visible={showCourseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCourseModal(false);
          setModalCourse(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {modalCourse && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    {modalCourse.thumbnail_url && (
                      <View style={styles.modalThumbnail}>
                        <Image 
                          source={{ uri: modalCourse.thumbnail_url }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      </View>
                    )}
                    <Text style={styles.modalProvider}>{modalCourse.provider_name}</Text>
                    <Text style={styles.modalTitle}>
                      {modalCourse.subject || 'General'} {modalCourse.grade_band ? `• ${modalCourse.grade_band}` : ''}
                    </Text>
                    {modalCourse.lesson_count && (
                      <Text style={styles.modalMeta}>
                        {modalCourse.lesson_count} lesson{modalCourse.lesson_count !== 1 ? 's' : ''}
                        {modalCourse.duration_sec && ` • ${Math.ceil(modalCourse.duration_sec / 60)} min total`}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCourseModal(false);
                      setModalCourse(null);
                    }}
                    style={styles.closeButton}
                  >
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <Text style={styles.modalDescription}>
                    {modalCourse.attribution_text || 'External educational content. Click "View outline" to see lessons.'}
                  </Text>
                </ScrollView>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={[styles.modalActionButton, styles.modalActionButtonPrimary]}
                    onPress={async () => {
                      if (!activeChildId) {
                        toast.push('Please select a child', 'error');
                        return;
                      }
                      await handleScheduleAutomatically(modalCourse);
                      setShowCourseModal(false);
                      setModalCourse(null);
                    }}
                    disabled={schedulingAuto || !activeChildId}
                  >
                    {schedulingAuto ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Calendar size={16} color="#ffffff" />
                        <Text style={styles.modalActionButtonText}>Schedule automatically</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalActionButton}
                    onPress={() => {
                      if (modalCourse.source_url) {
                        if (Platform.OS === 'web') {
                          window.open(modalCourse.source_url, '_blank', 'noopener,noreferrer');
                        }
                      } else if (modalCourse.public_url) {
                        if (Platform.OS === 'web') {
                          window.open(modalCourse.public_url, '_blank', 'noopener,noreferrer');
                        }
                      }
                    }}
                  >
                    <ExternalLink size={16} color="#3b82f6" />
                    <Text style={styles.modalActionButtonTextSecondary}>Open course</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalActionButton}
                    onPress={() => {
                      setShowCourseModal(false);
                      setModalCourse(null);
                      loadOutline(modalCourse.id);
                    }}
                  >
                    <BookOpen size={16} color="#3b82f6" />
                    <Text style={styles.modalActionButtonTextSecondary}>View outline</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Schedule Modal */}
      <Modal
        visible={showScheduleModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <View style={styles.scheduleModalOverlay}>
          <View style={styles.scheduleModalContent}>
            <View style={styles.scheduleModalHeader}>
              <Text style={styles.scheduleModalTitle}>Schedule Course</Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <X size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.scheduleForm}>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Child</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childSelector}>
                  {children.map((child) => (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childChip,
                        scheduleParams.childId === child.id && styles.childChipActive,
                      ]}
                      onPress={() => setScheduleParams({ ...scheduleParams, childId: child.id })}
                    >
                      <Text
                        style={[
                          styles.childChipText,
                          scheduleParams.childId === child.id && styles.childChipTextActive,
                        ]}
                      >
                        {child.first_name || child.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Start Date</Text>
                <TextInput
                  style={styles.input}
                  value={scheduleParams.startDate}
                  onChangeText={(text) => setScheduleParams({ ...scheduleParams, startDate: text })}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Days per Week</Text>
                <View style={styles.daysSelector}>
                  {[3, 4, 5].map((days) => (
                    <TouchableOpacity
                      key={days}
                      style={[
                        styles.daysChip,
                        scheduleParams.daysPerWeek === days && styles.daysChipActive,
                      ]}
                      onPress={() => setScheduleParams({ ...scheduleParams, daysPerWeek: days })}
                    >
                      <Text
                        style={[
                          styles.daysChipText,
                          scheduleParams.daysPerWeek === days && styles.daysChipTextActive,
                        ]}
                      >
                        {days}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.scheduleModalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowScheduleModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, scheduling && styles.confirmButtonDisabled]}
                onPress={handleSchedule}
                disabled={scheduling}
              >
                {scheduling ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.confirmButtonText}>Schedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  filterRow: {
    flexDirection: 'row',
  },
  chipRow: {
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  filterChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  filterChipText: {
    fontSize: 13,
    color: '#374151',
  },
  filterChipTextActive: {
    fontWeight: '600',
    color: '#1d4ed8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: '#9ca3af',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  errorHint: {
    marginTop: 12,
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 500,
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  clearFiltersText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  coursesList: {
    flex: 1,
  },
  coursesListContent: {
    padding: 16,
    gap: 16,
  },
  courseCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  courseHeader: {
    marginBottom: 12,
  },
  courseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  courseBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  courseBadgeSubtext: {
    fontSize: 11,
    color: '#9ca3af',
  },
  courseInfo: {
    marginTop: 4,
  },
  courseSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  courseMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  courseLessons: {
    fontSize: 14,
    color: '#6b7280',
  },
  courseActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionButtonPrimary: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  actionButtonText: {
    fontSize: 14,
    color: '#3b82f6',
  },
  actionButtonTextPrimary: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  actionButtonSchedule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  actionButtonScheduleText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '500',
  },
  courseThumbnail: {
    width: '100%',
    height: 120,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  attribution: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalProvider: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#6b7280',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  modalThumbnail: {
    width: '100%',
    height: 180,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  modalMeta: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  modalBody: {
    maxHeight: 200,
    marginBottom: 20,
  },
  modalDescription: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  modalActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  modalActionButtonPrimary: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  modalActionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalActionButtonTextSecondary: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  closeButton: {
    padding: 4,
  },
  outlineContent: {
    maxHeight: 400,
  },
  unitCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  unitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  lessonsList: {
    gap: 8,
  },
  lessonItem: {
    flexDirection: 'column',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  lessonInfo: {
    gap: 6,
  },
  lessonText: {
    fontSize: 14,
    color: '#374151',
  },
  lessonActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lessonLink: {
    fontSize: 14,
    color: '#3b82f6',
    textDecorationLine: 'underline',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 16,
  },
  scheduleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  scheduleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  openButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  openButtonText: {
    fontSize: 14,
    color: '#3b82f6',
    textDecorationLine: 'underline',
  },
  complianceText: {
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 16,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  scheduleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  scheduleModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    padding: 24,
  },
  scheduleModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  scheduleModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  scheduleForm: {
    gap: 20,
  },
  formField: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  childSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  childChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  childChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  childChipText: {
    fontSize: 14,
    color: '#374151',
  },
  childChipTextActive: {
    color: '#1e40af',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
  },
  daysSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  daysChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  daysChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  daysChipText: {
    fontSize: 14,
    color: '#374151',
  },
  daysChipTextActive: {
    color: '#1e40af',
    fontWeight: '600',
  },
  scheduleModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  confirmButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  loadMoreContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadMoreButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3b82f6',
    backgroundColor: '#ffffff',
  },
  loadMoreText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusChipText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  progressHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  noChildText: {
    fontSize: 13,
    color: '#6b7280',
    paddingVertical: 6,
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#f3f4ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bannerContent: {
    flex: 1,
    gap: 4,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3730a3',
  },
  bannerText: {
    fontSize: 12,
    color: '#4338ca',
    lineHeight: 16,
  },
  bannerDismiss: {
    padding: 4,
  },
  externalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  externalBadgeText: {
    fontSize: 12,
    color: '#3b82f6',
  },
});

