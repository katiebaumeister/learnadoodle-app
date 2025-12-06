import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Modal, TextInput } from 'react-native';
import { Calendar, CheckCircle, Clock, Flame, BookOpen, Sparkles, ExternalLink, Video, FileText, Award, Target, MessageSquare, Star, Play, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getChildOverview, getLearningSuggestions } from '../../lib/apiClient';
import { useToast } from '../Toast';
import ContinueLearningStrip from '../content/ContinueLearningStrip';
import { getAssignments } from '../../lib/services/assignmentsClient';
import AssignmentCard from '../assignments/AssignmentCard';
import AssignmentDetailModal from '../assignments/AssignmentDetailModal';
import { submitAssignment, toggleNeedHelp } from '../../lib/services/assignmentsClient';
import SmartSuggestionsList from '../planner/SmartSuggestionsList';
import SuggestionActionModal from '../planner/SuggestionActionModal';

export default function ChildDashboard({ childId, childName, familyId: propFamilyId }) {
  const [todayEvents, setTodayEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [progress, setProgress] = useState(null);
  const [approvedSuggestions, setApprovedSuggestions] = useState([]);
  const [dailyFocusItems, setDailyFocusItems] = useState([]);
  const [pendingReflections, setPendingReflections] = useState([]);
  const [showReflectionModal, setShowReflectionModal] = useState(false);
  const [selectedEventForReflection, setSelectedEventForReflection] = useState(null);
  const [reflectionRating, setReflectionRating] = useState(0);
  const [reflectionText, setReflectionText] = useState('');
  const [reflectionBehaviorTags, setReflectionBehaviorTags] = useState([]);
  const [familyId, setFamilyId] = useState(propFamilyId);
  const [assignmentsDueSoon, setAssignmentsDueSoon] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const toast = useToast();

  // Get familyId if not provided
  useEffect(() => {
    if (!familyId && childId) {
      (async () => {
        const { data } = await supabase
          .from('children')
          .select('family_id')
          .eq('id', childId)
          .single();
        if (data?.family_id) {
          setFamilyId(data.family_id);
        }
      })();
    }
  }, [childId, familyId]);

  useEffect(() => {
    loadOverview();
    loadDailyFocus();
    loadPendingReflections();
    if (childId) {
      loadAssignmentsDueSoon();
    }
  }, [childId]);

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

  const loadDailyFocus = async () => {
    if (!childId) return;
    try {
      // Get top 3 incomplete events for today as daily focus
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, start_ts, subject_id, subject:subject_id(name)')
        .eq('child_id', childId)
        .gte('start_ts', today.toISOString())
        .lt('start_ts', tomorrow.toISOString())
        .neq('status', 'done')
        .order('start_ts', { ascending: true })
        .limit(3);

      if (!error && events) {
        setDailyFocusItems(events);
      }
    } catch (error) {
      console.error('Error loading daily focus:', error);
    }
  };

  const loadPendingReflections = async () => {
    if (!childId) return;
    try {
      // Get completed events from today that don't have reflections yet
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // First get all completed events today
      const { data: allEvents, error: eventsError } = await supabase
        .from('events')
        .select('id, title, start_ts, subject_id, subject:subject_id(name)')
        .eq('child_id', childId)
        .eq('status', 'done')
        .gte('start_ts', today.toISOString())
        .lt('start_ts', tomorrow.toISOString())
        .limit(10);

      if (eventsError) throw eventsError;

      // Then get events that already have reflections
      const { data: reflections, error: reflectionsError } = await supabase
        .from('reflection_prompts')
        .select('event_id')
        .not('response_text', 'is', null);

      if (reflectionsError) throw reflectionsError;

      const reflectedEventIds = new Set((reflections || []).map(r => r.event_id));
      const pendingEvents = (allEvents || []).filter(e => !reflectedEventIds.has(e.id)).slice(0, 5);

      setPendingReflections(pendingEvents);
    } catch (error) {
      console.error('Error loading pending reflections:', error);
    }
  };

  const loadAssignmentsDueSoon = async () => {
    if (!childId) return;
    try {
      const { data, error } = await getAssignments(childId);
      if (error) {
        console.error('Error loading assignments:', error);
        return;
      }

      // Filter assignments due in the next 7 days that aren't completed
      const now = new Date();
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const dueSoon = (data || []).filter(assignment => {
        if (!assignment.due_date) return false;
        const dueDate = new Date(assignment.due_date);
        return (
          dueDate >= now &&
          dueDate <= nextWeek &&
          assignment.status !== 'accepted' &&
          assignment.status !== 'submitted'
        );
      }).slice(0, 5);

      setAssignmentsDueSoon(dueSoon);
    } catch (error) {
      console.error('Error loading assignments due soon:', error);
    }
  };

  const handleAssignmentPress = (assignment) => {
    setSelectedAssignment(assignment);
    setShowAssignmentModal(true);
  };

  const handleAssignmentSubmit = async (assignmentId, evidenceId) => {
    const { error } = await submitAssignment(assignmentId, evidenceId);
    if (!error) {
      await loadAssignmentsDueSoon();
      setShowAssignmentModal(false);
      toast.push('Assignment submitted!', 'success');
    } else {
      toast.push('Failed to submit assignment', 'error');
    }
  };

  const handleToggleHelp = async (assignmentId) => {
    const { error } = await toggleNeedHelp(assignmentId);
    if (!error) {
      await loadAssignmentsDueSoon();
      if (selectedAssignment?.id === assignmentId) {
        setSelectedAssignment({ ...selectedAssignment, need_help: !selectedAssignment.need_help });
      }
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
      loadDailyFocus();
      loadPendingReflections();
      
      // Show reflection prompt if enabled
      const event = todayEvents.find(e => e.id === eventId);
      if (event) {
        setSelectedEventForReflection(event);
        setShowReflectionModal(true);
      }
    } catch (error) {
      console.error('Error completing event:', error);
      toast.push('Failed to mark event as complete', 'error');
    }
  };

  const handleSaveReflection = async () => {
    if (!selectedEventForReflection || !reflectionText.trim()) {
      toast.push('Please add a reflection', 'error');
      return;
    }

    try {
      // Get family_id and child_id
      const { data: eventData } = await supabase
        .from('events')
        .select('child_id, family_id')
        .eq('id', selectedEventForReflection.id)
        .single();

      if (!eventData) throw new Error('Event not found');

      // Create reflection prompt
      const { error } = await supabase
        .from('reflection_prompts')
        .insert({
          family_id: eventData.family_id,
          child_id: eventData.child_id,
          event_id: selectedEventForReflection.id,
          prompt_text: "How did that go?",
          response_text: reflectionText,
          rating: reflectionRating || null,
          behavior_tags: reflectionBehaviorTags.length > 0 ? reflectionBehaviorTags : null,
          prompt_type: 'after_event',
          responded_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.push('Reflection saved!', 'success');
      setShowReflectionModal(false);
      setReflectionText('');
      setReflectionRating(0);
      setReflectionBehaviorTags([]);
      setSelectedEventForReflection(null);
      loadPendingReflections();
    } catch (error) {
      console.error('Error saving reflection:', error);
      toast.push('Failed to save reflection', 'error');
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

      {/* Continue Learning Strip */}
      {familyId && (
        <ContinueLearningStrip 
          childId={childId}
          familyId={familyId}
          limit={3}
        />
      )}

      {/* Smart Suggestions */}
      {familyId && (
        <View style={styles.suggestionsContainer}>
          <SmartSuggestionsList
            familyId={familyId}
            childId={childId}
            onSuggestionClick={(suggestion) => {
              setSelectedSuggestion(suggestion);
              setShowSuggestionModal(true);
            }}
            maxSuggestions={3}
            autoGenerate={true}
          />
        </View>
      )}

      {/* Assignments Due Soon */}
      {assignmentsDueSoon.length > 0 && (
        <View style={styles.assignmentsCard}>
          <View style={styles.sectionHeader}>
            <AlertCircle size={20} color="#f59e0b" />
            <Text style={styles.sectionTitle}>Assignments Due Soon</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assignmentsScroll}>
            {assignmentsDueSoon.map((assignment) => (
              <TouchableOpacity
                key={assignment.id}
                style={styles.assignmentCard}
                onPress={() => handleAssignmentPress(assignment)}
              >
                <View style={styles.assignmentCardHeader}>
                  <Text style={styles.assignmentCardTitle} numberOfLines={2}>
                    {assignment.title}
                  </Text>
                  {assignment.need_help && (
                    <AlertCircle size={14} color="#f59e0b" />
                  )}
                </View>
                {assignment.due_date && (
                  <View style={styles.assignmentCardMeta}>
                    <Clock size={12} color={colors.muted} />
                    <Text style={styles.assignmentCardDue}>
                      Due: {new Date(assignment.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                )}
                <View style={[
                  styles.assignmentStatusBadge,
                  assignment.status === 'in_progress' && { backgroundColor: colors.blueSoft },
                  assignment.status === 'not_started' && { backgroundColor: colors.bgSubtle },
                ]}>
                  <Text style={[
                    styles.assignmentStatusText,
                    assignment.status === 'in_progress' && { color: colors.blueBold },
                  ]}>
                    {assignment.status === 'in_progress' ? 'In Progress' : 'Not Started'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Daily Focus Items */}
      {dailyFocusItems.length > 0 && (
        <View style={styles.focusCard}>
          <View style={styles.sectionHeader}>
            <Target size={20} color="#3b82f6" />
            <Text style={styles.focusTitle}>Today's Focus</Text>
          </View>
          {dailyFocusItems.map((item, index) => (
            <View key={item.id} style={styles.focusItem}>
              <Text style={styles.focusNumber}>{index + 1}</Text>
              <View style={styles.focusContent}>
                <Text style={styles.focusText}>{item.title}</Text>
                {item.subject && (
                  <Text style={styles.focusSubject}>{item.subject.name}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

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

      {/* Pending Reflections */}
      {pendingReflections.length > 0 && (
        <View style={styles.reflectionsCard}>
          <View style={styles.sectionHeader}>
            <MessageSquare size={20} color="#8b5cf6" />
            <Text style={styles.sectionTitle}>Reflection Time</Text>
          </View>
          <Text style={styles.reflectionsSubtitle}>How did these go today?</Text>
          {pendingReflections.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.reflectionPromptCard}
              onPress={() => {
                setSelectedEventForReflection(event);
                setShowReflectionModal(true);
              }}
            >
              <Text style={styles.reflectionPromptText}>{event.title}</Text>
              <MessageSquare size={16} color="#8b5cf6" />
            </TouchableOpacity>
          ))}
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
              {event.source_link && event.resume_position && event.status !== 'done' && (
                <View style={styles.resumeChip}>
                  <Play size={10} color={colors.accent} fill={colors.accent} />
                  <Text style={styles.resumeChipText}>
                    Resume at {event.resume_position}
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

      {/* Reflection Modal */}
      <Modal
        visible={showReflectionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowReflectionModal(false);
          setReflectionText('');
          setReflectionRating(0);
          setReflectionBehaviorTags([]);
          setSelectedEventForReflection(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {selectedEventForReflection ? `How did "${selectedEventForReflection.title}" go?` : 'Reflection'}
            </Text>
            
            {/* Rating Stars */}
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingLabel}>Rate it:</Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setReflectionRating(star)}
                    style={styles.starButton}
                  >
                    <Star
                      size={32}
                      color={star <= reflectionRating ? '#fbbf24' : '#d1d5db'}
                      fill={star <= reflectionRating ? '#fbbf24' : 'transparent'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Behavior Tags */}
            <View style={styles.section}>
              <Text style={styles.label}>How did you feel?</Text>
              <Text style={styles.subLabel}>Select all that apply</Text>
              <View style={styles.behaviorContainer}>
                {['Focused', 'Distracted', 'Excited', 'Overwhelmed'].map((tag) => {
                  const isSelected = reflectionBehaviorTags.includes(tag);
                  const tagColors = {
                    'Focused': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
                    'Distracted': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
                    'Excited': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
                    'Overwhelmed': { bg: '#e0e7ff', border: '#6366f1', text: '#312e81' },
                  };
                  const colors = tagColors[tag] || tagColors['Focused'];
                  
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.behaviorTag,
                        {
                          backgroundColor: isSelected ? colors.bg : '#ffffff',
                          borderColor: isSelected ? colors.border : colors.border + '40',
                          borderWidth: isSelected ? 2 : 1,
                        }
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          setReflectionBehaviorTags(reflectionBehaviorTags.filter(t => t !== tag));
                        } else {
                          setReflectionBehaviorTags([...reflectionBehaviorTags, tag]);
                        }
                      }}
                    >
                      <Text style={[styles.behaviorTagText, { color: colors.text }]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Reflection Text */}
            <TextInput
              style={styles.reflectionInput}
              multiline
              numberOfLines={4}
              placeholder="Tell us about it... What did you learn? What was challenging?"
              value={reflectionText}
              onChangeText={setReflectionText}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowReflectionModal(false);
                  setReflectionText('');
                  setReflectionRating(0);
                  setReflectionBehaviorTags([]);
                  setSelectedEventForReflection(null);
                }}
              >
                <Text style={styles.modalButtonText}>Skip</Text>
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

      {/* Assignment Detail Modal */}
      <AssignmentDetailModal
        visible={showAssignmentModal}
        assignment={selectedAssignment}
        childId={childId}
        familyId={familyId}
        onClose={() => {
          setShowAssignmentModal(false);
          setSelectedAssignment(null);
        }}
        onSubmit={handleAssignmentSubmit}
        onToggleHelp={handleToggleHelp}
      />

      {/* Suggestion Action Modal */}
      <SuggestionActionModal
        visible={showSuggestionModal}
        suggestion={selectedSuggestion}
        onClose={() => {
          setShowSuggestionModal(false);
          setSelectedSuggestion(null);
        }}
        onNavigateToPlanner={(date) => {
          // Navigate to planner - would need navigation prop or callback
          if (typeof window !== 'undefined' && window.__ldNavigateToPlanner) {
            window.__ldNavigateToPlanner(date);
          }
        }}
      />
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
  focusCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  focusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  focusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  focusNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  focusContent: {
    flex: 1,
  },
  focusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  focusSubject: {
    fontSize: 12,
    color: '#6b7280',
  },
  reflectionsCard: {
    backgroundColor: '#faf5ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  reflectionsSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    marginTop: 4,
  },
  reflectionPromptCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  reflectionPromptText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
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
    marginBottom: 20,
  },
  ratingContainer: {
    marginBottom: 20,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  subLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  behaviorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  behaviorTag: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  behaviorTagText: {
    fontSize: 14,
    fontWeight: '500',
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
  assignmentsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  assignmentsScroll: {
    marginTop: 12,
  },
  assignmentCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    width: 200,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  assignmentCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  assignmentCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 4,
  },
  assignmentCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  assignmentCardDue: {
    fontSize: 12,
    color: '#6b7280',
  },
  assignmentStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  assignmentStatusText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b7280',
  },
  suggestionsContainer: {
    marginBottom: 16,
    marginHorizontal: 20,
  },
  resumeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  resumeChipText: {
    fontSize: 11,
    color: '#1e40af',
    fontWeight: '500',
  },
});

