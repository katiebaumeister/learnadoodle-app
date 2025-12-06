/**
 * Parent Coaching Module
 * Provides tips, guidance, and coaching for parents
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { 
  Lightbulb, BookOpen, Target, TrendingUp, Users, Clock, Calendar,
  CheckCircle, ArrowRight, Star, AlertCircle
} from 'lucide-react';
import { colors } from '../../theme/colors';

const COACHING_CATEGORIES = [
  { id: 'planning', label: 'Planning', icon: Calendar },
  { id: 'motivation', label: 'Motivation', icon: Target },
  { id: 'pacing', label: 'Pacing', icon: Clock },
  { id: 'engagement', label: 'Engagement', icon: Users },
  { id: 'assessment', label: 'Assessment', icon: TrendingUp },
];

const COACHING_TIPS = {
  planning: [
    {
      title: 'Start with the Big Picture',
      description: 'Create a year plan first, then break it down into terms and weeks. This helps you see the full scope and adjust pacing as needed.',
      priority: 'high',
    },
    {
      title: 'Use Weekly Objectives',
      description: 'Set 2-3 clear objectives per week per subject. This keeps learning focused and measurable.',
      priority: 'medium',
    },
    {
      title: 'Build in Flexibility',
      description: 'Leave 20% of your schedule open for catch-up, exploration, and unexpected opportunities.',
      priority: 'high',
    },
  ],
  motivation: [
    {
      title: 'Celebrate Small Wins',
      description: 'Acknowledge daily progress, not just major milestones. Small celebrations build momentum.',
      priority: 'high',
    },
    {
      title: 'Connect Learning to Interests',
      description: 'Link subjects to your child\'s passions. Math becomes more engaging when applied to their favorite hobbies.',
      priority: 'medium',
    },
    {
      title: 'Use Gamification',
      description: 'Points, badges, and streaks can motivate children who respond well to game-like elements.',
      priority: 'medium',
    },
  ],
  pacing: [
    {
      title: 'Follow Your Child\'s Pace',
      description: 'Don\'t rush through material. Mastery is more important than speed. Adjust the schedule based on understanding.',
      priority: 'high',
    },
    {
      title: 'Review Regularly',
      description: 'Build in weekly review sessions. Spaced repetition improves retention significantly.',
      priority: 'high',
    },
    {
      title: 'Watch for Signs of Overload',
      description: 'If your child is consistently struggling or showing stress, reduce the workload and extend timelines.',
      priority: 'high',
    },
  ],
  engagement: [
    {
      title: 'Vary Activities',
      description: 'Mix reading, hands-on projects, videos, and discussions. Different modalities keep learning fresh.',
      priority: 'medium',
    },
    {
      title: 'Involve Your Child in Planning',
      description: 'Let them choose topics or projects. Ownership increases engagement and motivation.',
      priority: 'medium',
    },
    {
      title: 'Create Real-World Connections',
      description: 'Show how what they\'re learning applies to everyday life. This makes abstract concepts concrete.',
      priority: 'medium',
    },
  ],
  assessment: [
    {
      title: 'Use Multiple Assessment Methods',
      description: 'Combine quizzes, projects, discussions, and observations. Different methods reveal different strengths.',
      priority: 'high',
    },
    {
      title: 'Focus on Growth, Not Just Grades',
      description: 'Track improvement over time. A child who goes from struggling to understanding has made real progress.',
      priority: 'high',
    },
    {
      title: 'Regular Check-ins',
      description: 'Weekly conversations about what\'s working and what\'s challenging help you adjust in real-time.',
      priority: 'medium',
    },
  ],
};

export default function ParentCoachingModule({ familyId, childId }) {
  const [activeCategory, setActiveCategory] = useState('planning');
  const [completedTips, setCompletedTips] = useState(new Set());

  const toggleTipComplete = (category, tipIndex) => {
    const key = `${category}-${tipIndex}`;
    setCompletedTips(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const activeTips = COACHING_TIPS[activeCategory] || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Lightbulb size={24} color={colors.accent || '#3b82f6'} />
          <View>
            <Text style={styles.title}>Parent Coaching</Text>
            <Text style={styles.subtitle}>Tips and guidance for effective homeschooling</Text>
          </View>
        </View>
      </View>

      {/* Categories */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {COACHING_CATEGORIES.map(category => {
          const Icon = category.icon;
          const isActive = activeCategory === category.id;
          return (
            <TouchableOpacity
              key={category.id}
              style={[styles.categoryCard, isActive && styles.categoryCardActive]}
              onPress={() => setActiveCategory(category.id)}
            >
              <Icon 
                size={20} 
                color={isActive ? colors.accent || '#3b82f6' : colors.muted || '#6b7280'} 
              />
              <Text style={[
                styles.categoryLabel,
                isActive && styles.categoryLabelActive
              ]}>
                {category.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Tips */}
      <ScrollView style={styles.content}>
        {activeTips.map((tip, idx) => {
          const tipKey = `${activeCategory}-${idx}`;
          const isCompleted = completedTips.has(tipKey);
          const isHighPriority = tip.priority === 'high';

          return (
            <View 
              key={idx} 
              style={[
                styles.tipCard,
                isHighPriority && styles.tipCardHighPriority,
                isCompleted && styles.tipCardCompleted,
              ]}
            >
              <View style={styles.tipHeader}>
                <View style={styles.tipHeaderLeft}>
                  {isHighPriority && (
                    <Star size={16} color={colors.yellowBold || '#f59e0b'} />
                  )}
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => toggleTipComplete(activeCategory, idx)}
                  style={styles.completeButton}
                >
                  {isCompleted ? (
                    <CheckCircle size={20} color={colors.greenBold || '#10b981'} />
                  ) : (
                    <View style={styles.completeButtonEmpty} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.tipDescription}>{tip.description}</Text>
              <View style={styles.tipFooter}>
                <View style={[
                  styles.priorityBadge,
                  isHighPriority && styles.priorityBadgeHigh,
                ]}>
                  <Text style={styles.priorityText}>
                    {tip.priority === 'high' ? 'High Priority' : 'Recommended'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Progress Summary */}
      <View style={styles.footer}>
        <View style={styles.progressSummary}>
          <Text style={styles.progressText}>
            {completedTips.size} tip{completedTips.size !== 1 ? 's' : ''} completed
          </Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressBarFill,
                { width: `${(completedTips.size / Object.values(COACHING_TIPS).flat().length) * 100}%` }
              ]} 
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg || '#ffffff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
    marginTop: 4,
  },
  categoriesContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  categoriesContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  categoryCardActive: {
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderColor: colors.accent || '#3b82f6',
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted || '#6b7280',
  },
  categoryLabelActive: {
    color: colors.accent || '#3b82f6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  tipCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  tipCardHighPriority: {
    borderColor: colors.yellowBold || '#f59e0b',
    borderWidth: 2,
    backgroundColor: '#fffbeb',
  },
  tipCardCompleted: {
    opacity: 0.7,
  },
  tipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
    flex: 1,
  },
  completeButton: {
    padding: 4,
  },
  completeButtonEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border || '#e5e7eb',
  },
  tipDescription: {
    fontSize: 14,
    color: colors.text || '#111827',
    lineHeight: 20,
    marginBottom: 12,
  },
  tipFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.muted || '#9ca3af',
    borderRadius: 12,
  },
  priorityBadgeHigh: {
    backgroundColor: colors.yellowBold || '#f59e0b',
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  progressSummary: {
    gap: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border || '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent || '#3b82f6',
    borderRadius: 4,
  },
});

