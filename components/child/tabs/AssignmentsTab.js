import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Plus } from 'lucide-react';
import { getAssignments } from '../../../lib/services/assignmentsClient';
import { colors } from '../../../theme/colors';
import AssignmentCard from '../../assignments/AssignmentCard';
import AssignmentDetailModal from '../../assignments/AssignmentDetailModal';
import AssignmentReviewModal from '../../assignments/AssignmentReviewModal';
import QuickSubmitModal from '../../assignments/QuickSubmitModal';
import { submitAssignment, toggleNeedHelp, reviewAssignment } from '../../../lib/services/assignmentsClient';

export default function AssignmentsTab({ child, familyId }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showQuickSubmit, setShowQuickSubmit] = useState(false);
  const [quickSubmitAssignment, setQuickSubmitAssignment] = useState(null);

  useEffect(() => {
    fetchAssignments();
  }, [child?.id]);

  const fetchAssignments = async () => {
    if (!child?.id) return;
    
    try {
      setLoading(true);
      const { data, error } = await getAssignments(child.id);

      if (error) {
        console.error('Error fetching assignments:', error);
        setAssignments([]);
        return;
      }

      setAssignments(data || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentPress = (assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailModal(true);
  };

  const handleSubmit = async (assignmentId, evidenceId) => {
    const { error } = await submitAssignment(assignmentId, evidenceId);
    if (!error) {
      await fetchAssignments();
      setShowDetailModal(false);
    }
  };

  const handleToggleHelp = async (assignmentId) => {
    const { error } = await toggleNeedHelp(assignmentId);
    if (!error) {
      await fetchAssignments();
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
    await fetchAssignments();
    setShowReviewModal(false);
    setShowDetailModal(false);
  };

  const handleQuickSubmit = (assignment) => {
    setQuickSubmitAssignment(assignment);
    setShowQuickSubmit(true);
  };

  const handleQuickSubmitted = async () => {
    await fetchAssignments();
    setShowQuickSubmit(false);
    setQuickSubmitAssignment(null);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Assignments for {child?.first_name || child?.name}</Text>
        </View>

        {assignments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No assignments yet. Assignments will appear here when created.
            </Text>
          </View>
        ) : (
          <View style={styles.cardsContainer}>
            {assignments.map((assignment) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                onPress={() => handleAssignmentPress(assignment)}
                onQuickSubmit={handleQuickSubmit}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <AssignmentDetailModal
        visible={showDetailModal}
        assignment={selectedAssignment}
        childId={child?.id}
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

      <QuickSubmitModal
        visible={showQuickSubmit}
        assignment={quickSubmitAssignment}
        childId={child?.id}
        familyId={familyId}
        onClose={() => {
          setShowQuickSubmit(false);
          setQuickSubmitAssignment(null);
        }}
        onSubmitted={handleQuickSubmitted}
      />
    </>
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
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.card,
  },
  cardsContainer: {
    padding: 16,
  },
  emptyState: {
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
});

