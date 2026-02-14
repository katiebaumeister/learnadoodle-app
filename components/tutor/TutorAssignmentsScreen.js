/**
 * Tutor Assignments Screen
 * 
 * Shows assignments for all assigned children.
 * Tutors can:
 * - View assignments
 * - Provide feedback (no approval/rejection)
 * - See submission status
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { FileText, Clock, MessageSquare, User, CheckCircle, AlertCircle } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { getAssignments } from '../../lib/services/assignmentsClient';
import TutorFeedbackModal from './TutorFeedbackModal';
import AssignmentDetailModal from '../assignments/AssignmentDetailModal';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'needs_feedback', label: 'Needs Feedback' },
];

export default function TutorAssignmentsScreen({ familyId }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (session && !session.loading && session.accessible_children) {
      loadData();
    }
  }, [session]);

  const loadData = async () => {
    if (!session.accessible_children || session.accessible_children.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const childIds = session.accessible_children.map(c => c.id);
      
      // Load children details
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('id, first_name, name, avatar')
        .in('id', childIds);

      if (childrenError) throw childrenError;
      setChildren(childrenData || []);

      // Load assignments for all assigned children
      const allAssignments = [];
      for (const childId of childIds) {
        try {
          const { data, error } = await getAssignments(childId);
          if (!error && data) {
            // Add child info to each assignment
            const assignmentsWithChild = data.map(a => ({
              ...a,
              child_id: childId,
              child: childrenData?.find(c => c.id === childId),
            }));
            allAssignments.push(...assignmentsWithChild);
          }
        } catch (error) {
          console.error(`[TutorAssignmentsScreen] Error loading assignments for child ${childId}:`, error);
        }
      }

      // Sort by updated_at (most recent first)
      allAssignments.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0);
        const dateB = new Date(b.updated_at || b.created_at || 0);
        return dateB - dateA;
      });

      setAssignments(allAssignments);
    } catch (error) {
      console.error('[TutorAssignmentsScreen] Error loading data:', error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const getChildName = (childId) => {
    const child = children.find(c => c.id === childId) || 
                 assignments.find(a => a.child_id === childId)?.child;
    return child?.first_name || child?.name || 'Unknown';
  };

  const getChildColor = (childId) => {
    const child = children.find(c => c.id === childId) || 
                 assignments.find(a => a.child_id === childId)?.child;
    if (!child) return colors.muted;
    return getChildColorFromAvatar(child.avatar);
  };

  const filterAssignments = () => {
    switch (selectedFilter) {
      case 'submitted':
        return assignments.filter(a => a.status === 'submitted');
      case 'in_progress':
        return assignments.filter(a => a.status === 'in_progress' || a.status === 'not_started');
      case 'needs_feedback':
        // Assignments that are submitted but don't have tutor feedback yet
        return assignments.filter(a => 
          a.status === 'submitted' && 
          !a.has_tutor_feedback // This would need to be computed from assignment_comments
        );
      default:
        return assignments;
    }
  };

  const filteredAssignments = filterAssignments();

  const getFilterCount = (filterId) => {
    if (filterId === 'all') return assignments.length;
    switch (filterId) {
      case 'submitted':
        return assignments.filter(a => a.status === 'submitted').length;
      case 'in_progress':
        return assignments.filter(a => a.status === 'in_progress' || a.status === 'not_started').length;
      case 'needs_feedback':
        return assignments.filter(a => 
          a.status === 'submitted' && !a.has_tutor_feedback
        ).length;
      default:
        return 0;
    }
  };

  const handleFeedback = (assignment) => {
    setSelectedAssignment(assignment);
    setShowFeedbackModal(true);
  };

  const handleViewDetails = (assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailModal(true);
  };

  const handleFeedbackSubmitted = async () => {
    await loadData();
    setShowFeedbackModal(false);
    setSelectedAssignment(null);
  };

  if (session?.loading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading assignments...</Text>
      </View>
    );
  }

  if (assignments.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <FileText size={48} color={colors.muted} />
        <Text style={styles.emptyTitle}>No Assignments</Text>
        <Text style={styles.emptyText}>
          There are no assignments for your students yet.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Assignments</Text>
          <Text style={styles.subtitle}>
            {filteredAssignments.length} {filteredAssignments.length === 1 ? 'assignment' : 'assignments'}
          </Text>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filters}
          contentContainerStyle={styles.filtersContent}
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
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {filter.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
                    <Text style={styles.countText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Assignments List */}
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
        >
          {filteredAssignments.map((assignment) => {
            const childName = getChildName(assignment.child_id);
            const childColor = getChildColor(assignment.child_id);
            const isSubmitted = assignment.status === 'submitted';

            return (
              <View key={assignment.id} style={styles.assignmentCard}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={[styles.childAvatar, { backgroundColor: childColor + '20' }]}>
                      <User size={16} color={childColor} />
                    </View>
                    <Text style={styles.childName}>{childName}</Text>
                    {isSubmitted && (
                      <View style={styles.statusBadge}>
                        <CheckCircle size={12} color={colors.greenBold} />
                        <Text style={styles.statusText}>Submitted</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Assignment Title */}
                <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                
                {assignment.description && (
                  <Text style={styles.assignmentDescription} numberOfLines={2}>
                    {assignment.description}
                  </Text>
                )}

                {/* Metadata */}
                <View style={styles.metadata}>
                  {assignment.due_date && (
                    <View style={styles.metaItem}>
                      <Clock size={12} color={colors.textSecondary} />
                      <Text style={styles.metaText}>
                        Due {new Date(assignment.due_date).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() => handleViewDetails(assignment)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.viewButtonText}>View Details</Text>
                  </TouchableOpacity>
                  {isSubmitted && (
                    <TouchableOpacity
                      style={styles.feedbackButton}
                      onPress={() => handleFeedback(assignment)}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <MessageSquare size={16} color={colors.white} />
                      <Text style={styles.feedbackButtonText}>Provide Feedback</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Feedback Modal */}
      <TutorFeedbackModal
        visible={showFeedbackModal}
        assignment={selectedAssignment}
        onClose={() => {
          setShowFeedbackModal(false);
          setSelectedAssignment(null);
        }}
        onFeedbackSubmitted={handleFeedbackSubmitted}
      />

      {/* Detail Modal */}
      <AssignmentDetailModal
        visible={showDetailModal}
        assignment={selectedAssignment}
        childId={selectedAssignment?.child_id}
        familyId={familyId}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedAssignment(null);
        }}
        onSubmit={null} // Tutors don't submit
        onToggleHelp={null} // Tutors don't toggle help
        onReview={() => {
          setShowDetailModal(false);
          setShowFeedbackModal(true);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
    backgroundColor: colors.card,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  header: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filters: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.bgOffset,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  countBadge: {
    backgroundColor: colors.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  countBadgeActive: {
    backgroundColor: colors.primary,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  assignmentCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  childAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  childName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.greenSoft,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.greenBold,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  viewButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.bgOffset,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  feedbackButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
