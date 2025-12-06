import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Platform } from 'react-native';
import { AlertCircle, RefreshCw, BookOpen, Filter, X } from 'lucide-react';
import { fetchExternalCourses, fetchCourseOutline, scheduleExternalCourse, fetchExternalProgress, upsertExternalProgress, getResumePoint } from '../lib/apiClient';
import { useToast } from './Toast';
import ExploreNoticeBanner from './explore/ExploreNoticeBanner';
import AddFromLinkCard from './explore/AddFromLinkCard';
import ExploreFiltersBar from './explore/ExploreFiltersBar';
import CourseCard from './explore/CourseCard';
import CourseModal from './explore/CourseModal';
import PageHeader from './ui/PageHeader';
import AppContainer from './ui/AppContainer';
import EmptyState from './ui/EmptyState';

const LIMIT = 24;

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
  const [courseResumePoints, setCourseResumePoints] = useState({});
  const [progressLoading, setProgressLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null);
  const toast = useToast();
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [modalCourse, setModalCourse] = useState(null);
  const [schedulingAuto, setSchedulingAuto] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

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

  const handleLoadMore = () => {
    if (loadingMore || courses.length >= total) return;
    loadCourses(true, courses.length);
  };

  const hasMore = courses.length < total;

  useEffect(() => {
    setOffset(0);
  }, [filters.subjectKey, filters.stageKey, debouncedSearch]);

  useEffect(() => {
    setScheduleParams((prev) => ({ ...prev, childId: activeChildId }));
    if (outline) {
      loadProgress(activeChildId);
    }
  }, [activeChildId, outline, loadProgress]);

  const loadResumePointsForCourses = useCallback(async () => {
    if (!activeChildId || courses.length === 0) return;
    
    try {
      const resumePromises = courses.map(async (course) => {
        try {
          const result = await getResumePoint(course.id, activeChildId);
          if (result.data && !result.error) {
            return { courseId: course.id, resumePoint: result.data };
          }
        } catch (err) {
          console.error(`Error loading resume point for course ${course.id}:`, err);
        }
        return null;
      });
      
      const results = await Promise.all(resumePromises);
      const resumeMap = {};
      results.forEach(result => {
        if (result) {
          resumeMap[result.courseId] = result.resumePoint;
        }
      });
      
      setCourseResumePoints(resumeMap);
    } catch (err) {
      console.error('Error loading resume points:', err);
    }
  }, [activeChildId, courses]);

  useEffect(() => {
    if (activeChildId && courses.length > 0) {
      loadResumePointsForCourses();
    } else {
      setCourseResumePoints({});
    }
  }, [activeChildId, courses.length, loadResumePointsForCourses]);

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

  const handleScheduleAutomatically = async (course) => {
    if (!activeChildId) {
      toast.push('Please select a child', 'error');
      return;
    }

    setSchedulingAuto(true);
    try {
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

  const handleOpenCourse = (course) => {
    if (Platform.OS === 'web') {
      const url = course.source_url || course.public_url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleViewOutline = (course) => {
    setModalCourse(course);
    setShowCourseModal(true);
    loadOutline(course.id);
  };

  const handleCardPress = (course) => {
    setModalCourse(course);
    setShowCourseModal(true);
    loadOutline(course.id);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <PageHeader
        title="Explore"
        subtitle="Link-only catalog of external educational content"
        actions={
          noticeDismissed
            ? [
                {
                  label: 'Third-Party Content Notice',
                  onPress: () => setNoticeDismissed(false),
                  secondary: true,
                },
              ]
            : []
        }
      />

      {/* Notice Banner */}
      {!noticeDismissed && (
        <ExploreNoticeBanner onDismissedChange={setNoticeDismissed} />
      )}

      {/* Add From Link Card */}
      <AddFromLinkCard
        familyId={familyId}
        children={children}
        onCreated={(data) => {
          if (data?.course_id) {
            loadCourses(false, 0);
          }
        }}
      />

      {/* Filters Bar */}
      <ExploreFiltersBar
        children={children}
        activeChildId={activeChildId}
        onChildChange={setActiveChildId}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Divider */}
      <View style={styles.divider} />

      {/* Course List */}
      <AppContainer fullWidth noPadding>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading courses...</Text>
          <Text style={styles.loadingSubtext}>Searching our catalog...</Text>
        </View>
      ) : error && courses.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            iconColor="#ef4444"
            title={
              errorType === 'network' ? 'Connection Error' : errorType === 'server' ? 'Server Error' : 'Error Loading Courses'
            }
            description={
              errorType === 'network'
              ? 'Unable to connect to the server. Please check your internet connection.'
              : errorType === 'server'
                ? 'The server encountered an error. Please try again in a moment.'
                  : error || 'An unexpected error occurred.'
            }
            action={{
              label: 'Retry',
              icon: RefreshCw,
              onPress: () => loadCourses(false, 0),
            }}
            size="default"
          />
      ) : courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={filtersActive ? 'No courses found' : 'No courses added yet'}
            description={
              filtersActive
                ? 'No courses match your current filters. Try adjusting your search or clearing filters to see more options.'
                : 'Paste a link to get started or browse providers.'
            }
            action={
              filtersActive
                ? {
                    label: 'Clear Filters',
                    icon: Filter,
                    onPress: () => {
                setFilters({ subjectKey: null, stageKey: null, search: '' });
                    },
                    secondary: true,
                  }
                : undefined
            }
            size="default"
          />
      ) : (
        <ScrollView style={styles.coursesList} contentContainerStyle={styles.coursesListContent}>
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              activeChildId={activeChildId}
              children={children}
              courseResumePoint={courseResumePoints[course.id]}
              onOpenCourse={() => handleOpenCourse(course)}
              onViewOutline={() => handleViewOutline(course)}
              onSchedule={() => handleScheduleAutomatically(course)}
              onCardPress={() => handleCardPress(course)}
            />
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
      </AppContainer>

      {/* Course Modal */}
      {modalCourse && (
        <Modal
          visible={showCourseModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => {
            setShowCourseModal(false);
            setModalCourse(null);
            setOutline(null);
            setOutlineError(null);
          }}
        >
          <CourseModal
            visible={showCourseModal}
            course={modalCourse}
            outline={outline}
            outlineLoading={outlineLoading}
            outlineError={outlineError}
            activeChildId={activeChildId}
            children={children}
            courseResumePoint={courseResumePoints[modalCourse.id]}
            progressByLesson={progressByLesson}
            onClose={() => {
              setShowCourseModal(false);
              setModalCourse(null);
              setOutline(null);
              setOutlineError(null);
            }}
            onLoadOutline={(courseId) => loadOutline(courseId)}
            onOpenCourse={() => handleOpenCourse(modalCourse)}
            onSchedule={() => setShowScheduleModal(true)}
            onScheduleAutomatically={handleScheduleAutomatically}
            onProgressUpdate={handleProgressUpdate}
            schedulingAuto={schedulingAuto}
          />
        </Modal>
      )}

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
                <Text style={styles.input}>{scheduleParams.startDate}</Text>
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
    paddingBottom: 16,
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
    marginBottom: 4,
  },
  noticeLink: {
    marginTop: 4,
  },
  noticeLinkText: {
    fontSize: 12,
    color: '#3b82f6',
    textDecorationLine: 'underline',
  },
  divider: {
    marginTop: 4,
    marginBottom: 8,
    marginHorizontal: 16,
    height: 1,
    backgroundColor: '#e5e7eb',
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
    paddingTop: 8,
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
    backgroundColor: '#f9fafb',
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
});
