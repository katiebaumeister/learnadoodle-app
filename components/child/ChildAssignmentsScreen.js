/**
 * Child Assignments Screen
 * 
 * Full assignments list with filters:
 * - Due soon
 * - Overdue
 * - Submitted
 * - Needs revision
 * 
 * Features:
 * - One-tap submit button on each card
 * - Ask for Help button
 * - Status chips
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { FileText, Clock, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { getAssignments } from '../../lib/services/assignmentsClient';
import AssignmentCard from '../assignments/AssignmentCard';
import AssignmentDetailModal from '../assignments/AssignmentDetailModal';
import OneTapSubmitButton from './OneTapSubmitButton';
import AskForHelpModal from './AskForHelpModal';
import QuickSubmitModal from '../assignments/QuickSubmitModal';
import { submitAssignment, toggleNeedHelp } from '../../lib/services/assignmentsClient';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'due_soon', label: 'Due Soon' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'needs_revision', label: 'Needs Revision' },
];

export default function ChildAssignmentsScreen({ familyId, onNavigate }) {
  const session = useSession();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showQuickSubmit, setShowQuickSubmit] = useState(false);
  const [quickSubmitAssignment, setQuickSubmitAssignment] = useState(null);

  const childId = session?.child_id || (session?.accessible_children?.[0]?.id);
  const child = session?.accessible_children?.[0];

  useEffect(() => {
    if (session && !session.loading && childId) {
      loadAssignments();
    }
  }, [session, childId]);

  const loadAssignments = async () => {
    if (!childId) return;

    try {
      setLoading(true);
      const { data, error } = await getAssignments(childId);

      if (error) {
        console.error('[ChildAssignmentsScreen] Error loading assignments:', error);
        setAssignments([]);
        return;
      }

      setAssignments(data || []);
    } catch (error) {
      console.error('[ChildAssignmentsScreen] Error loading assignments:', error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAssignments = (assignments, filterId = selectedFilter) => {
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    switch (filterId) {
      case 'due_soon':
        return assignments.filter(a => {
          if (!a.due_date) return false;
          const dueDate = new Date(a.due_date);
          return dueDate >= now && dueDate <= nextWeek && 
                 a.status !== 'accepted' && 
                 a.status !== 'submitted' &&
                 a.review_status !== 'approved';
        });
      case 'overdue':
        return assignments.filter(a => {
          if (!a.due_date) return false;
          const dueDate = new Date(a.due_date);
          return dueDate < now && 
                 a.status !== 'accepted' && 
                 a.status !== 'submitted' &&
                 a.review_status !== 'approved';
        });
      case 'submitted':
        return assignments.filter(a => 
          a.status === 'submitted' || a.review_status === 'approved'
        );
      case 'needs_revision':
        return assignments.filter(a => 
          a.review_status === 'needs_revision'
        );
      default:
        return assignments;
    }
  };

  const filteredAssignments = filterAssignments(assignments);

  // Calculate counts for each filter
  const getFilterCount = (filterId) => {
    if (filterId === 'all') return assignments.length;
    return filterAssignments(assignments, filterId).length;
  };

  const handleAssignmentPress = (assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailModal(true);
  };

  const handleSubmit = async (assignmentId, evidenceId) => {
    const { error } = await submitAssignment(assignmentId, evidenceId);
    if (!error) {
      await loadAssignments();
      setShowDetailModal(false);
    }
  };

  const handleToggleHelp = async (assignmentId) => {
    const { error } = await toggleNeedHelp(assignmentId);
    if (!error) {
      await loadAssignments();
      if (selectedAssignment?.id === assignmentId) {
        setSelectedAssignment({ ...selectedAssignment, need_help: !selectedAssignment.need_help });
      }
    }
  };

  const handleQuickSubmit = (assignment) => {
    setQuickSubmitAssignment(assignment);
    setShowQuickSubmit(true);
  };

  const handleQuickSubmitted = async (assignmentId, evidenceId) => {
    await loadAssignments();
    setShowQuickSubmit(false);
    setQuickSubmitAssignment(null);
  };

  if (session?.loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#887DEE" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!childId || !child) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load your assignments.</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Assignments</Text>
          <TouchableOpacity
            style={styles.helpButton}
            onPress={() => setShowHelpModal(true)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <HelpCircle size={18} color="#887DEE" />
            <Text style={styles.helpButtonText}>Help</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
          {FILTERS.map(filter => {
            const isActive = selectedFilter === filter.id;
            const count = getFilterCount(filter.id);
            
            return (
              <TouchableOpacity
                key={filter.id}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setSelectedFilter(filter.id)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label} {count > 0 && `(${count})`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Assignments List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#887DEE" />
            <Text style={styles.loadingText}>Loading assignments...</Text>
          </View>
        ) : filteredAssignments.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={48} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {selectedFilter === 'all' 
                ? 'No assignments yet' 
                : `No ${FILTERS.find(f => f.id === selectedFilter)?.label.toLowerCase()} assignments`}
            </Text>
            <Text style={styles.emptyText}>
              {selectedFilter === 'all'
                ? 'Assignments will appear here when they\'re assigned to you.'
                : 'Try selecting a different filter.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
          >
            {filteredAssignments.map((assignment) => (
              <View key={assignment.id} style={styles.assignmentCardWrapper}>
                <AssignmentCard
                  assignment={assignment}
                  onPress={() => handleAssignmentPress(assignment)}
                  // Don't pass onQuickSubmit - we use OneTapSubmitButton below instead
                />
                {/* One-tap submit button and help badge */}
                <View style={styles.actionRow}>
                  <OneTapSubmitButton
                    assignment={assignment}
                    childId={childId}
                    familyId={familyId}
                    onSubmitted={handleQuickSubmitted}
                  />
                  {assignment.need_help && (
                    <View style={styles.helpBadge}>
                      <HelpCircle size={14} color="#f59e0b" />
                      <Text style={styles.helpBadgeText}>Help requested</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Assignment Detail Modal */}
      <AssignmentDetailModal
        visible={showDetailModal}
        assignment={selectedAssignment}
        childId={childId}
        familyId={familyId}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedAssignment(null);
        }}
        onSubmit={handleSubmit}
        onToggleHelp={handleToggleHelp}
        onReview={null} // Children can't review
      />

      {/* Quick Submit Modal */}
      <QuickSubmitModal
        visible={showQuickSubmit}
        assignment={quickSubmitAssignment}
        childId={childId}
        familyId={familyId}
        showReflection={true} // Show reflection prompts after submission
        onClose={() => {
          setShowQuickSubmit(false);
          setQuickSubmitAssignment(null);
        }}
        onSubmitted={handleQuickSubmitted}
      />

      {/* Ask for Help Modal */}
      <AskForHelpModal
        visible={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        assignment={selectedAssignment}
        childId={childId}
        familyId={familyId}
        onHelpRequested={() => {
          setShowHelpModal(false);
          loadAssignments();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 32,
  },
  errorText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#887DEE',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  filterChipActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#887DEE',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: '#887DEE',
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  assignmentCardWrapper: {
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  helpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#fef3c7',
  },
  helpBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#f59e0b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
