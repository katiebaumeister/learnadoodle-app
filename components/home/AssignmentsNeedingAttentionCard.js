/**
 * AssignmentsNeedingAttentionCard
 * 
 * Shows assignments that need parent attention:
 * - Submitted assignments needing review
 * - Help requests
 * - Assignments due soon
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FileText, HelpCircle, Clock, ChevronRight, User } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';
import ReviewInboxModal from '../parent/ReviewInboxModal';

export default function AssignmentsNeedingAttentionCard({ familyId, limit = 3 }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [children, setChildren] = useState([]);
  const [showInboxModal, setShowInboxModal] = useState(false);

  const sessionLoading = session?.loading;
  useEffect(() => {
    if (sessionLoading !== false || !familyId || !session) return;
    loadData();
  }, [sessionLoading, familyId]);

  const loadData = async () => {
    if (!familyId) return;

    setLoading(true);
    try {
      await Promise.all([
        loadAssignments(),
        loadChildren(),
      ]);
    } catch (error) {
      console.error('[AssignmentsNeedingAttentionCard] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async () => {
    try {
      // Get submitted assignments needing review
      const { data: submittedData, error: submittedError } = await supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (id, first_name, avatar),
          subject:related_subject (id, name)
        `)
        .eq('family_id', familyId)
        .eq('status', 'submitted')
        .or('review_status.is.null,review_status.eq.needs_revision')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (submittedError) {
        if (submittedError.code === '42P01' || submittedError.code === 'PGRST200') {
          setAssignments([]);
          return;
        }
        throw submittedError;
      }

      // Get help requests
      const { data: helpData, error: helpError } = await supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (id, first_name, avatar),
          subject:related_subject (id, name)
        `)
        .eq('family_id', familyId)
        .eq('need_help', true)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (helpError && helpError.code !== '42P01' && helpError.code !== 'PGRST200') {
        console.error('[AssignmentsNeedingAttentionCard] Error loading help requests:', helpError);
      }

      // Get assignments due soon (within 2 days)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const { data: dueData, error: dueError } = await supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (id, first_name, avatar),
          subject:related_subject (id, name)
        `)
        .eq('family_id', familyId)
        .in('status', ['not_started', 'in_progress'])
        .gte('due_date', tomorrow.toISOString().split('T')[0])
        .lt('due_date', dayAfter.toISOString().split('T')[0])
        .order('due_date', { ascending: true })
        .limit(limit);

      if (dueError && dueError.code !== '42P01' && dueError.code !== 'PGRST200') {
        console.error('[AssignmentsNeedingAttentionCard] Error loading due soon:', dueError);
      }

      // Combine and deduplicate, prioritize submitted > help > due soon
      const allAssignments = [
        ...(submittedData || []).map(a => ({ ...a, priority: 1, type: 'submitted' })),
        ...(helpData || []).map(a => ({ ...a, priority: 2, type: 'help' })),
        ...(dueData || []).map(a => ({ ...a, priority: 3, type: 'due' })),
      ];

      const uniqueAssignments = Array.from(
        new Map(allAssignments.map(a => [a.id, a])).values()
      ).sort((a, b) => a.priority - b.priority).slice(0, limit);

      setAssignments(uniqueAssignments);
    } catch (error) {
      console.error('[AssignmentsNeedingAttentionCard] Error loading assignments:', error);
      setAssignments([]);
    }
  };

  const loadChildren = async () => {
    try {
      const { data, error } = await supabase
        .from('children')
        .select('id, first_name, avatar')
        .eq('family_id', familyId)
        .order('first_name');

      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error('[AssignmentsNeedingAttentionCard] Error loading children:', error);
      setChildren([]);
    }
  };

  const getChildName = (childId) => {
    const child = children.find(c => c.id === childId) || 
                 assignments.find(a => a.child_id === childId)?.child;
    return child?.first_name || 'Unknown';
  };

  const getChildColor = (childId) => {
    const child = children.find(c => c.id === childId) || 
                 assignments.find(a => a.child_id === childId)?.child;
    if (!child) return colors.muted;
    return getChildColorFromAvatar(child.avatar);
  };

  const getAssignmentLabel = (assignment) => {
    if (assignment.type === 'submitted') {
      return assignment.review_status === 'needs_revision' ? 'Needs revision' : 'Needs review';
    } else if (assignment.type === 'help') {
      return 'Help requested';
    } else if (assignment.type === 'due') {
      const dueDate = new Date(assignment.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dueDate.getTime() === today.getTime()) {
        return 'Due today';
      }
      return 'Due tomorrow';
    }
    return 'Needs attention';
  };

  const getAssignmentIcon = (assignment) => {
    if (assignment.type === 'help') return HelpCircle;
    if (assignment.type === 'due') return Clock;
    return FileText;
  };

  const getAssignmentColor = (assignment) => {
    if (assignment.type === 'help') return colors.orangeBold;
    if (assignment.type === 'due') return colors.yellowBold;
    return colors.primary;
  };

  if (loading) {
    return null; // Don't show loading state, just don't render
  }

  if (assignments.length === 0) {
    return null; // Don't show card if no assignments
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Assignments</Text>
          <TouchableOpacity
            style={styles.viewAllButton}
            onPress={() => setShowInboxModal(true)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.viewAllText}>View all</Text>
            <ChevronRight size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          {assignments.map((assignment) => {
            const childName = getChildName(assignment.child_id);
            const childColor = getChildColor(assignment.child_id);
            const Icon = getAssignmentIcon(assignment);
            const iconColor = getAssignmentColor(assignment);
            const label = getAssignmentLabel(assignment);

            return (
              <TouchableOpacity
                key={assignment.id}
                style={styles.item}
                onPress={() => setShowInboxModal(true)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <View style={styles.itemLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: iconColor + '15' }]}>
                    <Icon size={14} color={iconColor} />
                  </View>
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{assignment.title}</Text>
                    <View style={styles.itemMeta}>
                      <View style={[styles.childDot, { backgroundColor: childColor }]} />
                      <Text style={styles.childName}>{childName}</Text>
                      <Text style={styles.separator}>·</Text>
                      <Text style={styles.label}>{label}</Text>
                    </View>
                  </View>
                </View>
                <ChevronRight size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ReviewInboxModal
        visible={showInboxModal}
        onClose={() => setShowInboxModal(false)}
        familyId={familyId}
        initialSection="submissions"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 4,
    borderLeftColor: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
      '&:hover': {
        backgroundColor: 'rgba(133,196,242,0.15)',
      },
    }),
  },
  viewAllText: {
    fontSize: 13,
    color: '#6BB3E8',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    gap: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
      '&:hover': {
        backgroundColor: colors.bgSubtle,
        borderRadius: 8,
        paddingHorizontal: 8,
        marginHorizontal: -8,
      },
    }),
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
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
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  childName: {
    fontSize: 12,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  separator: {
    fontSize: 12,
    color: colors.textSecondary,
    marginHorizontal: 2,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
