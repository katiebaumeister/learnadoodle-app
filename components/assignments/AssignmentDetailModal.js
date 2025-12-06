/**
 * AssignmentDetailModal Component
 * Modal for viewing and interacting with assignment details
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, Platform, Alert } from 'react-native';
import { X, Camera, Upload, FileText, Clock, CheckCircle, HelpCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { shouldSuppressError } from '../../lib/apiClient';
import { colors } from '../../theme/colors';
import EvidenceUploadModal from '../records/EvidenceUploadModal';

export default function AssignmentDetailModal({
  visible,
  assignment,
  childId,
  familyId,
  onClose,
  onSubmit,
  onToggleHelp,
  onReview,
}) {
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [linkedEvents, setLinkedEvents] = useState([]);
  const [linkedEvidence, setLinkedEvidence] = useState([]);

  useEffect(() => {
    if (visible && assignment) {
      loadLinkedData();
    }
  }, [visible, assignment]);

  const loadLinkedData = async () => {
    if (!assignment) return;

    setLoading(true);
    try {
      // Load linked events
      if (assignment.linked_event_ids && Array.isArray(assignment.linked_event_ids) && assignment.linked_event_ids.length > 0) {
        const { data: events } = await supabase
          .from('events')
          .select('id, title, start_ts, status')
          .in('id', assignment.linked_event_ids);
        setLinkedEvents(events || []);
      }

      // Load linked evidence
      if (assignment.linked_evidence_ids && Array.isArray(assignment.linked_evidence_ids) && assignment.linked_evidence_ids.length > 0) {
        const { data: evidence, error: evidenceError } = await supabase
          .from('uploads')
          .select('id, title, mime, created_at, storage_path')
          .in('id', assignment.linked_evidence_ids);
        
        if (evidenceError && !shouldSuppressError(evidenceError)) {
          console.error('Error loading linked evidence:', evidenceError);
        }
        
        setLinkedEvidence(evidence || []);
      }
    } catch (error) {
      if (!shouldSuppressError(error)) {
        console.error('Error loading linked data:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*,.pdf';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          handleUploadFile(file);
        }
      };
      input.click();
    } else {
      // For mobile, open camera or file picker
      Alert.alert(
        'Upload Evidence',
        'Choose an option',
        [
          { text: 'Camera', onPress: () => setShowUploadModal(true) },
          { text: 'File', onPress: () => setShowUploadModal(true) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleUploadFile = async (file) => {
    if (!familyId || !childId || !assignment) return;

    setLoading(true);
    try {
      const path = `${familyId}/${crypto.randomUUID()}_${file.name}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        Alert.alert('Upload Error', uploadError.message);
        setLoading(false);
        return;
      }

      // Create upload record
      const { data: recordData, error: recordError } = await supabase
        .from('uploads')
        .insert({
          family_id: familyId,
          child_id: childId,
          storage_path: uploadData.path,
          title: file.name,
          mime: file.type || 'application/octet-stream',
          bytes: file.size,
        })
        .select()
        .single();

      if (recordError) {
        Alert.alert('Error', 'Failed to create upload record: ' + recordError.message);
        setLoading(false);
        return;
      }

      // Get file URL for auto-captioning
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(uploadData.path);
      const fileUrl = urlData?.publicUrl;

      // Trigger auto-captioning (non-blocking)
      if (recordData?.id && fileUrl) {
        autoCaptionOnUpload(recordData.id, file.type, fileUrl, file.name).catch(err => {
          console.log('Auto-captioning failed (non-critical):', err);
        });
      }

      // Submit assignment with evidence
      if (onSubmit) {
        await onSubmit(assignment.id, recordData.id);
      } else {
        // Fallback: call RPC directly
        const { error: submitError } = await supabase.rpc('submit_assignment', {
          p_assignment_id: assignment.id,
          p_evidence_id: recordData.id,
        });

        if (submitError) {
          Alert.alert('Error', 'Failed to submit assignment: ' + submitError.message);
        } else {
          Alert.alert('Success', 'Assignment submitted successfully!');
          loadLinkedData();
        }
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      Alert.alert('Error', 'Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  const handleUploaded = async (evidenceData) => {
    if (onSubmit) {
      await onSubmit(assignment.id, evidenceData.id);
    } else {
      const { error } = await supabase.rpc('submit_assignment', {
        p_assignment_id: assignment.id,
        p_evidence_id: evidenceData.id,
      });

      if (!error) {
        loadLinkedData();
      }
    }
    setShowUploadModal(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'not_started':
        return colors.muted;
      case 'in_progress':
        return colors.blueBold;
      case 'submitted':
        return colors.yellowBold;
      case 'reviewed':
        return colors.orangeBold;
      case 'accepted':
        return colors.greenBold;
      default:
        return colors.muted;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'not_started':
        return 'Not Started';
      case 'in_progress':
        return 'In Progress';
      case 'submitted':
        return 'Submitted';
      case 'reviewed':
        return 'Reviewed';
      case 'accepted':
        return 'Accepted';
      default:
        return status;
    }
  };

  if (!assignment) return null;

  const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date() && assignment.status !== 'accepted';
  const canSubmit = assignment.status === 'not_started' || assignment.status === 'in_progress';

  return (
    <>
      <Modal
        visible={visible}
        transparent={true}
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{assignment.title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Status Badge */}
              <View style={styles.statusSection}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(assignment.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(assignment.status) }]}>
                    {getStatusLabel(assignment.status)}
                  </Text>
                </View>
                {assignment.need_help && (
                  <View style={styles.helpBadge}>
                    <HelpCircle size={14} color={colors.orangeBold} />
                    <Text style={styles.helpText}>Needs Help</Text>
                  </View>
                )}
              </View>

              {/* Description */}
              {assignment.description && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Description</Text>
                  <Text style={styles.description}>{assignment.description}</Text>
                </View>
              )}

              {/* Due Date */}
              {dueDate && (
                <View style={styles.section}>
                  <View style={styles.metaRow}>
                    <Clock size={16} color={isOverdue ? colors.redBold : colors.muted} />
                    <Text style={[styles.metaText, isOverdue && styles.metaTextOverdue]}>
                      Due: {dueDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      {isOverdue && ' (Overdue)'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Subject */}
              {assignment.related_subject_name && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Subject</Text>
                  <Text style={styles.metaText}>{assignment.related_subject_name}</Text>
                </View>
              )}

              {/* Linked Events */}
              {linkedEvents.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Linked Events ({linkedEvents.length})</Text>
                  {linkedEvents.map(event => (
                    <View key={event.id} style={styles.linkedItem}>
                      <Text style={styles.linkedItemText}>{event.title}</Text>
                      <Text style={styles.linkedItemMeta}>
                        {new Date(event.start_ts).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Linked Evidence */}
              {linkedEvidence.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Submitted Work ({linkedEvidence.length})</Text>
                  {linkedEvidence.map(ev => (
                    <View key={ev.id} style={styles.linkedItem}>
                      <FileText size={16} color={colors.muted} />
                      <View style={styles.linkedItemContent}>
                        <Text style={styles.linkedItemText}>{ev.title || 'Evidence file'}</Text>
                        <Text style={styles.linkedItemMeta}>
                          {new Date(ev.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Actions */}
              {canSubmit && (
                <View style={styles.actionsSection}>
                  <TouchableOpacity
                    style={styles.submitButton}
                    onPress={handleFileSelect}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.card} />
                    ) : (
                      <>
                        <Camera size={18} color={colors.card} />
                        <Text style={styles.submitButtonText}>Submit Work</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Help Toggle */}
              {canSubmit && (
                <TouchableOpacity
                  style={styles.helpButton}
                  onPress={() => onToggleHelp && onToggleHelp(assignment.id)}
                >
                  <HelpCircle size={16} color={colors.orangeBold} />
                  <Text style={styles.helpButtonText}>
                    {assignment.need_help ? 'Mark as No Longer Needing Help' : 'Mark as Needing Help'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Score Display */}
              {assignment.score !== null && assignment.score !== undefined && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Score</Text>
                  <View style={styles.scoreDisplay}>
                    <Text style={styles.scoreValue}>
                      {assignment.score}{assignment.max_score ? ` / ${assignment.max_score}` : ''}
                    </Text>
                    {assignment.max_score && (
                      <Text style={styles.scorePercentage}>
                        ({Math.round((assignment.score / assignment.max_score) * 100)}%)
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Review Status */}
              {assignment.review_status && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Review Status</Text>
                  <View style={[
                    styles.reviewStatusBadge,
                    assignment.review_status === 'approved' && { backgroundColor: colors.greenSoft },
                    assignment.review_status === 'rejected' && { backgroundColor: colors.redSoft },
                    assignment.review_status === 'needs_revision' && { backgroundColor: colors.orangeSoft },
                  ]}>
                    <Text style={[
                      styles.reviewStatusText,
                      assignment.review_status === 'approved' && { color: colors.greenBold },
                      assignment.review_status === 'rejected' && { color: colors.redBold },
                      assignment.review_status === 'needs_revision' && { color: colors.orangeBold },
                    ]}>
                      {assignment.review_status === 'approved' && '✓ Approved'}
                      {assignment.review_status === 'rejected' && '✗ Rejected'}
                      {assignment.review_status === 'needs_revision' && '↻ Needs Revision'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Review Feedback */}
              {assignment.review_feedback && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Review Feedback</Text>
                  <Text style={styles.feedbackText}>{assignment.review_feedback}</Text>
                </View>
              )}

              {/* AI Feedback */}
              {assignment.ai_feedback && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>AI Feedback</Text>
                  <Text style={styles.feedbackText}>{assignment.ai_feedback}</Text>
                  {assignment.ai_feedback_generated_at && (
                    <Text style={styles.feedbackMeta}>
                      Generated {new Date(assignment.ai_feedback_generated_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              )}

              {/* Review Button (for parents) */}
              {assignment.status === 'submitted' && onReview && (
                <TouchableOpacity
                  style={styles.reviewButton}
                  onPress={() => onReview(assignment)}
                >
                  <CheckCircle size={18} color={colors.card} />
                  <Text style={styles.reviewButtonText}>Review Assignment</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <EvidenceUploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploaded={handleUploaded}
        familyId={familyId}
        defaultChildId={childId}
        linkedEventId={null}
        children={[]}
        subjects={[]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        maxWidth: 600,
        marginHorizontal: 'auto',
        borderRadius: 20,
        marginTop: 40,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  statusSection: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  helpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.orangeSoft,
    borderRadius: 16,
  },
  helpText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.orangeBold,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 14,
    color: colors.text,
  },
  metaTextOverdue: {
    color: colors.redBold,
    fontWeight: '600',
  },
  linkedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkedItemContent: {
    flex: 1,
  },
  linkedItemText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  linkedItemMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  actionsSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.text,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.card,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.orangeBold,
    marginBottom: 12,
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.orangeBold,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.greenBold,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 8,
  },
  reviewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.card,
  },
  scoreDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  scorePercentage: {
    fontSize: 16,
    color: colors.muted,
    fontWeight: '500',
  },
  reviewStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reviewStatusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    backgroundColor: colors.bgSubtle,
    padding: 12,
    borderRadius: 8,
  },
  feedbackMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

