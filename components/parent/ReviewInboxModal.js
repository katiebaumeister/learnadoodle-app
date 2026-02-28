/**
 * ReviewInboxModal
 * 
 * Modal wrapper for Review Inbox screen.
 * Opens when clicking notification buttons in EmbeddedNotificationCenter.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable, ActivityIndicator, Platform, Modal } from 'react-native';
import { Inbox, X, CheckCircle, RotateCcw, HelpCircle, Clock, FileText, User } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import AssignmentDetailModal from '../assignments/AssignmentDetailModal';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';

const SECTIONS = [
  { id: 'submissions', label: 'Submissions', icon: FileText },
  { id: 'help_requests', label: 'Help Requests', icon: HelpCircle },
  { id: 'needs_revision', label: 'Needs Revision', icon: RotateCcw },
];

export default function ReviewInboxModal({ visible, onClose, familyId, initialSection = 'submissions' }) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedSection, setSelectedSection] = useState(initialSection);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (visible && session && !session.loading && familyId) {
      loadData();
    }
  }, [visible, session, familyId]);

  useEffect(() => {
    if (visible) {
      setSelectedSection(initialSection);
    }
  }, [visible, initialSection]);

  const loadData = async () => {
    if (!familyId) return;

    setLoading(true);
    try {
      await Promise.all([
        loadAssignments(),
        loadChildren(),
      ]);
    } catch (error) {
      console.error('[ReviewInboxModal] Error loading data:', error);
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
        if (error.code === '42P01' || error.code === 'PGRST200' || error.message?.includes('does not exist')) {
          setAssignments([]);
          return;
        }
        console.error('[ReviewInboxModal] Error loading assignments:', error);
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

      if (helpError && helpError.code !== '42P01' && helpError.code !== 'PGRST200') {
        console.error('[ReviewInboxModal] Error loading help requests:', helpError);
      }

      // Combine and deduplicate
      const allAssignments = [...(data || []), ...(helpData || [])];
      const uniqueAssignments = Array.from(
        new Map(allAssignments.map(a => [a.id, a])).values()
      );

      setAssignments(uniqueAssignments);
    } catch (error) {
      console.error('[ReviewInboxModal] Error loading assignments:', error);
      setAssignments([]);
    }
  };

  const loadChildren = async () => {
    if (!familyId) return;

    try {
      const { data, error } = await supabase
        .from('children')
        .select('id, first_name, avatar')
        .eq('family_id', familyId)
        .order('first_name');

      if (error) {
        console.error('[ReviewInboxModal] Error loading children:', error);
        setChildren([]);
        return;
      }

      setChildren(data || []);
    } catch (error) {
      console.error('[ReviewInboxModal] Error loading children:', error);
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
    setShowReviewModal(true);
  };

  const handleViewDetails = (assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailModal(true);
  };

  const handleReviewed = async () => {
    await loadAssignments();
    setShowReviewModal(false);
    setShowDetailModal(false);
    setSelectedAssignment(null);
  };

  const handleDetailModalClose = () => {
    setShowDetailModal(false);
    setSelectedAssignment(null);
  };

  if (!visible) return null;

  return (
    <>
      <Modal
        visible={visible}
        transparent={true}
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlayContainer}>
          <Pressable style={styles.overlay} onPress={onClose} />
          <View style={styles.modalWrapper} pointerEvents="box-none">
            <View style={styles.modal}>
            {/* Header: rounded chips + count + close */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerChips}>
                  {SECTIONS.map(section => {
                    const isActive = selectedSection === section.id;
                    const count = getSectionCount(section.id);

                    return (
                      <TouchableOpacity
                        key={section.id}
                        style={[styles.sectionTab, isActive && styles.sectionTabActive]}
                        onPress={() => setSelectedSection(section.id)}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
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
                            <Text style={[styles.countText, isActive && styles.countTextActive]}>{count}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.headerRight}>
                <Text style={styles.subtitle}>
                  {filteredAssignments.length} {filteredAssignments.length === 1 ? 'item' : 'items'} to review
                </Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Assignments List */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.text} />
                <Text style={styles.loadingText}>Loading assignments...</Text>
              </View>
            ) : filteredAssignments.length === 0 ? (
              <View style={styles.emptyState}>
                <Inbox size={48} color={colors.muted} />
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
                            <HelpCircle size={14} color={colors.orangeBold} />
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
                            <Clock size={12} color={colors.textSecondary} />
                            <Text style={styles.metaText}>Submitted {submittedAt}</Text>
                          </View>
                        )}
                        {assignment.linked_evidence_ids && 
                         Array.isArray(assignment.linked_evidence_ids) && 
                         assignment.linked_evidence_ids.length > 0 && (
                          <View style={styles.metaItem}>
                            <FileText size={12} color={colors.textSecondary} />
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
                          <CheckCircle size={16} color={colors.white} />
                          <Text style={styles.reviewButtonText}>Review</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
            </View>
        </View>
      </Modal>

      {/* Review Modal */}
      {selectedAssignment && (
        <>
          <AssignmentReviewModal
            visible={showReviewModal}
            assignment={selectedAssignment}
            familyId={familyId}
            onClose={() => {
              setShowReviewModal(false);
              setSelectedAssignment(null);
            }}
            onReviewed={handleReviewed}
          />

          {/* Detail Modal */}
          <AssignmentDetailModal
            visible={showDetailModal}
            assignment={selectedAssignment}
            childId={selectedAssignment?.child_id}
            familyId={familyId}
            onClose={handleDetailModalClose}
            onAssignmentUpdated={handleReviewed}
          />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modal: {
    width: '90%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    flexWrap: 'wrap',
  },
  headerChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    padding: 4,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
      '&:hover': {
        backgroundColor: '#F3F4F6',
      },
    }),
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      '&:hover': {
        borderColor: '#9CA3AF',
        backgroundColor: '#F9FAFB',
      },
    }),
  },
  sectionTabActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  sectionTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTabTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  countBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  countBadgeActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#9CA3AF',
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  countTextActive: {
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    gap: 16,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectName: {
    fontSize: 12,
    color: colors.textSecondary,
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
    backgroundColor: colors.orangeSoft,
  },
  helpBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.orangeBold,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentDescription: {
    fontSize: 14,
    color: colors.textSecondary,
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
    color: colors.textSecondary,
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
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
      '&:hover': {
        backgroundColor: '#F3F4F6',
      },
    }),
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
      '&:hover': {
        backgroundColor: '#F9FAFB',
      },
    }),
  },
  reviewButtonText: {
    color: colors.text,
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
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
