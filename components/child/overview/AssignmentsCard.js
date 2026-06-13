/**
 * Assignments Card for Child Overview
 * Shows assignments due soon and submitted assignments needing review
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { FileText, Clock, AlertCircle } from 'lucide-react';
import { getAssignments } from '../../../lib/services/assignmentsClient';
import { colors } from '../../../theme/colors';
import AssignmentCard from '../../assignments/AssignmentCard';
import SubmitForReviewModal from '../SubmitForReviewModal';
import WorkReviewModal from '../../assignments/WorkReviewModal';

export default function AssignmentsCard({
  childId,
  familyId,
  onNavigate,
  embedded = false,
  isParentViewer = false,
}) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    if (childId) loadAssignments();
  }, [childId]);

  const loadAssignments = async () => {
    if (!childId) return;
    try {
      setLoading(true);
      const { data, error } = await getAssignments(childId);
      setAssignments(error ? [] : (data || []));
    } catch (_) {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const dueSoon = assignments.filter((a) => {
    if (!a.due_date) return false;
    const dueDate = new Date(a.due_date);
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return dueDate >= now && dueDate <= nextWeek && a.status !== 'accepted';
  }).slice(0, 5);

  const needsReview = assignments.filter((a) => a.status === 'submitted').slice(0, 5);

  const handleAssignmentPress = (assignment) => {
    setSelectedAssignment(assignment);
    if (isParentViewer && assignment.status === 'submitted') {
      setShowReviewModal(true);
    } else {
      setShowDetailModal(true);
    }
  };

  const closeModals = async () => {
    await loadAssignments();
    setShowDetailModal(false);
    setShowReviewModal(false);
    setSelectedAssignment(null);
  };

  const cardStyle = embedded ? [styles.card, styles.cardEmbedded] : styles.card;

  if (loading) {
    return (
      <View style={cardStyle}>
        <Text style={styles.title}>Assignments</Text>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={cardStyle}>
        <View style={styles.header}>
          <FileText size={20} color={colors.text} />
          <Text style={styles.title}>Assignments</Text>
          {onNavigate ? (
            <TouchableOpacity onPress={() => onNavigate('assignments')} style={styles.viewAllButton}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {needsReview.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AlertCircle size={16} color={colors.orangeBold} />
              <Text style={styles.sectionTitle}>Needs Review ({needsReview.length})</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
              {needsReview.map((assignment) => (
                <View key={assignment.id} style={styles.assignmentWrapper}>
                  <AssignmentCard assignment={assignment} onPress={() => handleAssignmentPress(assignment)} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {dueSoon.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Clock size={16} color={colors.blueBold} />
              <Text style={styles.sectionTitle}>Due Soon ({dueSoon.length})</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
              {dueSoon.map((assignment) => (
                <View key={assignment.id} style={styles.assignmentWrapper}>
                  <AssignmentCard assignment={assignment} onPress={() => handleAssignmentPress(assignment)} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {dueSoon.length === 0 && needsReview.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No assignments at this time</Text>
          </View>
        ) : null}
      </View>

      <SubmitForReviewModal
        visible={showDetailModal}
        assignment={selectedAssignment}
        childId={childId}
        familyId={familyId}
        viewOnly={isParentViewer}
        onClose={closeModals}
        onSubmitted={closeModals}
      />

      <WorkReviewModal
        visible={showReviewModal}
        assignment={selectedAssignment}
        onClose={() => {
          setShowReviewModal(false);
          setSelectedAssignment(null);
        }}
        onReviewed={closeModals}
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
  cardEmbedded: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  viewAllButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.blueBold,
  },
  section: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  scroll: {
    marginHorizontal: -4,
  },
  assignmentWrapper: {
    width: 260,
    marginHorizontal: 4,
  },
  emptyState: {
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
  },
});
