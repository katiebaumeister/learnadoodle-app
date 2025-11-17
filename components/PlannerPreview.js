import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { plannerService } from '../lib/plannerService';
import RulesHeatmap from './RulesHeatmap';

const PlannerPreview = ({ visible, onClose, childId, familyId, children }) => {
  const [selectedChild, setSelectedChild] = useState(null);
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 14 days
  });
  const [goals, setGoals] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState(new Set());

  useEffect(() => {
    if (visible && children.length > 0) {
      setSelectedChild(children[0]);
      initializeGoals();
    }
  }, [visible, children]);

  const initializeGoals = () => {
    // Initialize with common subjects
    setGoals([
      { subject_id: 'math', minutes: 180, min_block: 30, max_block: 90 },
      { subject_id: 'reading', minutes: 120, min_block: 20, max_block: 60 },
      { subject_id: 'writing', minutes: 90, min_block: 30, max_block: 60 },
    ]);
  };

  const generateProposal = async () => {
    if (!selectedChild || goals.length === 0) {
      showAlert('Validation Error', 'Please select a child and add some goals');
      return;
    }

    try {
      setLoading(true);
      const result = await plannerService.generateProposal({
        childId: selectedChild.id,
        familyId,
        fromDate: dateRange.from,
        toDate: dateRange.to,
        goals,
        constraints: {
          spread_same_subject: true,
          prefer_morning: true,
        }
      });
      
      setProposal(result);
      setSelectedEvents(new Set(result.events.map(event => event.id)));
    } catch (error) {
      console.error('Error generating proposal:', error);
      showAlert('Error', 'Failed to generate scheduling proposal');
    } finally {
      setLoading(false);
    }
  };

  const commitProposal = async () => {
    if (!proposal) {
      showAlert('Error', 'No proposal to commit');
      return;
    }

    const eventsToCommit = proposal.events.filter(event => 
      selectedEvents.has(event.id)
    );

    if (eventsToCommit.length === 0) {
      showAlert('Error', 'Please select at least one event to commit');
      return;
    }

    try {
      setCommitting(true);
      const result = await plannerService.commitProposal(
        proposal.proposal_id,
        eventsToCommit,
        selectedChild.id,
        familyId
      );
      
      showAlert('Success', `Successfully committed ${result.committed_count} events`);
      setProposal(null);
      setSelectedEvents(new Set());
      onClose();
    } catch (error) {
      console.error('Error committing proposal:', error);
      showAlert('Error', 'Failed to commit events');
    } finally {
      setCommitting(false);
    }
  };

  const toggleEventSelection = (eventId) => {
    const newSelected = new Set(selectedEvents);
    if (newSelected.has(eventId)) {
      newSelected.delete(eventId);
    } else {
      newSelected.add(eventId);
    }
    setSelectedEvents(newSelected);
  };

  const updateGoal = (index, field, value) => {
    const newGoals = [...goals];
    newGoals[index] = { ...newGoals[index], [field]: value };
    setGoals(newGoals);
  };

  const addGoal = () => {
    setGoals([...goals, { subject_id: '', minutes: 60, min_block: 30, max_block: 60 }]);
  };

  const removeGoal = (index) => {
    setGoals(goals.filter((_, i) => i !== index));
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const renderChildSelector = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Select Child</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {children.map(child => (
          <TouchableOpacity
            key={child.id}
            style={[
              styles.childButton,
              selectedChild?.id === child.id && styles.childButtonActive
            ]}
            onPress={() => setSelectedChild(child)}
          >
            <Text style={[
              styles.childButtonText,
              selectedChild?.id === child.id && styles.childButtonTextActive
            ]}>
              {child.first_name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderDateRange = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Date Range</Text>
      <View style={styles.dateRangeContainer}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => showAlert('Date Picker', 'From date picker would open here')}
        >
          <Text style={styles.dateButtonText}>
            From: {formatDate(dateRange.from)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => showAlert('Date Picker', 'To date picker would open here')}
        >
          <Text style={styles.dateButtonText}>
            To: {formatDate(dateRange.to)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderGoals = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Learning Goals</Text>
        <TouchableOpacity style={styles.addButton} onPress={addGoal}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>
      
      {goals.map((goal, index) => (
        <View key={index} style={styles.goalCard}>
          <View style={styles.goalHeader}>
            <TouchableOpacity
              style={styles.goalInput}
              onPress={() => showAlert('Subject Picker', 'Subject picker would open here')}
            >
              <Text style={styles.goalInputText}>
                {goal.subject_id || 'Select subject...'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeGoal(index)}
            >
              <Text style={styles.removeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.goalDetails}>
            <View style={styles.goalDetail}>
              <Text style={styles.goalDetailLabel}>Minutes</Text>
              <TouchableOpacity
                style={styles.goalInputSmall}
                onPress={() => showAlert('Number Input', 'Minutes input would open here')}
              >
                <Text style={styles.goalInputText}>{goal.minutes}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.goalDetail}>
              <Text style={styles.goalDetailLabel}>Min Block</Text>
              <TouchableOpacity
                style={styles.goalInputSmall}
                onPress={() => showAlert('Number Input', 'Min block input would open here')}
              >
                <Text style={styles.goalInputText}>{goal.min_block}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  const renderProposal = () => {
    if (!proposal) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Generated Schedule</Text>
          <View style={styles.proposalStats}>
            <Text style={styles.proposalStat}>
              {proposal.metadata.coverage_percentage}% coverage
            </Text>
            <Text style={styles.proposalStat}>
              {proposal.events.length} events
            </Text>
          </View>
        </View>
        
        <ScrollView style={styles.eventsList} showsVerticalScrollIndicator={false}>
          {proposal.events.map(event => (
            <TouchableOpacity
              key={event.id}
              style={[
                styles.eventCard,
                selectedEvents.has(event.id) && styles.eventCardSelected
              ]}
              onPress={() => toggleEventSelection(event.id)}
            >
              <View style={styles.eventHeader}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <View style={[
                  styles.selectionIndicator,
                  selectedEvents.has(event.id) && styles.selectionIndicatorSelected
                ]}>
                  {selectedEvents.has(event.id) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
              </View>
              
              <Text style={styles.eventTime}>
                {formatDate(event.start_ts)} • {formatTime(event.start_ts)} - {formatTime(event.end_ts)}
              </Text>
              
              <Text style={styles.eventRationale}>{event.rationale}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        <View style={styles.commitSection}>
          <TouchableOpacity
            style={[styles.commitButton, committing && styles.commitButtonDisabled]}
            onPress={commitProposal}
            disabled={committing}
          >
            <Text style={styles.commitButtonText}>
              {committing ? 'Committing...' : `Commit ${selectedEvents.size} Events`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>AI Planner</Text>
          <TouchableOpacity
            style={[styles.generateButton, loading && styles.generateButtonDisabled]}
            onPress={generateProposal}
            disabled={loading}
          >
            <Text style={styles.generateButtonText}>
              {loading ? 'Generating...' : 'Generate'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Rules Heatmap */}
          <RulesHeatmap
            familyId={familyId}
            selectedChildId={selectedChild?.id}
            selectedScope={selectedChild ? 'child' : 'family'}
            style={{ marginHorizontal: 20, marginTop: 20 }}
          />
          
          {renderChildSelector()}
          {renderDateRange()}
          {renderGoals()}
          {renderProposal()}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  generateButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  generateButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  childButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  childButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  childButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  childButtonTextActive: {
    color: '#ffffff',
  },
  dateRangeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  dateButton: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dateButtonText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: '#10b981',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  goalCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginRight: 8,
  },
  goalInputText: {
    fontSize: 14,
    color: '#111827',
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  goalDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  goalDetail: {
    flex: 1,
  },
  goalDetailLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  goalInputSmall: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    padding: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  proposalStats: {
    flexDirection: 'row',
    gap: 12,
  },
  proposalStat: {
    fontSize: 12,
    color: '#6b7280',
  },
  eventsList: {
    maxHeight: 400,
  },
  eventCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  eventCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  selectionIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicatorSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkmark: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  eventTime: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  eventRationale: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  commitSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  commitButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  commitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  commitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default PlannerPreview;
