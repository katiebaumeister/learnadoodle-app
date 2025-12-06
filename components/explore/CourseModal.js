import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator, Modal } from 'react-native';
import { X, ExternalLink, BookOpen, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import ContinueLearningButton from '../content/ContinueLearningButton';

export default function CourseModal({
  visible,
  course,
  outline,
  outlineLoading,
  outlineError,
  activeChildId,
  children = [],
  courseResumePoint,
  progressByLesson = {},
  onClose,
  onLoadOutline,
  onOpenCourse,
  onSchedule,
  onScheduleAutomatically,
  onProgressUpdate,
  schedulingAuto,
}) {
  if (!course) return null;

  const sourceUrl = course.source_url || course.public_url || '';
  const truncatedUrl = sourceUrl.length > 60 
    ? `${sourceUrl.substring(0, 57)}...` 
    : sourceUrl;

  const cycleStatus = (current) => {
    const order = ['not_started', 'in_progress', 'done', 'skipped'];
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
  };

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
    <View style={styles.overlay}>
      <View style={styles.modal}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.providerLabel}>
              {course.provider_name?.toUpperCase() || 'EXTERNAL'}
            </Text>
            <Text style={styles.courseTitle}>
              {course.subject || course.title || 'Course'}
              {course.grade_band ? ` • ${course.grade_band}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Attribution */}
        {course.attribution_text && (
          <View style={styles.attribution}>
            <Text style={styles.attributionText}>{course.attribution_text}</Text>
          </View>
        )}

        {/* Source URL */}
        {sourceUrl && (
          <View style={styles.sourceSection}>
            <Text style={styles.sourceLabel}>Source: </Text>
            <TouchableOpacity onPress={onOpenCourse}>
              <Text style={styles.sourceLink} numberOfLines={1} title={sourceUrl}>
                {truncatedUrl}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Main body - Lesson outline */}
        <ScrollView style={styles.body}>
          {outlineLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Loading outline…</Text>
            </View>
          ) : outlineError ? (
            <View style={styles.errorContainer}>
              <AlertCircle size={48} color="#ef4444" />
              <Text style={styles.errorTitle}>Error Loading Outline</Text>
              <Text style={styles.errorMessage}>{outlineError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => onLoadOutline?.(course.id)}>
                <RefreshCw size={16} color="#ffffff" />
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : outline && outline.units && outline.units.length > 0 ? (
            <View style={styles.outlineContent}>
              {outline.units.map((unit) => (
                <View key={unit.ordinal} style={styles.unitCard}>
                  <Text style={styles.unitTitle}>
                    {unit.ordinal}. {unit.title_safe}
                  </Text>
                  <View style={styles.lessonsList}>
                    {unit.lessons?.map((lesson) => {
                      const lessonId = lesson.id;
                      const status = progressByLesson[lessonId] || 'not_started';
                      const nextStatus = cycleStatus(status);
                      return (
                        <View key={lesson.ordinal} style={styles.lessonItem}>
                          <View style={styles.lessonInfo}>
                            <Text style={styles.lessonText}>
                              {unit.ordinal}.{lesson.ordinal} {lesson.title_safe}
                              {lesson.resource_type ? ` • ${lesson.resource_type}` : ''}
                            </Text>
                            <View style={styles.lessonActions}>
                              <TouchableOpacity
                                style={[
                                  styles.statusChip,
                                  { backgroundColor: statusColorMap[status] || '#d1d5db' },
                                ]}
                                onPress={() => onProgressUpdate?.(lessonId || lesson.public_url, nextStatus)}
                              >
                                <Text style={styles.statusChipText}>
                                  {statusLabelMap[status] || 'Not Started'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  if (Platform.OS === 'web' && lesson.public_url) {
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
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <BookOpen size={48} color="#9ca3af" />
              <Text style={styles.emptyText}>No outline available</Text>
              <Text style={styles.emptySubtext}>
                This course doesn&apos;t have a detailed outline yet.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Continue from current lesson row */}
        {activeChildId && courseResumePoint && (
          <View style={styles.continueRow}>
            <View style={styles.continueCard}>
              <ContinueLearningButton
                courseId={course.id}
                courseTitle={course.subject || course.title || 'Course'}
                courseType={course.provider_name?.toLowerCase().includes('youtube') ? 'youtube' :
                             course.provider_name?.toLowerCase().includes('khan') ? 'khan_academy' :
                             course.provider_name?.toLowerCase().includes('coursera') ? 'coursera' : 'general'}
                childId={activeChildId}
                childName={children.find(c => c.id === activeChildId)?.first_name || 'Student'}
                lessonId={courseResumePoint.lesson_id}
                progressPercentage={courseResumePoint.progress_percentage || 0}
                lastViewedAt={courseResumePoint.last_viewed_at}
                showShare={true}
              />
            </View>
          </View>
        )}

        {/* Footer actions */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerButton, styles.footerButtonPrimary]}
            onPress={() => onScheduleAutomatically?.(course)}
            disabled={schedulingAuto || !activeChildId}
          >
            {schedulingAuto ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Calendar size={16} color="#ffffff" />
                <Text style={styles.footerButtonTextPrimary}>
                  {activeChildId ? 'Schedule automatically' : 'Schedule this course'}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={onOpenCourse}
          >
            <ExternalLink size={16} color="#3b82f6" />
            <Text style={styles.footerButtonText}>Open course</Text>
          </TouchableOpacity>
          {outline && (
            <TouchableOpacity
              style={styles.footerButton}
              onPress={() => {
                // Outline is already shown, but we can scroll to top or just close
                onClose?.();
              }}
            >
              <BookOpen size={16} color="#3b82f6" />
              <Text style={styles.footerButtonText}>View outline</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Compliance text */}
        <Text style={styles.complianceText}>
          Lesson metadata and links provided for convenience. © Original content belongs to the provider.
          {course.license && ` ${course.provider_name} content is licensed ${course.license}.`}
          {' '}Learnadoodle links externally, displays provider attribution, and does not host or reproduce provider materials.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  providerLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: '#6b7280',
    letterSpacing: 0.5,
    marginBottom: 4,
    fontWeight: '600',
  },
  courseTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 28,
  },
  closeButton: {
    padding: 4,
  },
  attribution: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  attributionText: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  sourceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sourceLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  sourceLink: {
    fontSize: 12,
    color: '#3b82f6',
    textDecorationLine: 'underline',
    flex: 1,
  },
  body: {
    maxHeight: 400,
    marginTop: 8,
    marginBottom: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
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
  outlineContent: {
    gap: 16,
  },
  unitCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  lessonInfo: {
    gap: 8,
  },
  lessonText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  lessonActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  lessonLink: {
    fontSize: 14,
    color: '#3b82f6',
    textDecorationLine: 'underline',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  continueRow: {
    marginTop: 12,
    marginBottom: 12,
  },
  continueCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 8,
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  footerButton: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  footerButtonPrimary: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  footerButtonTextPrimary: {
    color: '#ffffff',
    fontWeight: '600',
  },
  complianceText: {
    fontSize: 10,
    color: '#9ca3af',
    lineHeight: 16,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
});

