/**
 * Parent Review Inbox Screen
 * 
 * Queue of submissions needing review:
 * - Submissions (status='submitted')
 * - Help requests (need_help=true)
 * - Revision resubmits (review_status='needs_revision')
 * 
 * Actions:
 * - Approve / Needs revision / Reject
 * - Comment + rubric
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Inbox, CheckCircle, XCircle, RotateCcw, HelpCircle, Clock, FileText, User } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { reviewAssignment } from '../../lib/services/gradebookClient';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import RespondToHelpRequestModal from './RespondToHelpRequestModal';
import AssignmentDetailModal from '../assignments/AssignmentDetailModal';
import { getChildColorFromAvatar } from '../../utils/avatarColors';

const SECTIONS = [
  { id: 'submissions', label: 'Submissions', icon: FileText },
  { id: 'help_requests', label: 'Help Requests', icon: HelpCircle },
  { id: 'needs_revision', label: 'Needs Revision', icon: RotateCcw },
];

export default function ReviewInboxScreen({ familyId, onNavigate }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedSection, setSelectedSection] = useState('submissions');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  /** null | 'submission' | 'help' */
  const [openModal, setOpenModal] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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
      console.error('[ReviewInboxScreen] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async () => {
    if (!familyId) return;

    try {
      // Get all assignments for the family that need review
      const { data, error } = await supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (
            id,
            first_name,
            name,
            avatar
          ),
          subject:related_subject (
            id,
            name
          )
        `)
        .eq('family_id', familyId)
        .in('status', ['submitted'])
        .or('review_status.is.null,review_status.eq.needs_revision')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[ReviewInboxScreen] Error loading assignments:', error);
        setAssignments([]);
        return;
      }

      // Also get assignments with help requests
      const { data: helpData, error: helpError } = await supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (
            id,
            first_name,
            name,
            avatar
          ),
          subject:related_subject (
            id,
            name
          )
        `)
        .eq('family_id', familyId)
        .eq('need_help', true)
        .order('updated_at', { ascending: false });

      // Combine and deduplicate
      const allAssignments = [...(data || []), ...(helpData || [])];
      const uniqueAssignments = Array.from(
        new Map(allAssignments.map(a => [a.id, a])).values()
      );

      setAssignments(uniqueAssignments);
    } catch (error) {
      console.error('[ReviewInboxScreen] Error loading assignments:', error);
      setAssignments([]);
    }
  };

  const loadChildren = async () => {
    if (!familyId) return;

    try {
      const { data, error } = await supabase
        .from('children')
        .select('id, first_name, name, avatar')
        .eq('family_id', familyId)
        .order('first_name');

      if (error) {
        console.error('[ReviewInboxScreen] Error loading children:', error);
        setChildren([]);
        return;
      }

      setChildren(data || []);
    } catch (error) {
      console.error('[ReviewInboxScreen] Error loading children:', error);
      setChildren([]);
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
    if (!child) return '#94A3B8';
    return getChildColorFromAvatar(child.avatar);
  };

  const filterAssignments = () => {
    switch (selectedSection) {
      case 'submissions':
        return assignments.filter(a => 
          a.status === 'submitted' && 
          a.review_status !== 'needs_revision' &&
          !a.need_help
        );
      case 'help_requests':
        return assignments.filter(a => a.need_help === true);
      case 'needs_revision':
        return assignments.filter(a => a.review_status === 'needs_revision');
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

  const handleReview = (assignment) => {
    setSelectedAssignment(assignment);
    setOpenModal(assignment.need_help ? 'help' : 'submission');
  };

  const handleViewDetails = (assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailModal(true);
  };

  const handleReviewed = async () => {
    await loadAssignments();
    setOpenModal(null);
    setShowDetailModal(false);
    setSelectedAssignment(null);
  };

  if (session?.loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#887DEE" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Inbox size={24} color="#111827" />
            <Text style={styles.title}>Review Inbox</Text>
          </View>
          <Text style={styles.subtitle}>
            {filteredAssignments.length} {filteredAssignments.length === 1 ? 'item' : 'items'} to review
          </Text>
        </View>

        {/* Section Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sectionTabs}
          contentContainerStyle={styles.sectionTabsContent}
        >
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isActive = selectedSection === section.id;
            const count = getSectionCount(section.id);

            return (
              <TouchableOpacity
                key={section.id}
                style={[styles.sectionTab, isActive && styles.sectionTabActive]}
                onPress={() => setSelectedSection(section.id)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Icon
                  size={18}
                  color={isActive ? '#887DEE' : '#6b7280'}
                />
                <Text
                  style={[
                    styles.sectionTabText,
                    isActive && styles.sectionTabTextActive,
                  ]}
                >
                  {section.label}
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
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#887DEE" />
            <Text style={styles.loadingText}>Loading assignments...</Text>
          </View>
        ) : filteredAssignments.length === 0 ? (
          <View style={styles.emptyState}>
            <Inbox size={48} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {selectedSection === 'submissions' 
                ? 'No submissions to review' 
                : selectedSection === 'help_requests'
                ? 'No help requests'
                : 'No revisions needed'}
            </Text>
            <Text style={styles.emptyText}>
              {selectedSection === 'submissions'
                ? 'Submitted assignments will appear here for review.'
                : selectedSection === 'help_requests'
                ? 'Help requests from children will appear here.'
                : 'Assignments needing revision will appear here.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
          >
            {filteredAssignments.map((assignment) => {
              const childName = getChildName(assignment.child_id);
              const childColor = getChildColor(assignment.child_id);
              const subjectName = assignment.subject?.name || null;
              const submittedAt = assignment.updated_at 
                ? new Date(assignment.updated_at).toLocaleDateString()
                : null;

              return (
                <View key={assignment.id} style={styles.reviewCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.childAvatar, { backgroundColor: childColor + '20' }]}>
                        <User size={16} color={childColor} />
                      </View>
                      <View>
                        <Text style={styles.childName}>{childName}</Text>
                        {subjectName && (
                          <Text style={styles.subjectName}>{subjectName}</Text>
                        )}
                      </View>
                    </View>
                    {assignment.need_help && (
                      <View style={styles.helpBadge}>
                        <HelpCircle size={14} color="#f59e0b" />
                        <Text style={styles.helpBadgeText}>Help</Text>
                      </View>
                    )}
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
                    {submittedAt && (
                      <View style={styles.metaItem}>
                        <Clock size={12} color="#6b7280" />
                        <Text style={styles.metaText}>Submitted {submittedAt}</Text>
                      </View>
                    )}
                    {assignment.linked_evidence_ids && 
                     Array.isArray(assignment.linked_evidence_ids) && 
                     assignment.linked_evidence_ids.length > 0 && (
                      <View style={styles.metaItem}>
                        <FileText size={12} color="#6b7280" />
                        <Text style={styles.metaText}>
                          {assignment.linked_evidence_ids.length} file{assignment.linked_evidence_ids.length !== 1 ? 's' : ''}
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
                    <TouchableOpacity
                      style={styles.reviewButton}
                      onPress={() => handleReview(assignment)}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <CheckCircle size={16} color="#ffffff" />
                      <Text style={styles.reviewButtonText}>Review</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {selectedAssignment && openModal === 'submission' && (
        <AssignmentReviewModal
          visible
          assignment={selectedAssignment}
          onClose={() => {
            setOpenModal(null);
            setSelectedAssignment(null);
          }}
          onReviewed={handleReviewed}
          submissionReview
        />
      )}
      {selectedAssignment && openModal === 'help' && (
        <RespondToHelpRequestModal
          visible
          assignment={selectedAssignment}
          onClose={() => {
            setOpenModal(null);
            setSelectedAssignment(null);
          }}
          onResponded={handleReviewed}
        />
      )}

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
        onSubmit={null} // Parents don't submit
        onToggleHelp={null} // Parents don't toggle help
        onReview={() => {
          setShowDetailModal(false);
          setOpenModal(selectedAssignment?.need_help ? 'help' : 'submission');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  header: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTabs: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sectionTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  sectionTabActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#887DEE',
  },
  sectionTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTabTextActive: {
    color: '#887DEE',
    fontWeight: '600',
  },
  countBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  countBadgeActive: {
    backgroundColor: '#887DEE',
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
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
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
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
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectName: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#fef3c7',
  },
  helpBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#f59e0b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentDescription: {
    fontSize: 14,
    color: '#6b7280',
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
    color: '#6b7280',
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
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#887DEE',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  reviewButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
