import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import { Search, Plus, BookOpen, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';

export default function LessonPlans({ familyId, initialPlans = [], children = [] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc('get_lesson_plans', {
        _family: familyId,
        _q: q || null,
        _subject_ids: null
      });
      setPlans(data || []);
    } catch (error) {
      console.error('Error loading lesson plans:', error);
      Alert.alert('Error', 'Failed to load lesson plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (familyId) {
      loadPlans();
    }
  }, [familyId, q]);

  const quickCreate = async () => {
    try {
      const payload = {
        _family: familyId,
        _subject: null,
        _title: 'Reading – Chapter 1',
        _description: 'Intro chapter with short quiz',
        _grade_level: '5',
        _tags: ['reading', 'quiz'],
        _steps: [
          { order: 1, kind: 'read', title: 'Read Chapter 1', details: '20 min', resource_urls: [], minutes: 20 },
          { order: 2, kind: 'practice', title: 'Vocabulary', details: '15 min', resource_urls: [], minutes: 15 },
          { order: 3, kind: 'quiz', title: '5-question quiz', details: '15 min', resource_urls: [], minutes: 15 }
        ]
      };
      
      const { error } = await supabase.rpc('create_lesson_plan', payload);
      if (error) throw error;
      
      await loadPlans();
      Alert.alert('Success', 'Sample lesson plan created');
    } catch (error) {
      console.error('Error creating lesson plan:', error);
      Alert.alert('Error', 'Failed to create lesson plan');
    }
  };

  const instantiate = async (planId, childId) => {
    try {
      // Get Monday of current week
      const now = new Date();
      const monday = new Date(now);
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      monday.setDate(now.getDate() + daysToMonday);
      
      const { data, error } = await supabase.rpc('instantiate_plan_to_week', {
        _family: familyId,
        _plan_id: planId,
        _child_id: childId,
        _week_start: monday.toISOString().split('T')[0]
      });
      
      if (error) throw error;
      
      Alert.alert('Success', `Created ${data?.created_events ?? 0} scheduled blocks`);
    } catch (error) {
      console.error('Error instantiating plan:', error);
      Alert.alert('Error', 'Failed to schedule lesson plan');
    }
  };

  const getStepIcon = (kind) => {
    switch (kind) {
      case 'read': return '📖';
      case 'practice': return '✏️';
      case 'quiz': return '📝';
      case 'project': return '🎨';
      default: return '📋';
    }
  };

  const formatDuration = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Lesson Plans</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.createButton} onPress={quickCreate}>
            <Plus size={16} color={colors.text} />
            <Text style={styles.createText}>New sample plan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchInput}>
          <Search size={16} color={colors.muted} />
          <TextInput
            style={styles.searchField}
            placeholder="Search lesson plans..."
            value={q}
            onChangeText={setQ}
          />
        </View>
      </View>

      {/* Plans grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading lesson plans...</Text>
        </View>
      ) : (
        <View style={styles.plansGrid}>
          {plans.map(plan => (
            <View key={plan.id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.planIcon}>
                  <BookOpen size={20} color={colors.blueBold} />
                </View>
                <View style={styles.planInfo}>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  <Text style={styles.planDescription} numberOfLines={2}>
                    {plan.description || 'No description'}
                  </Text>
                </View>
              </View>

              <View style={styles.planMeta}>
                <View style={styles.metaItem}>
                  <Clock size={14} color={colors.muted} />
                  <Text style={styles.metaText}>{formatDuration(plan.estimated_minutes)}</Text>
                </View>
                {plan.grade_level && (
                  <View style={styles.gradeBadge}>
                    <Text style={styles.gradeText}>Grade {plan.grade_level}</Text>
                  </View>
                )}
              </View>

              {plan.tags && plan.tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {plan.tags.slice(0, 3).map((tag, index) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.planActions}>
                <View style={styles.childSelector}>
                  <Text style={styles.selectorLabel}>Choose child:</Text>
                  <View style={styles.childButtons}>
                    {children.map(child => (
                      <TouchableOpacity
                        key={child.id}
                        style={styles.childButton}
                        onPress={() => instantiate(plan.id, child.id)}
                      >
                        <Text style={styles.childButtonText}>{child.first_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          ))}
          
          {plans.length === 0 && (
            <View style={styles.emptyState}>
              <BookOpen size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>No lesson plans yet</Text>
              <Text style={styles.emptyText}>
                Create your first lesson plan to get started with structured learning
              </Text>
              <TouchableOpacity style={styles.emptyButton} onPress={quickCreate}>
                <Text style={styles.emptyButtonText}>Create Sample Plan</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  createText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  searchSection: {
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  searchField: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.muted,
  },
  plansGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  planCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  planIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planInfo: {
    flex: 1,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  planDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  planMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
  },
  gradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.orangeSoft,
  },
  gradeText: {
    fontSize: 11,
    color: colors.orangeBold,
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.panel,
  },
  tagText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  planActions: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  childSelector: {
    gap: 8,
  },
  selectorLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  childButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  childButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  childButtonText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  emptyState: {
    width: '100%',
    padding: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  emptyButtonText: {
    fontSize: 14,
    color: colors.accentContrast,
    fontWeight: '500',
  },
});
