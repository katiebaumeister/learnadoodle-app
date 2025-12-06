/**
 * Courses & Syllabi Tab
 * Course list, unit breakdown, evidence links, gaps
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { BookOpen, ExternalLink, Calendar, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';
import CourseDetailsDrawer from '../CourseDetailsDrawer';

export default function CoursesSyllabiTab({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  resolvedChildIds,
  onOpenPlanner,
  onOpenExplore,
}) {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    loadCourses();
  }, [familyId, resolvedChildIds, dateRange]);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const { getCoursesAndSyllabi } = await import('../../../lib/services/recordsClient');
      const coursesData = await getCoursesAndSyllabi(familyId, resolvedChildIds, dateRange);
      
      if (coursesData && coursesData.length > 0) {
        setCourses(coursesData);
        setLoading(false);
        return;
      }
    } catch (error) {
      console.warn('Error loading courses from service:', error);
    }
    
    // Fallback: Try to load from syllabi table directly
    try {
      // Try without provider_name first (column may not exist)
        const { data: syllabi, error } = await supabase
          .from('syllabi')
        .select('id, title, child_id, subject_id')
        .eq('family_id', familyId)
        .in('child_id', resolvedChildIds.length > 0 ? resolvedChildIds : [null]);
      
      if (error) {
        // Handle permission errors gracefully
        if (error.code === '42501' || error.code === 'PGRST301') {
          // Permission denied is expected if RLS is enabled - only log in development
          if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
            console.warn('[CoursesSyllabiTab] Permission denied for syllabi table - this is expected if RLS is enabled');
          }
          setCourses([]);
        } else if (error.code === '42703') {
          // Column doesn't exist - try a simpler query (only log in development)
          if (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production') {
            console.warn('[CoursesSyllabiTab] Column error, trying simpler query:', error);
          }
          const { data: simpleData, error: simpleError } = await supabase
            .from('syllabi')
            .select('id, title, child_id')
          .eq('family_id', familyId)
          .in('child_id', resolvedChildIds.length > 0 ? resolvedChildIds : [null]);
        
          if (simpleError) {
            // Only log unexpected errors
            const isExpectedError = simpleError.code === '42501' || 
                                   simpleError.code === 'PGRST301' ||
                                   simpleError.message?.includes('permission');
            if (!isExpectedError && (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production')) {
              console.warn('[CoursesSyllabiTab] Error loading syllabi (simple query):', simpleError);
            }
            setCourses([]);
          } else if (simpleData && simpleData.length > 0) {
            const mapped = simpleData.map(syllabus => ({
              id: syllabus.id,
              title: syllabus.title || 'Untitled Course',
              provider: 'Custom',
              progress: 0,
              units: 0,
              artifacts: 0,
              gaps: [],
            }));
            setCourses(mapped);
          } else {
            setCourses([]);
          }
        } else {
          // Only log unexpected errors
          const isExpectedError = error.code === '42501' || 
                                 error.code === 'PGRST301' ||
                                 error.message?.includes('permission');
          if (!isExpectedError && __DEV__) {
            console.warn('[CoursesSyllabiTab] Error loading syllabi:', error);
          }
          setCourses([]);
        }
      } else if (syllabi && syllabi.length > 0) {
          // Map syllabi to course format
          const mapped = syllabi.map(syllabus => ({
            id: syllabus.id,
            title: syllabus.title || 'Untitled Course',
          provider: 'Custom', // provider_name column doesn't exist, default to Custom
            progress: 0, // TODO: Calculate from events
            units: 0, // TODO: Get from syllabus_sections
            artifacts: 0, // TODO: Count linked uploads
            gaps: [],
          }));
          setCourses(mapped);
        } else {
          // No courses/syllabi found
          setCourses([]);
      }
    } catch (error) {
      // Only log unexpected errors
      const isExpectedError = error.code === '42501' || 
                             error.code === 'PGRST301' ||
                             error.message?.includes('permission');
      if (!isExpectedError && __DEV__) {
        console.warn('[CoursesSyllabiTab] Exception loading courses:', error);
      }
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Tab Header */}
      <View style={styles.tabHeader}>
        <View style={[styles.accentDot, { backgroundColor: '#f97316' }]} />
        <BookOpen size={20} color="#f97316" />
        <Text style={styles.tabTitle}>Courses & Syllabi</Text>
      </View>

      {/* Course List */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <BookOpen size={20} color="#f97316" />
          <Text style={styles.sectionTitle}>Courses</Text>
        </View>
        <View style={styles.coursesList}>
          {courses.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyContent}>
                <Text style={styles.emptyTitle}>Upload a syllabus to begin tracking progress</Text>
                <View style={styles.emptyBullets}>
                  <View style={styles.emptyBullet}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.emptyDescription}>
                      AI can parse syllabus into units + lessons
                    </Text>
                  </View>
                  <View style={styles.emptyBullet}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.emptyDescription}>
                      Track progress automatically as you complete lessons
                    </Text>
                  </View>
                  <View style={styles.emptyBullet}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.emptyDescription}>
                      Link evidence and artifacts to specific units
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.emptyCTA}
                  onPress={() => onOpenExplore?.('syllabus')}
                >
                  <BookOpen size={16} color={colors.white} />
                  <Text style={styles.emptyCTAText}>Upload Syllabus</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.emptyLink}
                  onPress={() => {
                    // TODO: Navigate to example syllabi
                    console.log('Show example syllabi');
                  }}
                >
                  <Text style={styles.emptyLinkText}>See example syllabi →</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            courses.map(course => (
            <TouchableOpacity
              key={course.id}
              style={styles.courseCard}
              onPress={() => {
                setSelectedCourseId(course.id);
                setIsDrawerOpen(true);
              }}
            >
              <View style={styles.courseHeader}>
                <Text style={styles.courseTitle}>{course.title}</Text>
                <Text style={styles.courseProvider}>{course.provider}</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${course.progress}%` }]} />
              </View>
              <Text style={styles.progressText}>{course.progress}% complete</Text>
              <View style={styles.courseMeta}>
                <Text style={styles.courseMetaText}>{course.units} units</Text>
                <Text style={styles.courseMetaText}>•</Text>
                <Text style={styles.courseMetaText}>{course.artifacts} artifacts</Text>
              </View>
              {course.gaps.length > 0 && (
                <View style={styles.gapsIndicator}>
                  <AlertCircle size={14} color={colors.orange} />
                  <Text style={styles.gapsText}>{course.gaps.length} gaps</Text>
                </View>
              )}
            </TouchableOpacity>
            ))
          )}
        </View>
      </View>

      {/* Course Details Drawer */}
      <CourseDetailsDrawer
        isOpen={isDrawerOpen}
        courseId={selectedCourseId}
        familyId={familyId}
        children={children}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedCourseId(null);
        }}
        onNavigateToPlanner={({ courseId, unitId }) => {
          // Navigate to planner with course/unit filters
          const url = unitId
            ? `/planner?view=board&course=${courseId}&unit=${unitId}`
            : `/planner?view=board&course=${courseId}`;
          
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (window.__ldSearchNavigate) {
              const params = { view: 'board', course: courseId };
              if (unitId) params.unit = unitId;
              window.__ldSearchNavigate('planner', null, params);
            } else {
              window.location.href = url;
            }
          }
        }}
        onNavigateToPortfolio={({ courseId, unitId }) => {
          const url = unitId
            ? `/records?tab=portfolio&course=${courseId}&unit=${unitId}`
            : `/records?tab=portfolio&course=${courseId}`;
          
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (window.__ldSearchNavigate) {
              const params = { tab: 'portfolio', course: courseId };
              if (unitId) params.unit = unitId;
              window.__ldSearchNavigate('records', null, params);
            } else {
              window.location.href = url;
            }
          }
        }}
      />

      {/* Legacy Course Details Modal (keeping for backward compatibility) */}
      {selectedCourse && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedCourse.title}</Text>
              <TouchableOpacity onPress={() => setSelectedCourse(null)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Progress</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${selectedCourse.progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{selectedCourse.progress}% complete</Text>
              </View>
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Unit Breakdown</Text>
                <Text style={styles.modalText}>
                  {selectedCourse.units} units total. Click to view unit details, linked events, and evidence.
                </Text>
              </View>
              {selectedCourse.gaps.length > 0 && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Gaps</Text>
                  {selectedCourse.gaps.map((gap, idx) => (
                    <View key={idx} style={styles.gapItem}>
                      <AlertCircle size={14} color={colors.orange} />
                      <Text style={styles.gapText}>{gap}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalActionButton}
                  onPress={() => onOpenPlanner?.(selectedCourse.id)}
                >
                  <Calendar size={16} color={colors.indigo} />
                  <Text style={styles.modalActionText}>Open in Planner</Text>
                </TouchableOpacity>
                {selectedCourse.provider !== 'Custom' && (
                  <TouchableOpacity
                    style={styles.modalActionButton}
                    onPress={() => onOpenExplore?.(selectedCourse.provider)}
                  >
                    <ExternalLink size={16} color={colors.indigo} />
                    <Text style={styles.modalActionText}>Open in Explore</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  coursesList: {
    gap: 12,
  },
  courseCard: {
    padding: 16,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  courseHeader: {
    marginBottom: 12,
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  courseProvider: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.indigo,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  courseMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  courseMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  gapsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  gapsText: {
    fontSize: 12,
    color: colors.orange,
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    fontSize: 14,
    color: colors.indigo,
    fontWeight: '500',
  },
  modalBody: {
    flex: 1,
  },
  modalSection: {
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  gapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: colors.panel,
    borderRadius: 6,
    marginBottom: 6,
  },
  gapText: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  modalActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalActionText: {
    fontSize: 14,
    color: colors.indigo,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 40,
  },
  emptyState: {
    padding: 24,
  },
  emptyContent: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyBullets: {
    gap: 12,
    marginBottom: 24,
    width: '100%',
    maxWidth: 400,
  },
  emptyBullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.indigo,
    marginTop: 6,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    flex: 1,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
    marginBottom: 12,
  },
  emptyCTAText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  emptyLink: {
    paddingVertical: 8,
  },
  emptyLinkText: {
    fontSize: 14,
    color: colors.indigo,
    fontWeight: '500',
  },
});

