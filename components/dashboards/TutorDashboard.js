import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, Platform } from 'react-native';
import { Calendar, CheckCircle, X, Clock, TrendingUp, Award, BookOpen, Sparkles, ExternalLink, Video, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getTutorOverview, getLearningSuggestions } from '../../lib/apiClient';
import { useToast } from '../Toast';

export default function TutorDashboard({ accessibleChildren = [] }) {
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReflectionModal, setShowReflectionModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [reflectionText, setReflectionText] = useState('');
  const [approvedSuggestions, setApprovedSuggestions] = useState([]);
  const toast = useToast();

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (children.length > 0 && !selectedChildId) {
      setSelectedChildId(children[0].child_id);
    }
  }, [children]);

  useEffect(() => {
    if (selectedChildId) {
      loadSuggestions();
    }
  }, [selectedChildId]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const { data, error } = await getTutorOverview();
      if (error) throw error;
      
      if (data && data.children) {
        setChildren(data.children);
        if (data.children.length > 0 && !selectedChildId) {
          setSelectedChildId(data.children[0].child_id);
        }
      }
    } catch (error) {
      console.error('Error loading tutor overview:', error);
      toast.push('Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async () => {
    if (!selectedChildId) return;
    try {
      const { data, error } = await getLearningSuggestions(selectedChildId, true);
      if (!error && data) {
        setApprovedSuggestions(data);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  };

  const selectedChild = children.find(c => c.child_id === selectedChildId);
  const todayEvents = selectedChild?.today_events || [];
  const stats = selectedChild?.stats || {};

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

  const handleEventAction = async (eventId, action) => {
    try {
      if (action === 'done') {
        const { error } = await supabase
          .from('events')
          .update({ status: 'done' })
          .eq('id', eventId);

        if (error) throw error;
        toast.push('Event marked as complete', 'success');
      } else if (action === 'skip') {
        const { error } = await supabase
          .from('events')
          .update({ status: 'missed' })
          .eq('id', eventId);

        if (error) throw error;
        toast.push('Event skipped', 'success');
      } else if (action === 'reflection') {
        setSelectedEvent(eventId);
        setShowReflectionModal(true);
        return;
      }

      loadOverview();
    } catch (error) {
      console.error('Error updating event:', error);
      toast.push('Failed to update event', 'error');
    }
  };

  const handleSaveReflection = async () => {
    if (!selectedEvent || !reflectionText.trim()) return;

    try {
      // Create or update event_outcome with note
      const { error } = await supabase
        .from('event_outcomes')
        .upsert({
          event_id: selectedEvent,
          child_id: selectedChildId,
          family_id: (await supabase.from('children').select('family_id').eq('id', selectedChildId).single()).data?.family_id,
          note: reflectionText,
        }, {
          onConflict: 'event_id'
        });

      if (error) throw error;

      toast.push('Reflection saved', 'success');
      setShowReflectionModal(false);
      setReflectionText('');
      setSelectedEvent(null);
      loadOverview();
    } catch (error) {
      console.error('Error saving reflection:', error);
      toast.push('Failed to save reflection', 'error');
    }
  };

  if (loading && children.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Tutor Dashboard</Text>
        <Text style={styles.subtitle}>Track learning progress for your students</Text>
      </View>

      {/* Child Selector */}
      {children.length > 0 && (
        <View style={styles.childSelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childChips}>
            {children.map((child) => (
              <TouchableOpacity
                key={child.child_id}
                style={[
                  styles.childChip,
                  selectedChildId === child.child_id && styles.childChipActive
                ]}
                onPress={() => setSelectedChildId(child.child_id)}
              >
                <Text style={[
                  styles.childChipText,
                  selectedChildId === child.child_id && styles.childChipTextActive
                ]}>
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {!selectedChildId ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No children assigned</Text>
        </View>
      ) : (
        <>
          {/* Progress Card */}
          {stats && Object.keys(stats).length > 0 && (
            <View style={styles.progressCard}>
              <Text style={styles.progressTitle}>{selectedChild?.name || 'Student'} Progress</Text>
              <View style={styles.progressGrid}>
                {stats.hours_this_week !== undefined && (
                  <View style={styles.progressItem}>
                    <Clock size={20} color="#3b82f6" />
                    <Text style={styles.progressValue}>{stats.hours_this_week}h</Text>
                    <Text style={styles.progressLabel}>This week</Text>
                  </View>
                )}
                {stats.avg_rating && (
                  <View style={styles.progressItem}>
                    <TrendingUp size={20} color="#10b981" />
                    <Text style={styles.progressValue}>{stats.avg_rating.toFixed(1)}</Text>
                    <Text style={styles.progressLabel}>Avg rating</Text>
                  </View>
                )}
                {stats.last_grade && (
                  <View style={styles.progressItem}>
                    <Award size={20} color="#f59e0b" />
                    <Text style={styles.progressValue}>{stats.last_grade}</Text>
                    <Text style={styles.progressLabel}>Latest grade</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Today's Events */}
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Today's Events</Text>
            {todayEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No events scheduled for today</Text>
              </View>
            ) : (
              todayEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onAction={handleEventAction}
                />
              ))
            )}
          </View>

          {/* Approved Learning Suggestions */}
          {approvedSuggestions.length > 0 && (
            <View style={styles.eventsSection}>
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
        </>
      )}

      {/* Reflection Modal */}
      <Modal
        visible={showReflectionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowReflectionModal(false);
          setReflectionText('');
          setSelectedEvent(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Reflection</Text>
            <TextInput
              style={styles.reflectionInput}
              multiline
              numberOfLines={4}
              placeholder="Add notes about this session..."
              value={reflectionText}
              onChangeText={setReflectionText}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowReflectionModal(false);
                  setReflectionText('');
                  setSelectedEvent(null);
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveReflection}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextSave]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function EventCard({ event, onAction }) {
  const isDone = event.status === 'done';

  return (
    <View style={[styles.eventCard, isDone && styles.eventCardDone]}>
      <View style={styles.eventHeader}>
        <View style={styles.eventInfo}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          {event.subject && (
            <Text style={styles.eventSubject}>{event.subject.name}</Text>
          )}
          {event.start_ts && (
            <View style={styles.eventTime}>
              <Clock size={12} color="#6b7280" />
              <Text style={styles.eventTimeText}>
                {new Date(event.start_ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          )}
        </View>
        {isDone && <CheckCircle size={20} color="#10b981" />}
      </View>
      {!isDone && (
        <View style={styles.eventActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDone]}
            onPress={() => onAction(event.id, 'done')}
          >
            <CheckCircle size={16} color="#ffffff" />
            <Text style={styles.actionButtonText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSkip]}
            onPress={() => onAction(event.id, 'skip')}
          >
            <X size={16} color="#ffffff" />
            <Text style={styles.actionButtonText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonReflection]}
            onPress={() => onAction(event.id, 'reflection')}
          >
            <BookOpen size={16} color="#ffffff" />
            <Text style={styles.actionButtonText}>Reflect</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
  childSelector: {
    marginBottom: 24,
  },
  childChips: {
    flexDirection: 'row',
    gap: 8,
  },
  childChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  childChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  childChipText: {
    fontSize: 14,
    color: '#374151',
  },
  childChipTextActive: {
    color: '#1d4ed8',
    fontWeight: '600',
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
  progressGrid: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  progressItem: {
    alignItems: 'center',
    gap: 4,
  },
  progressValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  progressLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  eventsSection: {
    marginBottom: 32,
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
    marginBottom: 12,
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
    marginBottom: 4,
  },
  eventTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventTimeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  eventActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionButtonDone: {
    backgroundColor: '#10b981',
  },
  actionButtonSkip: {
    backgroundColor: '#ef4444',
  },
  actionButtonReflection: {
    backgroundColor: '#3b82f6',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  reflectionInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalButtonCancel: {
    backgroundColor: '#f3f4f6',
  },
  modalButtonSave: {
    backgroundColor: '#3b82f6',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  modalButtonTextSave: {
    color: '#ffffff',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
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

