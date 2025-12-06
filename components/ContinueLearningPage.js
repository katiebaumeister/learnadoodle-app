/**
 * Continue Learning Page
 * Handles deep links to resume courses at specific positions
 * Route: /continue/{courseId}?child={childId}&lesson={lessonId}&t={timestamp}
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { Play, ArrowLeft, ExternalLink, Clock } from 'lucide-react';
import { colors } from '../theme/colors';
import { useAuth } from '../contexts/AuthContext';
import { getResumePoint, updateResumePoint, fetchCourseOutline } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import PageHeader from './ui/PageHeader';
import AppContainer from './ui/AppContainer';
import Card from './ui/Card';

export default function ContinueLearningPage({ courseId, childId, lessonId, timestamp }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [resumePoint, setResumePoint] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (courseId && childId) {
      loadCourseAndResume();
    } else {
      setError('Missing course ID or child ID');
      setLoading(false);
    }
  }, [courseId, childId]);

  const loadCourseAndResume = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get resume point from API
      const resumeResult = await getResumePoint(courseId, childId);
      if (resumeResult.error) {
        throw resumeResult.error;
      }

      setResumePoint(resumeResult.data);

      // Try to fetch course details from external_courses
      try {
        const { data: courseData, error: courseError } = await supabase
          .from('external_courses')
          .select('id, subject, public_url, external_providers(name)')
          .eq('id', courseId)
          .maybeSingle();

        if (courseData && !courseError) {
          const provider = courseData.external_providers;
          const providerName = Array.isArray(provider) ? provider[0]?.name : provider?.name || 'Unknown';
          
          setCourse({
            id: courseId,
            title: courseData.subject || 'Course',
            type: providerName.toLowerCase().includes('youtube') ? 'youtube' :
                  providerName.toLowerCase().includes('khan') ? 'khan_academy' :
                  providerName.toLowerCase().includes('coursera') ? 'coursera' : 'general',
            url: courseData.public_url,
            provider: providerName,
          });
        } else {
          // Try family_youtube_items as fallback
          const { data: ytData, error: ytError } = await supabase
            .from('family_youtube_items')
            .select('id, title_safe, public_url, kind')
            .eq('id', courseId)
            .maybeSingle();

          if (ytData && !ytError) {
            setCourse({
              id: courseId,
              title: ytData.title_safe || 'YouTube Course',
              type: 'youtube',
              url: ytData.public_url,
              provider: 'YouTube',
            });
          } else {
            // Fallback to basic course data
            setCourse({
              id: courseId,
              title: 'Course',
              type: 'general',
              url: null,
              provider: 'Unknown',
            });
          }
        }
      } catch (err) {
        console.error('Error fetching course details:', err);
        // Fallback course data
        setCourse({
          id: courseId,
          title: 'Course',
          type: 'general',
          url: null,
          provider: 'Unknown',
        });
      }
    } catch (err) {
      console.error('Error loading course:', err);
      setError(err.message || 'Failed to load course');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!course) return;

    // Build the course URL with resume point
    let courseUrl = course.url || '#';
    
    // Use timestamp from URL params if provided, otherwise use resume point
    const positionSeconds = timestamp || resumePoint?.position_seconds;
    const lessonIdToUse = lessonId || resumePoint?.lesson_id;
    
    // Handle different course types
    if (course.type === 'youtube' && positionSeconds) {
      // Add timestamp to YouTube URL
      const separator = courseUrl.includes('?') ? '&' : '?';
      courseUrl = `${courseUrl}${separator}t=${positionSeconds}s`;
    } else if (course.type === 'khan_academy' && lessonIdToUse) {
      // For Khan Academy, lesson_id might be a URL or slug
      // If it's a full URL, use it; otherwise construct URL
      if (lessonIdToUse.startsWith('http')) {
        courseUrl = lessonIdToUse;
      } else {
        // Construct Khan Academy URL from slug
        courseUrl = `https://www.khanacademy.org/${lessonIdToUse}`;
      }
    } else if (course.type === 'coursera' && lessonIdToUse) {
      // For Coursera, lesson_id might be a URL or module identifier
      if (lessonIdToUse.startsWith('http')) {
        courseUrl = lessonIdToUse;
      } else {
        // Construct Coursera URL
        courseUrl = `https://www.coursera.org/learn/${courseId}/week/${lessonIdToUse}`;
      }
    } else if (lessonIdToUse && course.type === 'general') {
      // For general courses, try to fetch lesson URL
      try {
        const { data: lessonData } = await supabase
          .from('external_lessons')
          .select('public_url')
          .eq('id', lessonIdToUse)
          .maybeSingle();
        
        if (lessonData?.public_url) {
          courseUrl = lessonData.public_url;
          if (positionSeconds && courseUrl.includes('youtube.com')) {
            const separator = courseUrl.includes('?') ? '&' : '?';
            courseUrl = `${courseUrl}${separator}t=${positionSeconds}s`;
          }
        }
      } catch (err) {
        console.error('Error fetching lesson URL:', err);
      }
    }

    // Open course URL
    if (typeof window !== 'undefined') {
      window.open(courseUrl, '_blank', 'noopener,noreferrer');
      
      // Update resume point to mark as viewed
      updateResumePoint(courseId, {
        child_id: childId,
        lesson_id: lessonIdToUse,
        position_seconds: positionSeconds,
        progress_percentage: resumePoint?.progress_percentage,
      }, course.type).catch(err => {
        console.error('Failed to update resume point:', err);
      });
      
      toast.push('Opening course...', 'success');
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading course...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Unable to Load Course</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={16} color={colors.accent} />
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title="Continue Learning"
        actions={[
          {
            label: 'Go Back',
            icon: ArrowLeft,
            onPress: handleBack,
            secondary: true,
          },
        ]}
      />

      <AppContainer>
        <Card variant="elevated" padding="lg" style={styles.courseCard}>
          <Text style={styles.courseTitle}>{course?.title || 'Course'}</Text>
          {course?.provider && (
            <Text style={styles.courseProvider}>{course.provider}</Text>
          )}
          
          {resumePoint && (
            <View style={styles.resumeInfo}>
              {resumePoint.lesson_id && (
                <View style={styles.infoRow}>
                  <Clock size={16} color={colors.muted} />
                  <Text style={styles.infoText}>
                    Resume from Lesson {resumePoint.lesson_id}
                  </Text>
                </View>
              )}
              
              {resumePoint.position_seconds && (
                <View style={styles.infoRow}>
                  <Clock size={16} color={colors.muted} />
                  <Text style={styles.infoText}>
                    At {formatTimestamp(resumePoint.position_seconds)}
                  </Text>
                </View>
              )}
              
              {resumePoint.progress_percentage && (
                <View style={styles.progressSection}>
                  <Text style={styles.progressLabel}>
                    Progress: {Math.round(resumePoint.progress_percentage)}%
                  </Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${resumePoint.progress_percentage}%` },
                      ]}
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            onPress={handleContinue}
            style={styles.continueButton}
          >
            <Play size={20} color="#ffffff" fill="#ffffff" />
            <Text style={styles.continueButtonText}>Continue Learning</Text>
            <ExternalLink size={16} color="#ffffff" />
          </TouchableOpacity>
        </Card>
      </AppContainer>
    </View>
  );
}

const formatTimestamp = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.muted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  errorText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  courseCard: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  courseTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  courseProvider: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 24,
  },
  resumeInfo: {
    marginBottom: 24,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.text,
  },
  progressSection: {
    marginTop: 8,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

