import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { ExternalLink, BookOpen, Calendar, Share2 } from 'lucide-react';
import ContinueLearningButton from '../content/ContinueLearningButton';

export default function CourseCard({
  course,
  activeChildId,
  children = [],
  courseResumePoint,
  onOpenCourse,
  onViewOutline,
  onSchedule,
  onCardPress,
}) {
  const sourceUrl = course.source_url || course.public_url || '';
  const truncatedUrl = sourceUrl.length > 50 
    ? `${sourceUrl.substring(0, 47)}...` 
    : sourceUrl;

  return (
    <TouchableOpacity 
      style={styles.card}
      onPress={onCardPress}
      activeOpacity={0.7}
    >
      {/* Top row: Provider + Title */}
      <View style={styles.topRow}>
        <View style={styles.leftSection}>
          <Text style={styles.providerLabel}>
            {course.provider_name?.toUpperCase() || 'EXTERNAL'} • Link-only
          </Text>
          <Text style={styles.courseTitle}>
            {course.subject || course.title || 'Course'}
            {course.grade_band ? ` • ${course.grade_band}` : ''}
          </Text>
        </View>
      </View>

      {/* Middle row: Last viewed + Progress + Tags */}
      <View style={styles.middleRow}>
        {activeChildId && courseResumePoint?.last_viewed_at && (
          <Text style={styles.lastViewed}>
            Last viewed {formatLastViewed(courseResumePoint.last_viewed_at)}
          </Text>
        )}
        {courseResumePoint?.progress_percentage > 0 && (
          <Text style={styles.progress}>
            {Math.round(courseResumePoint.progress_percentage)}% complete
          </Text>
        )}
        <View style={styles.tags}>
          {course.subject_key && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{course.subject_key}</Text>
            </View>
          )}
          {course.stage_key && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{course.stage_key}</Text>
            </View>
          )}
          {activeChildId && children.find(c => c.id === activeChildId) && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {children.find(c => c.id === activeChildId)?.first_name || 'Student'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom row: Action buttons */}
      <View style={styles.bottomRow}>
        <View style={styles.footerLeft}>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={(e) => {
              e.stopPropagation();
              onOpenCourse?.();
            }}
          >
            <ExternalLink size={14} color="#3b82f6" />
            <Text style={styles.footerButtonText}>Open course</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={(e) => {
              e.stopPropagation();
              onViewOutline?.();
            }}
          >
            <BookOpen size={14} color="#3b82f6" />
            <Text style={styles.footerButtonText}>View outline</Text>
          </TouchableOpacity>
          {activeChildId && (
            <TouchableOpacity
              style={[styles.footerButton, styles.footerButtonPrimary]}
              onPress={(e) => {
                e.stopPropagation();
                onSchedule?.();
              }}
            >
              <Calendar size={14} color="#10b981" />
              <Text style={[styles.footerButtonText, styles.footerButtonTextPrimary]}>Schedule</Text>
            </TouchableOpacity>
          )}
        </View>
        {activeChildId && courseResumePoint && (
          <TouchableOpacity
            style={styles.continueButton}
            onPress={(e) => {
              e.stopPropagation();
              onOpenCourse?.();
            }}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Source URL */}
      {sourceUrl && (
        <View style={styles.sourceRow}>
          <Text style={styles.sourceLabel}>Source: </Text>
          <Text style={styles.sourceUrl} numberOfLines={1}>
            {truncatedUrl}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatLastViewed(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  leftSection: {
    flex: 1,
    marginRight: 12,
  },
  providerLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 22,
    marginBottom: 4,
  },
  middleRow: {
    marginBottom: 10,
    gap: 4,
  },
  lastViewed: {
    fontSize: 12,
    color: '#6b7280',
  },
  progress: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 11,
    color: '#6b7280',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexWrap: 'wrap',
    gap: 8,
  },
  footerLeft: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  footerButtonPrimary: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  footerButtonText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '500',
  },
  footerButtonTextPrimary: {
    color: '#10b981',
  },
  continueButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  sourceRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  sourceLabel: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '600',
  },
  sourceUrl: {
    fontSize: 10,
    color: '#9ca3af',
    flex: 1,
  },
});

