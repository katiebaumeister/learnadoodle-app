/**
 * Continue Learning Button Component
 * Shows progress and allows resuming courses with deep linking
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Play, Share2, Clock, TrendingUp } from 'lucide-react';
import { colors } from '../../theme/colors';
import { generateDeepLink, getResumePoint } from '../../lib/apiClient';
import DeepLinkModal from './DeepLinkModal';

export default function ContinueLearningButton({
  courseId,
  courseTitle,
  courseType = 'general', // 'youtube', 'khan_academy', 'coursera', 'general'
  childId,
  childName,
  lessonId = null,
  progressPercentage = 0,
  lastViewedAt = null,
  onContinue,
  showShare = true,
}) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [resumePoint, setResumePoint] = useState(null);
  const [deepLink, setDeepLink] = useState(null);

  useEffect(() => {
    // Load resume point from API
    if (courseId && childId) {
      loadResumePoint();
    }
  }, [courseId, childId]);

  const loadResumePoint = async () => {
    try {
      const result = await getResumePoint(courseId, childId);
      if (result.data && !result.error) {
        setResumePoint(result.data);
      } else if (lessonId) {
        // Fallback: use lessonId if provided
        setResumePoint({ lesson_id: lessonId });
      }
    } catch (error) {
      console.error('Error loading resume point:', error);
      // Fallback: use lessonId if provided
      if (lessonId) {
        setResumePoint({ lesson_id: lessonId });
      }
    }
  };

  const handleContinue = () => {
    if (onContinue) {
      onContinue({
        courseId,
        lessonId: resumePoint?.lesson_id || lessonId,
        courseType,
      });
    } else {
      // Default: navigate to course with resume point
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : 'https://app.learnadoodle.com';
      const url = `${baseUrl}/continue/${courseId}?child=${childId}`;
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    }
  };

  const handleShare = async (e) => {
    if (e) e.stopPropagation();
    
    // Generate deep link if not already generated
    if (!deepLink && courseId && childId) {
      try {
        const result = await generateDeepLink(courseId, childId, lessonId);
        if (result.data) {
          setDeepLink(result.data.deep_link);
        }
      } catch (err) {
        console.error('Error generating deep link:', err);
      }
    }
    
    setShowShareModal(true);
  };

  const formatLastViewed = () => {
    if (!lastViewedAt) return null;
    const date = new Date(lastViewedAt);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const getProgressColor = () => {
    if (progressPercentage >= 75) return '#10b981'; // green
    if (progressPercentage >= 50) return '#3b82f6'; // blue
    if (progressPercentage >= 25) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  return (
    <>
      <View style={styles.container}>
        {/* Progress Bar */}
        {progressPercentage > 0 && (
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressPercentage}%`,
                    backgroundColor: getProgressColor(),
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(progressPercentage)}% complete
            </Text>
          </View>
        )}

        {/* Main Button Area */}
        <View style={styles.buttonArea}>
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Play size={16} color={colors.accent} />
              <Text style={styles.continueText}>
                {resumePoint || lessonId 
                  ? `Continue from Lesson ${lessonId || 'current'}`
                  : 'Start Learning'}
              </Text>
            </View>
            {lastViewedAt && (
              <View style={styles.infoRow}>
                <Clock size={14} color={colors.muted} />
                <Text style={styles.lastViewedText}>
                  Last viewed {formatLastViewed()}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actionButtons}>
            {showShare && (
              <TouchableOpacity
                onPress={handleShare}
                style={styles.shareButton}
              >
                <Share2 size={16} color={colors.accent} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleContinue}
              style={styles.continueButton}
            >
              <Play size={18} color="#ffffff" fill="#ffffff" />
              <Text style={styles.continueButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Share Modal */}
      <DeepLinkModal
        visible={showShareModal}
        courseId={courseId}
        courseTitle={courseTitle}
        childId={childId}
        childName={childName}
        lessonId={resumePoint?.lesson_id || lessonId}
        onClose={() => setShowShareModal(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    }),
  },
  progressSection: {
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'right',
  },
  buttonArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoSection: {
    flex: 1,
    marginRight: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  continueText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  lastViewedText: {
    fontSize: 12,
    color: colors.muted,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareButton: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

