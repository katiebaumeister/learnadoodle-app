/**
 * EmbeddedNotificationCenter
 * 
 * Compact notification center for parent home right rail.
 * Shows condensed review inbox with tabs and limited items.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { FileText, HelpCircle, RotateCcw, User, Clock, ChevronRight } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import ReviewInboxModal from './ReviewInboxModal';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';

const SECTIONS = [
  { id: 'submissions', label: 'Submissions', icon: FileText },
  { id: 'help_requests', label: 'Help', icon: HelpCircle },
  { id: 'needs_revision', label: 'Revision', icon: RotateCcw },
];

export default function EmbeddedNotificationCenter({ familyId, limit = 5, onViewAll }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedSection, setSelectedSection] = useState('submissions');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [inboxModalSection, setInboxModalSection] = useState('submissions');

  useEffect(() => {
    if (session && !session.loading && familyId) {
      loadData();
    }
  }, [session, familyId]);

  const loadData = async () => {
    if (!familyId) return;

    setLoading(true);
    try {
      await Promise.all([
        loadAssignments(),
        loadChildren(),
      ]);
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async () => {
    try {
      // Check if assignments table exists
      const { data, error } = await supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (id, first_name, avatar),
          subject:related_subject (id, name)
        `)
        .eq('family_id', familyId)
        .in('status', ['submitted'])
        .or('review_status.is.null,review_status.eq.needs_revision')
        .order('updated_at', { ascending: false });

      if (error) {
        // If table doesn't exist, return empty array
        if (error.code === '42P01' || error.code === 'PGRST200' || error.message?.includes('does not exist')) {
          setAssignments([]);
          return;
        }
        throw error;
      }

      const { data: helpData, error: helpError } = await supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (id, first_name, avatar),
          subject:related_subject (id, name)
        `)
        .eq('family_id', familyId)
        .eq('need_help', true)
        .order('updated_at', { ascending: false });

      if (helpError && helpError.code !== '42P01' && helpError.code !== 'PGRST200') {
        console.error('[EmbeddedNotificationCenter] Error loading help requests:', helpError);
      }

      const allAssignments = [...(data || []), ...(helpData || [])];
      const uniqueAssignments = Array.from(
        new Map(allAssignments.map(a => [a.id, a])).values()
      );

      setAssignments(uniqueAssignments);
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading assignments:', error);
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
      console.error('[EmbeddedNotificationCenter] Error loading children:', error);
      setChildren([]);
    }
  };

  const filterAssignments = () => {
    switch (selectedSection) {
      case 'submissions':
        return assignments.filter(a => 
          a.status === 'submitted' && 
          a.review_status !== 'needs_revision' &&
          !a.need_help
        ).slice(0, limit);
      case 'help_requests':
        return assignments.filter(a => a.need_help === true).slice(0, limit);
      case 'needs_revision':
        return assignments.filter(a => a.review_status === 'needs_revision').slice(0, limit);
      default:
        return [];
    }
  };

  const filteredAssignments = filterAssignments();

  const getSectionCount = (sectionId) => {
    switch (sectionId) {
      case 'submissions':
        return assignments.filter(a => 
          a.status === 'submitted' && 
          a.review_status !== 'needs_revision' &&
          !a.need_help
        ).length;
      case 'help_requests':
        return assignments.filter(a => a.need_help === true).length;
      case 'needs_revision':
        return assignments.filter(a => a.review_status === 'needs_revision').length;
      default:
        return 0;
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

  const handleReview = (assignment) => {
    setSelectedAssignment(assignment);
    setShowReviewModal(true);
  };

  const handleReviewComplete = () => {
    setShowReviewModal(false);
    setSelectedAssignment(null);
    loadData();
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          <TouchableOpacity
            onPress={() => {
              setInboxModalSection(selectedSection);
              setShowInboxModal(true);
            }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.viewAllText}>View all</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isActive = selectedSection === section.id;
            const count = getSectionCount(section.id);

            return (
              <TouchableOpacity
                key={section.id}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => {
                  setSelectedSection(section.id);
                  setInboxModalSection(section.id);
                  setShowInboxModal(true);
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Icon size={14} color={isActive ? colors.primary : colors.textSecondary} />
                {count > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : filteredAssignments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nothing here</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {filteredAssignments.map((assignment) => {
              const childName = getChildName(assignment.child_id);
              const childColor = getChildColor(assignment.child_id);
              const subjectName = assignment.subject?.name || null;
              
              // Determine icon and type based on assignment
              let IconComponent = FileText;
              let iconColor = colors.primary;
              if (assignment.need_help) {
                IconComponent = HelpCircle;
                iconColor = colors.orangeBold;
              } else if (assignment.review_status === 'needs_revision') {
                IconComponent = RotateCcw;
                iconColor = colors.yellowBold;
              }

              return (
                <TouchableOpacity
                  key={assignment.id}
                  style={styles.item}
                  onPress={() => handleReview(assignment)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.itemLeft}>
                    <View style={[styles.itemIconContainer, { backgroundColor: iconColor + '15' }]}>
                      <IconComponent size={14} color={iconColor} />
                    </View>
                    <View style={styles.itemContent}>
                      <View style={styles.itemHeader}>
                        <View style={[styles.childDot, { backgroundColor: childColor }]} />
                        <Text style={styles.childName} numberOfLines={1}>{childName}</Text>
                        {subjectName && (
                          <Text style={styles.subjectName} numberOfLines={1}>· {subjectName}</Text>
                        )}
                      </View>
                      <Text style={styles.itemTitle} numberOfLines={2}>{assignment.title}</Text>
                      <View style={styles.itemFooter}>
                        <Text style={styles.itemDate}>
                          {assignment.updated_at 
                            ? new Date(assignment.updated_at).toLocaleDateString()
                            : 'Recently'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <ChevronRight size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {selectedAssignment && (
        <AssignmentReviewModal
          visible={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          assignment={selectedAssignment}
          onReviewed={handleReviewComplete}
        />
      )}

      <ReviewInboxModal
        visible={showInboxModal}
        onClose={() => setShowInboxModal(false)}
        familyId={familyId}
        initialSection={inboxModalSection}
      />
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
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.border,
      },
    }),
  },
  tabActive: {
    backgroundColor: colors.primarySoft,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  itemIconContainer: {
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
  subjectName: {
    fontSize: 12,
    color: colors.textSecondary,
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDate: {
    fontSize: 11,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
