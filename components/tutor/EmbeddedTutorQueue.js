/**
 * EmbeddedTutorQueue
 * 
 * Compact tutor queue for right rail.
 * Shows assignments needing feedback.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { FileText, MessageSquare, User, ChevronRight } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { getAssignments } from '../../lib/services/assignmentsClient';
import TutorFeedbackModal from './TutorFeedbackModal';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';

export default function EmbeddedTutorQueue({ familyId, limit = 5, onViewAll }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

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
      
      // Load children
      const { supabase } = await import('../../lib/supabase');
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
            const assignmentsWithChild = data
              .filter(a => a.status === 'submitted') // Only submitted assignments
              .map(a => ({
                ...a,
                child_id: childId,
                child: childrenData?.find(c => c.id === childId),
              }));
            allAssignments.push(...assignmentsWithChild);
          }
        } catch (error) {
          console.error(`[EmbeddedTutorQueue] Error loading assignments for child ${childId}:`, error);
        }
      }

      // Sort by updated_at (most recent first)
      allAssignments.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0);
        const dateB = new Date(b.updated_at || b.created_at || 0);
        return dateB - dateA;
      });

      setAssignments(allAssignments.slice(0, limit));
    } catch (error) {
      console.error('[EmbeddedTutorQueue] Error loading data:', error);
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

  const handleFeedback = (assignment) => {
    setSelectedAssignment(assignment);
    setShowFeedbackModal(true);
  };

  const handleFeedbackComplete = () => {
    setShowFeedbackModal(false);
    setSelectedAssignment(null);
    loadData();
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Needs Feedback</Text>
          {onViewAll && (
            <TouchableOpacity
              onPress={onViewAll}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.viewAllText}>View all</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : assignments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nothing here</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {assignments.map((assignment) => {
              const childName = getChildName(assignment.child_id);
              const childColor = getChildColor(assignment.child_id);

              return (
                <TouchableOpacity
                  key={assignment.id}
                  style={styles.item}
                  onPress={() => handleFeedback(assignment)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.itemHeader}>
                    <View style={[styles.childDot, { backgroundColor: childColor }]} />
                    <Text style={styles.childName} numberOfLines={1}>{childName}</Text>
                  </View>
                  <Text style={styles.itemTitle} numberOfLines={2}>{assignment.title}</Text>
                  <View style={styles.itemFooter}>
                    <MessageSquare size={12} color={colors.textSecondary} />
                    <Text style={styles.itemDate}>
                      {assignment.updated_at 
                        ? new Date(assignment.updated_at).toLocaleDateString()
                        : 'Recently'}
                    </Text>
                    <ChevronRight size={14} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

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
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewAllText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    maxHeight: 400,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.bgSubtle,
      },
    }),
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  childDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  childName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemDate: {
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
