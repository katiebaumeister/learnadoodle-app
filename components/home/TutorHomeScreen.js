/**
 * TutorHomeScreen
 * 
 * Tutor dashboard with:
 * - Assigned students overview
 * - Assignments feed (filtered by child)
 * - Right rail: Needs feedback queue, upcoming sessions
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, ActivityIndicator, TouchableOpacity } from 'react-native';
import { User, FileText, MessageSquare, Clock } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { getAssignments } from '../../lib/services/assignmentsClient';
import RoleHomeShell from './RoleHomeShell';
import HomeHeroCard from './HomeHeroCard';
import EmptyStateCard from './EmptyStateCard';
import EmbeddedTutorQueue from '../tutor/EmbeddedTutorQueue';
import TutorFeedbackModal from '../tutor/TutorFeedbackModal';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'needs_feedback', label: 'Needs Feedback' },
];

export default function TutorHomeScreen({ familyId, onNavigate }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState('all');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [needsFeedbackCount, setNeedsFeedbackCount] = useState(0);

  const sessionLoading = session?.loading;
  const accessibleChildIdsKey = (session?.accessible_children || [])
    .map((c) => (typeof c === 'string' ? c : c?.id))
    .filter(Boolean)
    .sort()
    .join(',');
  useEffect(() => {
    if (sessionLoading !== false || !accessibleChildIdsKey || !session) return;
    loadData();
  }, [sessionLoading, accessibleChildIdsKey]);

  const loadData = async () => {
    if (!session.accessible_children || session.accessible_children.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const childIds = session.accessible_children.map(c => c.id);
      
      // Load children
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
            const assignmentsWithChild = data.map(a => ({
              ...a,
              child_id: childId,
              child: childrenData?.find(c => c.id === childId),
            }));
            allAssignments.push(...assignmentsWithChild);
          }
        } catch (error) {
          console.error(`[TutorHomeScreen] Error loading assignments for child ${childId}:`, error);
        }
      }

      // Sort by updated_at (most recent first)
      allAssignments.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0);
        const dateB = new Date(b.updated_at || b.created_at || 0);
        return dateB - dateA;
      });

      setAssignments(allAssignments);
      
      // Count needs feedback
      const needsFeedback = allAssignments.filter(a => 
        a.status === 'submitted' && !a.has_tutor_feedback
      ).length;
      setNeedsFeedbackCount(needsFeedback);
    } catch (error) {
      console.error('[TutorHomeScreen] Error loading data:', error);
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
    let filtered = assignments;

    // Filter by child
    if (selectedChildId !== 'all') {
      filtered = filtered.filter(a => a.child_id === selectedChildId);
    }

    // Filter by status
    switch (selectedFilter) {
      case 'submitted':
        return filtered.filter(a => a.status === 'submitted');
      case 'in_progress':
        return filtered.filter(a => a.status === 'in_progress' || a.status === 'not_started');
      case 'needs_feedback':
        return filtered.filter(a => 
          a.status === 'submitted' && !a.has_tutor_feedback
        );
      default:
        return filtered;
    }
  };

  const filteredAssignments = filterAssignments();

  const handleFeedback = (assignment) => {
    setSelectedAssignment(assignment);
    setShowFeedbackModal(true);
  };

  const handleFeedbackComplete = () => {
    setShowFeedbackModal(false);
    setSelectedAssignment(null);
    loadData();
  };

  if (session?.loading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!session.accessible_children || session.accessible_children.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <EmptyStateCard
          title="No students assigned yet"
          subtitle="You'll see your assigned students here once they're added."
        />
      </View>
    );
  }

  const heroProps = {
    date: new Date(),
    title: "Tutor dashboard",
    subtitle: "Feedback and guidance for your assigned students.",
    chips: [
      { label: 'students', value: children.length, onClick: () => {} },
      { label: 'assignments', value: assignments.length, onClick: () => {} },
    ],
  };

  const mainContent = (
    <View style={styles.mainContent}>
      {/* Assigned Students Row */}
      <View style={styles.studentsRow}>
        <TouchableOpacity
          style={[styles.studentChip, selectedChildId === 'all' && styles.studentChipActive]}
          onPress={() => setSelectedChildId('all')}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={[styles.studentChipText, selectedChildId === 'all' && styles.studentChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {children.map(child => (
          <TouchableOpacity
            key={child.id}
            style={[
              styles.studentChip,
              selectedChildId === child.id && styles.studentChipActive,
              { borderColor: getChildColor(child.id) },
            ]}
            onPress={() => setSelectedChildId(child.id)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={[styles.childDot, { backgroundColor: getChildColor(child.id) }]} />
            <Text style={[styles.studentChipText, selectedChildId === child.id && styles.studentChipTextActive]}>
              {child.first_name || child.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {FILTERS.map(filter => (
          <TouchableOpacity
            key={filter.id}
            style={[styles.filterTab, selectedFilter === filter.id && styles.filterTabActive]}
            onPress={() => setSelectedFilter(filter.id)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.filterTabText, selectedFilter === filter.id && styles.filterTabTextActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Assignments Feed */}
      {filteredAssignments.length === 0 ? (
        <EmptyStateCard
          title="No assignments"
          subtitle="Assignments will appear here when students submit work."
        />
      ) : (
        <ScrollView style={styles.assignmentsList} showsVerticalScrollIndicator={false}>
          {filteredAssignments.map((assignment) => {
            const childName = getChildName(assignment.child_id);
            const childColor = getChildColor(assignment.child_id);

            return (
              <View key={assignment.id} style={styles.assignmentCard}>
                <View style={styles.assignmentHeader}>
                  <View style={styles.assignmentHeaderLeft}>
                    <View style={[styles.childDot, { backgroundColor: childColor }]} />
                    <Text style={styles.childName}>{childName}</Text>
                    {assignment.subject && (
                      <Text style={styles.subjectName}>· {assignment.subject}</Text>
                    )}
                  </View>
                  {assignment.status === 'submitted' && (
                    <TouchableOpacity
                      style={styles.feedbackButton}
                      onPress={() => handleFeedback(assignment)}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <MessageSquare size={14} color={colors.primary} />
                      <Text style={styles.feedbackButtonText}>Provide Feedback</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                {assignment.description && (
                  <Text style={styles.assignmentDescription} numberOfLines={2}>
                    {assignment.description}
                  </Text>
                )}
                <View style={styles.assignmentFooter}>
                  <Text style={styles.assignmentStatus}>
                    {assignment.status === 'submitted' ? 'Submitted' : 
                     assignment.status === 'in_progress' ? 'In Progress' : 
                     assignment.status}
                  </Text>
                  {assignment.due_date && (
                    <View style={styles.dueDateRow}>
                      <Clock size={12} color={colors.textSecondary} />
                      <Text style={styles.dueDateText}>
                        Due: {new Date(assignment.due_date).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const railContent = (
    <View style={styles.railContent}>
      <EmbeddedTutorQueue
        familyId={familyId}
        limit={5}
        onViewAll={() => onNavigate?.('assignments')}
      />

      {/* Upcoming Sessions placeholder */}
      <View style={styles.sessionsCard}>
        <Text style={styles.sessionsTitle}>Upcoming sessions</Text>
        <Text style={styles.sessionsText}>No upcoming sessions</Text>
      </View>
    </View>
  );

  return (
    <>
      <RoleHomeShell
        heroProps={heroProps}
        main={mainContent}
        rail={railContent}
      />

      {selectedAssignment && (
        <TutorFeedbackModal
          visible={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          assignment={selectedAssignment}
          onFeedbackSubmitted={handleFeedbackComplete}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorContainer: {
    flex: 1,
    padding: 20,
  },
  mainContent: {
    gap: 20,
  },
  studentsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  studentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.bgSubtle,
      },
    }),
  },
  studentChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  childDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  studentChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.border,
      },
    }),
  },
  filterTabActive: {
    backgroundColor: colors.primarySoft,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterTabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  assignmentsList: {
    maxHeight: 600,
  },
  assignmentCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  assignmentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  childName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectName: {
    fontSize: 13,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: colors.primarySoft,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.primary,
      },
    }),
  },
  feedbackButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assignmentStatus: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueDateText: {
    fontSize: 11,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  railContent: {
    gap: 20,
  },
  sessionsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  sessionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sessionsText: {
    fontSize: 13,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
