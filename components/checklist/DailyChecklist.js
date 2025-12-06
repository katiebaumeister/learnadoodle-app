/**
 * Daily Checklist Component
 * Personalized daily tasks and assignments for students
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CheckCircle, Circle, Clock, Award, TrendingUp, BookOpen, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function DailyChecklist({ childId, familyId, date = null }) {
  const [loading, setLoading] = useState(true);
  const [checklistItems, setChecklistItems] = useState([]);
  const [gamification, setGamification] = useState(null);
  const [completionStats, setCompletionStats] = useState({ completed: 0, total: 0, percentage: 0 });

  const targetDate = date || new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadChecklist();
    loadGamification();
  }, [childId, familyId, targetDate]);

  const loadChecklist = async () => {
    if (!childId || !familyId) return;

    setLoading(true);
    try {
      // Load checklist items for the date
      const { data, error } = await supabase
        .from('daily_checklist_items')
        .select('*')
        .eq('child_id', childId)
        .eq('date', targetDate)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;

      setChecklistItems(data || []);

      // Calculate completion stats
      const completed = (data || []).filter(item => item.completed).length;
      const total = (data || []).length;
      setCompletionStats({
        completed,
        total,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      });
    } catch (error) {
      console.error('Error loading checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGamification = async () => {
    if (!childId) return;

    try {
      const { data, error } = await supabase
        .from('child_gamification')
        .select('*')
        .eq('child_id', childId)
        .eq('streak_type', 'daily')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading gamification:', error);
      } else {
        setGamification(data);
      }
    } catch (error) {
      console.error('Error loading gamification:', error);
    }
  };

  const toggleItemComplete = async (itemId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('daily_checklist_items')
        .update({
          completed: !currentStatus,
          completed_at: !currentStatus ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;

      // Reload checklist
      await loadChecklist();

      // Award XP for completion
      if (!currentStatus) {
        await awardXPForCompletion(itemId);
      }
    } catch (error) {
      console.error('Error toggling item:', error);
      alert('Failed to update item. Please try again.');
    }
  };

  const awardXPForCompletion = async (itemId) => {
    if (!childId || !familyId) return;

    try {
      // Award 10 XP for completing a checklist item
      const xpAmount = 10;

      // Insert XP transaction
      const { error: xpError } = await supabase
        .from('xp_transactions')
        .insert({
          child_id: childId,
          family_id: familyId,
          xp_amount: xpAmount,
          xp_type: 'daily_checklist',
          source_id: itemId,
          source_type: 'checklist_item',
          description: 'Completed daily checklist item',
        });

      if (xpError) throw xpError;

      // Update gamification record
      const { data: existing } = await supabase
        .from('child_gamification')
        .select('*')
        .eq('child_id', childId)
        .eq('streak_type', 'daily')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('child_gamification')
          .update({
            total_xp: existing.total_xp + xpAmount,
            last_activity_date: targetDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('child_gamification')
          .insert({
            child_id: childId,
            family_id: familyId,
            total_xp: xpAmount,
            current_streak: 1,
            longest_streak: 1,
            last_activity_date: targetDate,
            streak_type: 'daily',
          });
      }

      // Reload gamification
      await loadGamification();
    } catch (error) {
      console.error('Error awarding XP:', error);
    }
  };

  const getTaskTypeIcon = (taskType) => {
    switch (taskType) {
      case 'assignment':
        return <BookOpen size={16} color={colors.indigo} />;
      case 'review':
        return <Target size={16} color={colors.orange} />;
      case 'practice':
        return <TrendingUp size={16} color={colors.green} />;
      default:
        return <Circle size={16} color={colors.textSecondary} />;
    }
  };

  const getPriorityColor = (priority) => {
    if (priority >= 4) return colors.red;
    if (priority >= 3) return colors.orange;
    return colors.textSecondary;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Stats */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Daily Checklist</Text>
          <Text style={styles.dateText}>
            {new Date(targetDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
        </View>
        {gamification && (
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Award size={18} color={colors.yellowBold} />
              <Text style={styles.statValue}>{gamification.total_xp || 0}</Text>
              <Text style={styles.statLabel}>XP</Text>
            </View>
            <View style={styles.statItem}>
              <TrendingUp size={18} color={colors.greenBold} />
              <Text style={styles.statValue}>{gamification.current_streak || 0}</Text>
              <Text style={styles.statLabel}>Day</Text>
            </View>
          </View>
        )}
      </View>

      {/* Progress Bar */}
      {completionStats.total > 0 && (
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${completionStats.percentage}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {completionStats.completed} of {completionStats.total} completed ({completionStats.percentage}%)
          </Text>
        </View>
      )}

      {/* Checklist Items */}
      <ScrollView style={styles.itemsContainer} showsVerticalScrollIndicator={false}>
        {checklistItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tasks for today</Text>
            <Text style={styles.emptySubtext}>Tasks will appear here as they're assigned</Text>
          </View>
        ) : (
          checklistItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, item.completed && styles.itemCompleted]}
              onPress={() => toggleItemComplete(item.id, item.completed)}
            >
              <View style={styles.itemLeft}>
                {item.completed ? (
                  <CheckCircle size={24} color={colors.greenBold} />
                ) : (
                  <Circle size={24} color={colors.border} />
                )}
                <View style={styles.itemContent}>
                  <View style={styles.itemHeader}>
                    {getTaskTypeIcon(item.task_type)}
                    <Text style={[styles.itemTitle, item.completed && styles.itemTitleCompleted]}>
                      {item.title}
                    </Text>
                    {item.priority >= 4 && (
                      <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
                        <Text style={styles.priorityText}>High</Text>
                      </View>
                    )}
                  </View>
                  {item.description && (
                    <Text style={[styles.itemDescription, item.completed && styles.itemDescriptionCompleted]}>
                      {item.description}
                    </Text>
                  )}
                  <View style={styles.itemMeta}>
                    {item.estimated_minutes && (
                      <View style={styles.metaItem}>
                        <Clock size={12} color={colors.textSecondary} />
                        <Text style={styles.metaText}>{item.estimated_minutes} min</Text>
                      </View>
                    )}
                    {item.cognitive_load && (
                      <View style={styles.metaItem}>
                        <Text style={[styles.cognitiveBadge, styles[`cognitive${item.cognitive_load.charAt(0).toUpperCase() + item.cognitive_load.slice(1)}`]]}>
                          {item.cognitive_load}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressSection: {
    padding: 16,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.greenBold,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  itemsContainer: {
    flex: 1,
    padding: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemCompleted: {
    opacity: 0.7,
    backgroundColor: colors.panel,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  itemTitleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  itemDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  itemDescriptionCompleted: {
    opacity: 0.6,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
    textTransform: 'uppercase',
  },
  cognitiveBadge: {
    fontSize: 10,
    fontWeight: '500',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: 'capitalize',
  },
  cognitiveLow: {
    backgroundColor: colors.greenSoft,
    color: colors.greenBold,
  },
  cognitiveMedium: {
    backgroundColor: colors.orangeSoft,
    color: colors.orangeBold,
  },
  cognitiveHigh: {
    backgroundColor: colors.redSoft,
    color: colors.redBold,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

