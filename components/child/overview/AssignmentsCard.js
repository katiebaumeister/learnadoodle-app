/**
 * Assignments Card for Child Overview
 * Shows assignments due soon and submitted assignments needing review
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { FileText, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { getAssignments } from '../../../lib/services/assignmentsClient';
import { colors } from '../../../theme/colors';
import AssignmentCard from '../../assignments/AssignmentCard';
import AssignmentDetailModal from '../../assignments/AssignmentDetailModal';
import AssignmentReviewModal from '../../assignments/AssignmentReviewModal';
import { submitAssignment, toggleNeedHelp, reviewAssignment } from '../../../lib/services/assignmentsClient';

export default function AssignmentsCard({ childId, familyId, onNavigate }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    if (childId) {
      loadAssignments();
    }
  }, [childId]);

  const loadAssignments = async () => {
    if (!childId) return;
    try {
      setLoading(true);
      const { data, error } = await getAssignments(childId);
      if (error) {
        console.error('Error loading assignments:', error);
        setAssignments([]);
        return;
      }
      setAssignments(data || []);
    } catch (error) {
      console.error('Error loading assignments:', error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const dueSoon = assignments.filter(a => {
    if (!a.due_date) return false;
    const dueDate = new Date(a.due_date);
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return dueDate >= now && dueDate <= nextWeek && a.status !== 'accepted';
  }).slice(0, 5);

  const needsReview = assignments.filter(a => a.status === 'submitted').slice(0, 5);

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

  const handleReview = (assignment) => {
    setSelectedAssignment(assignment);
    setShowReviewModal(true);
  };

  const handleReviewed = async () => {
    await loadAssignments();
    setShowReviewModal(false);
    setShowDetailModal(false);
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Assignments</Text>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <FileText size={20} color={colors.text} />
          <Text style={styles.title}>Assignments</Text>
          {onNavigate && (
            <TouchableOpacity
              onPress={() => onNavigate('assignments')}
              style={styles.viewAllButton}
            >
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          )}
        </View>

        {needsReview.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AlertCircle size={16} color={colors.orangeBold} />
              <Text style={styles.sectionTitle}>Needs Review ({needsReview.length})</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
              {needsReview.map(assignment => (
                <View key={assignment.id} style={styles.assignmentWrapper}>
                  <AssignmentCard
                    assignment={assignment}
                    onPress={() => handleAssignmentPress(assignment)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {dueSoon.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Clock size={16} color={colors.blueBold} />
              <Text style={styles.sectionTitle}>Due Soon ({dueSoon.length})</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
              {dueSoon.map(assignment => (
                <View key={assignment.id} style={styles.assignmentWrapper}>
                  <AssignmentCard
                    assignment={assignment}
                    onPress={() => handleAssignmentPress(assignment)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {dueSoon.length === 0 && needsReview.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No assignments at this time</Text>
          </View>
        )}
      </View>

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
        onReview={handleReview}
      />

      <AssignmentReviewModal
        visible={showReviewModal}
        assignment={selectedAssignment}
        onClose={() => {
          setShowReviewModal(false);
          setSelectedAssignment(null);
        }}
        onReviewed={handleReviewed}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  viewAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  scroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  assignmentWrapper: {
    width: 280,
    marginRight: 12,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    padding: 16,
  },
});

