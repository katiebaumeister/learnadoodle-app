import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { plannerService } from '../lib/plannerService';
import RulesHeatmap from './RulesHeatmap';
import PageHeader from './PageHeader';
import { Sparkles, Download } from 'lucide-react';

/**
 * Full-screen AI Planner view
 * Generate optimal schedules using AI
 */
const AIPlannerView = ({ familyId, children, urlParams = {} }) => {
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

  // Initialize from URL parameters
  useEffect(() => {
    if (children && children.length > 0) {
      // Set child from URL param or default to first
      if (urlParams.plan_for_child) {
        const child = children.find(c => c.id === urlParams.plan_for_child);
        if (child) setSelectedChild(child);
      } else {
        setSelectedChild(children[0]);
      }

      // Set date range from URL param or default
      if (urlParams.week) {
        const weekStart = new Date(urlParams.week);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        setDateRange({
          from: weekStart.toISOString().split('T')[0],
          to: weekEnd.toISOString().split('T')[0],
        });
      }

      // Initialize goals
      initializeGoalsFromParams();
    }
  }, [children, urlParams.plan_for_child, urlParams.week]);

  const initializeGoalsFromParams = () => {
    // If AI top-off params are present, create a focused goal
    if (urlParams.ai_topoff_for_subject && urlParams.minutes_needed) {
      const minutesNeeded = parseInt(urlParams.minutes_needed) || 60;
      console.log(`AI Planner pre-filled: ${urlParams.ai_topoff_for_subject} needs ${minutesNeeded} minutes`);
      setGoals([
        { 
          subject_id: urlParams.ai_topoff_for_subject, 
          minutes: minutesNeeded, 
          min_block: 20, 
          max_block: 45 
        },
      ]);
    } else {
      // Initialize with common subjects
      initializeGoals();
    }
  };

  const initializeGoals = () => {
    // Initialize with common subjects
    setGoals([
      { subject_id: 'math', minutes: 180, min_block: 30, max_block: 90 },
      { subject_id: 'reading', minutes: 120, min_block: 20, max_block: 60 },
      { subject_id: 'writing', minutes: 90, min_block: 30, max_block: 60 },
    ]);
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
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
    } catch (error) {
      console.error('Error committing proposal:', error);
      showAlert('Error', 'Failed to commit proposal');
    } finally {
      setCommitting(false);
    }
  };

  const toggleEvent = (eventId) => {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  if (!familyId) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Loading...</Text>
          <Text style={styles.emptyStateText}>Please wait while we load the AI Planner.</Text>
        </View>
      </View>
    );
  }

  const plannerActions = [
    {
      label: loading ? 'Generating...' : 'AI Generate',
      icon: Sparkles,
      primary: true,
      disabled: loading,
      onPress: generateProposal
    },
    {
      label: 'Export Schedule',
      icon: Download,
      onPress: () => {
        if (Platform.OS === 'web') {
          window.alert('Export schedule coming soon!');
        }
      }
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <PageHeader
        title="AI Planner"
        subtitle="Generate optimal schedules automatically"
        actions={plannerActions}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={true}>
        {/* Pre-fill Banner */}
        {(urlParams.ai_topoff_for_subject || urlParams.plan_for_child) && (
          <View style={styles.preFillBanner}>
            <Text style={styles.preFillText}>
              {urlParams.ai_topoff_for_subject 
                ? `📌 Pre-filled: ${urlParams.ai_topoff_for_subject} needs ${urlParams.minutes_needed} minutes`
                : `📌 Planning for ${selectedChild?.first_name || 'child'}`}
            </Text>
          </View>
        )}

        {/* Rules Heatmap */}
        <View style={styles.section}>
          <RulesHeatmap
            familyId={familyId}
            selectedChildId={selectedChild?.id}
            selectedScope={selectedChild ? 'child' : 'family'}
          />
        </View>

        {/* Child Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Child</Text>
          <View style={styles.childSelector}>
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
          </View>
        </View>

        {/* Date Range */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date Range</Text>
          <Text style={styles.sectionSubtitle}>
            From: {dateRange.from} - To: {dateRange.to}
          </Text>
        </View>

        {/* Proposal Results */}
        {proposal && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Proposed Schedule</Text>
              <Text style={styles.eventCount}>
                {selectedEvents.size} / {proposal.events.length} selected
              </Text>
            </View>

            <ScrollView style={styles.proposalList} nestedScrollEnabled={true}>
              {proposal.events.map(event => (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.eventCard,
                    selectedEvents.has(event.id) && styles.eventCardSelected
                  ]}
                  onPress={() => toggleEvent(event.id)}
                >
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventDate}>{event.date}</Text>
                    <Text style={styles.eventTime}>
                      {event.start_time} - {event.end_time}
                    </Text>
                  </View>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventSubject}>{event.subject_id}</Text>
                  {event.rationale && (
                    <Text style={styles.eventRationale}>{event.rationale}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Commit Section */}
            <View style={styles.commitSection}>
              <TouchableOpacity
                style={[styles.commitButton, committing && styles.commitButtonDisabled]}
                onPress={commitProposal}
                disabled={committing}
              >
                <Text style={styles.commitButtonText}>
                  {committing ? 'Committing...' : `Commit ${selectedEvents.size} Events to Calendar`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!proposal && !loading && (
          <View style={styles.emptyProposal}>
            <Text style={styles.emptyProposalText}>
              Click "Generate Schedule" to create an AI-optimized schedule
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
  },
  preFillBanner: {
    backgroundColor: '#e1eeff',
    borderLeftWidth: 4,
    borderLeftColor: '#2f76ff',
    padding: 12,
    marginHorizontal: 32,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  preFillText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  section: {
    padding: 32,
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
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  childSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  childButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  childButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  childButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  childButtonTextActive: {
    color: '#1e40af',
  },
  eventCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  proposalList: {
    maxHeight: 400,
  },
  eventCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  eventCardSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eventDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  eventTime: {
    fontSize: 14,
    color: '#6b7280',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  eventSubject: {
    fontSize: 13,
    color: '#3b82f6',
    marginBottom: 4,
  },
  eventRationale: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  commitSection: {
    marginTop: 24,
  },
  commitButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
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
  emptyProposal: {
    padding: 60,
    alignItems: 'center',
  },
  emptyProposalText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default AIPlannerView;

