import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Sparkles, Calendar, BookOpen, CheckCircle, AlertCircle } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

const iconMap = {
  'sparkles': Sparkles,
  'calendar-off': Calendar,
  'calendar-check': Calendar,
  'book-open': BookOpen,
  'check-circle': CheckCircle,
  'alert-circle': AlertCircle,
};

const tagColors = {
  'Planner': { bg: colors.blueSoft, text: colors.blueBold },
  'Tip': { bg: colors.violetSoft, text: colors.violetBold },
  'Event': { bg: colors.orangeSoft, text: colors.orangeBold },
  'Article': { bg: colors.greenSoft, text: colors.greenBold },
  'Progress': { bg: colors.greenSoft, text: colors.greenBold },
  'Celebrate': { bg: colors.yellowSoft, text: colors.yellowBold },
};

export default function StoriesRow({ 
  stories = [], 
  onGenerateTips, 
  currentDate = new Date(),
  onStoryAction 
}) {
  const dateKey = `stories:${currentDate.toISOString().split('T')[0]}`;
  
  const [dismissed, setDismissed] = useState(() => {
    try {
      const saved = localStorage.getItem(dateKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const visibleStories = stories.filter(s => !dismissed.has(s.id));

  const handleDismiss = (storyId) => {
    setDismissed(prev => {
      const next = new Set([...prev, storyId]);
      try {
        localStorage.setItem(dateKey, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // Show empty state with generate button if no stories
  if (visibleStories.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyStoryCard}>
          <View style={styles.emptyStoryContent}>
            <Sparkles size={16} color={colors.muted} />
            <Text style={styles.emptyStoryText}>Generate today's tips</Text>
          </View>
          <TouchableOpacity 
            style={styles.generateButton}
            onPress={onGenerateTips}
          >
            <Text style={styles.generateButtonText}>Generate</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Progress dots */}
      <View style={styles.progressDots}>
        {visibleStories.map((_, index) => (
          <View key={index} style={styles.progressDot} />
        ))}
      </View>
      
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {visibleStories.map((story, index) => {
          const Icon = iconMap[story.icon] || Sparkles;
          const tagColor = tagColors[story.tag] || tagColors.Tip;

          return (
            <View key={story.id || `story-${index}`} style={styles.storyCard}>
              <View style={styles.storyHeader}>
                <View style={[styles.tag, { backgroundColor: tagColor.bg }]}>
                  <Icon size={12} color={tagColor.text} />
                  <Text style={[styles.tagText, { color: tagColor.text }]}>
                    {story.tag}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDismiss(story.id)}
                  style={styles.dismissButton}
                >
                  <Text style={styles.dismissText}>×</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.storyContent}
                onPress={() => onStoryAction?.(story)}
                activeOpacity={0.7}
              >
                <Text style={styles.storyTitle}>{story.title}</Text>
                <Text style={styles.storyBody} numberOfLines={2}>
                  {story.body}
                </Text>

                {story.kind === 'article' && (
                  <View style={styles.readMoreButton}>
                    <Text style={styles.readMoreText}>Read more →</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  progressDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },
  emptyStoryCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.md,
  },
  emptyStoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyStoryText: {
    fontSize: 14,
    color: colors.muted,
  },
  generateButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
  },
  generateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: 12,
  },
  storyCard: {
    width: 280,
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
  },
  storyContent: {
    flex: 1,
  },
  storyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dismissButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  dismissText: {
    fontSize: 20,
    color: colors.muted,
    lineHeight: 20,
  },
  storyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  storyBody: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  readMoreButton: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  readMoreText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.accent,
  },
});

