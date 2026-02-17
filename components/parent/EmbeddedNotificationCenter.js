/**
 * EmbeddedNotificationCenter
 * 
 * Compact notification center for parent home right rail.
 * Shows condensed review inbox with tabs and limited items.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { FileText, HelpCircle, Calendar, User, Clock, ChevronRight, Plus } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';


const SECTIONS = [
  { id: 'submissions', label: 'Submissions', icon: FileText },
  { id: 'help_requests', label: 'Help', icon: HelpCircle },
  { id: 'needs_revision', label: 'Coming up', icon: Calendar },
];

export default function EmbeddedNotificationCenter({ familyId, limit = 5, onViewAll }) {
  const session = useSession();
  const [loading, setLoading] = useState(false); // Start as false - no loading state
  const [assignments, setAssignments] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedSection, setSelectedSection] = useState('submissions');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    if (session && !session.loading && familyId) {
      // Load data in background without showing loading state
      loadData();
    }
  }, [session, familyId]);

  const loadData = async () => {
    if (!familyId) return;

    // Don't set loading state - load silently in background
    try {
      await Promise.all([
        loadAssignments(),
        loadUpcomingEvents(),
        loadChildren(),
      ]);
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading data:', error);
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

  const loadUpcomingEvents = async () => {
    try {
      const now = new Date();
      const sevenDaysLater = new Date(now);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      sevenDaysLater.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          title,
          description,
          start_ts,
          end_ts,
          child_id,
          subject_id,
          status,
          child:child_id (id, first_name, avatar)
        `)
        .eq('family_id', familyId)
        .gte('start_ts', now.toISOString())
        .lte('start_ts', sevenDaysLater.toISOString())
        .in('status', ['scheduled', 'in_progress'])
        .is('deleted_at', null)
        .order('start_ts', { ascending: true })
        .limit(50);

      if (error) {
        console.error('[EmbeddedNotificationCenter] Error loading upcoming events:', error);
        setUpcomingEvents([]);
        return;
      }

      // Fetch subject names separately if needed
      const subjectIds = [...new Set((data || []).map(e => e.subject_id).filter(Boolean))];
      let subjectsMap = {};
      if (subjectIds.length > 0) {
        const { data: subjectsData } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        
        if (subjectsData) {
          subjectsMap = subjectsData.reduce((acc, sub) => {
            acc[sub.id] = sub;
            return acc;
          }, {});
        }
      }

      // Attach subject data to events
      const eventsWithSubjects = (data || []).map(event => ({
        ...event,
        subject: event.subject_id ? subjectsMap[event.subject_id] : null,
      }));

      setUpcomingEvents(eventsWithSubjects);
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading upcoming events:', error);
      setUpcomingEvents([]);
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

  const filterItems = () => {
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
        return upcomingEvents.slice(0, limit);
      default:
        return [];
    }
  };

  const filteredItems = filterItems();

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
        return upcomingEvents.length;
      default:
        return 0;
    }
  };

  const formatEventDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const eventDate = new Date(date);
    eventDate.setHours(0, 0, 0, 0);

    if (eventDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (eventDate.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatEventTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
          <Text style={styles.title}>Needs attention</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {SECTIONS.map(section => {
            const isActive = selectedSection === section.id;
            const count = getSectionCount(section.id);

            const webProps = Platform.OS === 'web' ? {
              cursor: 'pointer',
            } : {};

            return (
              <TouchableOpacity
                key={section.id}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => {
                  setSelectedSection(section.id);
                }}
                {...webProps}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {section.label}
                </Text>
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
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            {selectedSection === 'needs_revision' ? (
              <Text style={styles.emptyText}>No upcoming events</Text>
            ) : (
              <>
                <Text style={styles.emptyTitle}>All caught up</Text>
                <Text style={styles.emptySubtext}>Assign new tasks for children to complete</Text>
              </>
            )}
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {filteredItems.map((item) => {
              if (selectedSection === 'needs_revision') {
                // Render event
                const event = item;
                const childName = getChildName(event.child_id);
                const childColor = getChildColor(event.child_id);
                const subjectName = event.subject?.name || null;
                const eventDate = formatEventDate(event.start_ts);
                const eventTime = formatEventTime(event.start_ts);

                return (
                  <TouchableOpacity
                    key={event.id}
                    style={styles.item}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.itemLeft}>
                      <View style={[styles.itemIconContainer, { backgroundColor: colors.blueBold + '15' }]}>
                        <Calendar size={14} color={colors.blueBold} />
                      </View>
                      <View style={styles.itemContent}>
                        <View style={styles.itemHeader}>
                          <View style={[styles.childDot, { backgroundColor: childColor }]} />
                          <Text style={styles.childName} numberOfLines={1}>{childName}</Text>
                          {subjectName && (
                            <Text style={styles.subjectName} numberOfLines={1}>· {subjectName}</Text>
                          )}
                        </View>
                        <Text style={styles.itemTitle} numberOfLines={2}>{event.title}</Text>
                        <View style={styles.itemFooter}>
                          <Text style={styles.itemDate}>
                            {eventDate} · {eventTime}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <ChevronRight size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              } else {
                // Render assignment
                const assignment = item;
                const childName = getChildName(assignment.child_id);
                const childColor = getChildColor(assignment.child_id);
                const subjectName = assignment.subject?.name || null;
                
                // Determine icon and type based on assignment
                let IconComponent = FileText;
                let iconColor = colors.primary;
                if (assignment.need_help) {
                  IconComponent = HelpCircle;
                  iconColor = colors.orangeBold;
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
              }
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
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      transition: 'all 0.2s ease',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: '#F9FAFB',
      },
    }),
  },
  tabActive: {
    borderColor: '#60a5fa',
    backgroundColor: '#eff6ff',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabTextActive: {
    color: '#60a5fa',
    fontWeight: '600',
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
  emptyState: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: 0,
    }),
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
