import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getAssignments } from '../../../lib/services/assignmentsClient';
import { colors } from '../../../theme/colors';
import AssignmentCard from '../../assignments/AssignmentCard';
import SubmitForReviewModal from '../SubmitForReviewModal';
import WorkReviewModal from '../../assignments/WorkReviewModal';
import QuickSubmitModal from '../../assignments/QuickSubmitModal';

export default function AssignmentsTab({ child, familyId, isParentViewer = false }) {
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
        setAssignments([]);
        return;
      }
      setAssignments(data || []);
    } catch (_) {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedAssignment(null);
    fetchAssignments();
  };

  const handleAssignmentPress = (assignment) => {
    setSelectedAssignment(assignment);
    if (isParentViewer && (assignment.status === 'submitted' || assignment.submitted_at)) {
      setShowReviewModal(true);
    } else {
      setShowDetailModal(true);
    }
  };

  const handleReviewed = async () => {
    await fetchAssignments();
    setShowReviewModal(false);
    setShowDetailModal(false);
    setSelectedAssignment(null);
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
                onQuickSubmit={isParentViewer ? undefined : handleQuickSubmit}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <SubmitForReviewModal
        visible={showDetailModal}
        assignment={selectedAssignment}
        childId={child?.id}
        familyId={familyId}
        viewOnly={isParentViewer}
        onClose={closeDetailModal}
        onSubmitted={closeDetailModal}
      />

      <WorkReviewModal
        visible={showReviewModal}
        assignment={selectedAssignment}
        onClose={() => {
          setShowReviewModal(false);
          setSelectedAssignment(null);
        }}
        onReviewed={handleReviewed}
      />

      {!isParentViewer ? (
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
      ) : null}
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
