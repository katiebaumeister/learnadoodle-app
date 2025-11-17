import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Calendar, CheckCircle, Clock, Flame, BookOpen, Sparkles, ExternalLink, Video, FileText, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getChildOverview, getLearningSuggestions } from '../../lib/apiClient';
import { useToast } from '../Toast';

export default function ChildDashboard({ childId, childName }) {
  const [todayEvents, setTodayEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [progress, setProgress] = useState(null);
  const [approvedSuggestions, setApprovedSuggestions] = useState([]);
  const toast = useToast();

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (childId) {
      loadSuggestions();
    }
  }, [childId]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const { data, error } = await getChildOverview();
      if (error) throw error;
      
      if (data) {
        setTodayEvents(data.today_events || []);
        setStreak(data.streak || 0);
        setProgress(data.progress || {});
      }
    } catch (error) {
      console.error('Error loading child overview:', error);
      toast.push('Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async () => {
    if (!childId) return;
    try {
      const { data, error } = await getLearningSuggestions(childId, true);
      if (!error && data) {
        setApprovedSuggestions(data);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'video':
        return <Video size={14} color="#ef4444" />;
      case 'article':
        return <FileText size={14} color="#3b82f6" />;
      case 'project':
        return <Award size={14} color="#f59e0b" />;
      case 'course':
        return <BookOpen size={14} color="#10b981" />;
      default:
        return <BookOpen size={14} color="#6b7280" />;
    }
  };

  const handleEventComplete = async (eventId) => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ status: 'done' })
        .eq('id', eventId);

      if (error) throw error;
      
      toast.push('Event marked as complete!', 'success');
      loadOverview();
    } catch (error) {
      console.error('Error completing event:', error);
      toast.push('Failed to mark event as complete', 'error');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Today's Quests</Text>
        <Text style={styles.subtitle}>Welcome back, {childName || 'Student'}!</Text>
      </View>

      {/* Streak Card */}
      <View style={styles.streakCard}>
        <Flame size={24} color="#f59e0b" />
        <View style={styles.streakInfo}>
          <Text style={styles.streakLabel}>Learning Streak</Text>
          <Text style={styles.streakValue}>{streak} day{streak !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Progress Summary */}
      {progress && Object.keys(progress).length > 0 && (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Your Progress</Text>
          <View style={styles.progressRow}>
            {progress.completed_events !== undefined && progress.total_events !== undefined && (
              <View style={styles.progressItem}>
                <CheckCircle size={20} color="#10b981" />
                <Text style={styles.progressText}>
                  {progress.completed_events}/{progress.total_events} completed
                </Text>
              </View>
            )}
            {progress.avg_rating && (
              <View style={styles.progressItem}>
                <Text style={styles.progressText}>
                  Avg: {progress.avg_rating.toFixed(1)}/5
                </Text>
              </View>
            )}
            {progress.hours_this_week !== undefined && (
              <View style={styles.progressItem}>
                <Text style={styles.progressText}>
                  {progress.hours_this_week}h this week
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Today's Events */}
      <View style={styles.eventsSection}>
        <Text style={styles.sectionTitle}>Today's Schedule</Text>
        {todayEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Calendar size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No events scheduled for today</Text>
            <Text style={styles.emptySubtext}>Enjoy your free day!</Text>
          </View>
        ) : (
          todayEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={[
                styles.eventCard,
                event.status === 'done' && styles.eventCardDone
              ]}
              onPress={() => event.status !== 'done' && handleEventComplete(event.id)}
            >
              <View style={styles.eventHeader}>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  {event.subject && (
                    <Text style={styles.eventSubject}>{event.subject.name}</Text>
                  )}
                </View>
                {event.status === 'done' ? (
                  <CheckCircle size={24} color="#10b981" />
                ) : (
                  <View style={styles.eventCheckbox} />
                )}
              </View>
              {event.start_at && (
                <View style={styles.eventTime}>
                  <Clock size={14} color="#6b7280" />
                  <Text style={styles.eventTimeText}>
                    {new Date(event.start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              )}
              {event.start_ts && !event.start_at && (
                <View style={styles.eventTime}>
                  <Clock size={14} color="#6b7280" />
                  <Text style={styles.eventTimeText}>
                    {new Date(event.start_ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Approved Learning Suggestions */}
      {approvedSuggestions.length > 0 && (
        <View style={styles.suggestionsSection}>
          <View style={styles.sectionHeader}>
            <Sparkles size={20} color="#8b5cf6" />
            <Text style={styles.sectionTitle}>Inspire Learning</Text>
          </View>
          {approvedSuggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.id}
              style={styles.suggestionCard}
              onPress={() => {
                if (Platform.OS === 'web' && suggestion.link) {
                  window.open(suggestion.link, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <View style={styles.suggestionHeader}>
                {getTypeIcon(suggestion.type)}
                <View style={styles.suggestionInfo}>
                  <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                  <View style={styles.suggestionMeta}>
                    <Text style={styles.suggestionSource}>{suggestion.source}</Text>
                    {suggestion.duration_min && (
                      <>
                        <Text style={styles.metaSeparator}>•</Text>
                        <View style={styles.duration}>
                          <Clock size={10} color="#6b7280" />
                          <Text style={styles.durationText}>{suggestion.duration_min} min</Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
                <ExternalLink size={16} color="#6b7280" />
              </View>
              {suggestion.description && (
                <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  streakInfo: {
    marginLeft: 12,
  },
  streakLabel: {
    fontSize: 14,
    color: '#92400e',
    marginBottom: 4,
  },
  streakValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#92400e',
  },
  progressCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#374151',
  },
  eventsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
  eventCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  eventCardDone: {
    backgroundColor: '#f0fdf4',
    borderColor: '#10b981',
    opacity: 0.7,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  eventSubject: {
    fontSize: 14,
    color: '#6b7280',
  },
  eventCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  eventTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventTimeText: {
    fontSize: 14,
    color: '#6b7280',
  },
  suggestionsSection: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  suggestionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  suggestionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  suggestionSource: {
    fontSize: 12,
    color: '#6b7280',
  },
  metaSeparator: {
    fontSize: 12,
    color: '#d1d5db',
  },
  duration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontSize: 12,
    color: '#6b7280',
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginTop: 8,
  },
});

