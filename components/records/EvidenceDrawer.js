/**
 * Evidence Drawer
 * Right-side drawer for viewing and editing evidence metadata
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, ActivityIndicator, Platform, Modal, Image as RNImage } from 'react-native';
import { X, Save, StickyNote, Trash2, Image, FileText, Video, Music, CheckCircle } from 'lucide-react';
import { getEvidenceById, updateEvidence, deleteEvidence } from '../../lib/services/recordsClient';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import NoteEditorModal from './NoteEditorModal';
import { getAssignments } from '../../lib/services/assignmentsClient';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import { reviewAssignment } from '../../lib/services/assignmentsClient';

export default function EvidenceDrawer({
  isOpen,
  evidenceId,
  familyId,
  children = [],
  subjects = [],
  onClose,
  onUpdated,
  onAddNote,
  onNoteSaved,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [deleting, setDeleting] = useState(false);
  
  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('');
  const [tags, setTags] = useState('');
  const [childIds, setChildIds] = useState([]);
  const [linkedAssignments, setLinkedAssignments] = useState([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  
  // Load evidence when drawer opens
  useEffect(() => {
    if (!isOpen || !evidenceId || !familyId) {
      setEvidence(null);
      return;
    }
    
    async function fetchEvidence() {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await getEvidenceById(familyId, evidenceId);
      
      if (fetchError) {
        setError(fetchError.message || 'Unable to load evidence');
      } else if (data) {
        setEvidence(data);
        setTitle(data.title || '');
        setDescription(data.description || '');
        setSubject(data.subject || '');
        setType(data.type || '');
        setTags(Array.isArray(data.tags) ? data.tags.join(', ') : '');
        setChildIds(data.child_ids || []);
        
        // Load linked assignments if evidence is linked to any
        if (data.id && data.child_ids && data.child_ids.length > 0) {
          loadLinkedAssignments(data.id, data.child_ids[0]);
        }
        
        // Load image preview if it's an image
        if (data.mime_type?.startsWith('image/') && data.url) {
          loadImagePreview(data.url);
        } else {
          setImageUrl(null);
        }
      }
      
      setLoading(false);
    }
    
    fetchEvidence();
  }, [isOpen, evidenceId, familyId]);
  
  const loadImagePreview = async (storagePath) => {
    try {
      const { data, error } = await supabase.storage
        .from('evidence')
        .createSignedUrl(storagePath, 3600);
      
      if (!error && data?.signedUrl) {
        setImageUrl(data.signedUrl);
      } else {
        setImageUrl(null);
      }
    } catch (err) {
      console.warn('Error loading image preview:', err);
      setImageUrl(null);
    }
  };

  const loadLinkedAssignments = async (evidenceId, childId) => {
    if (!childId) return;
    try {
      const { data: assignments, error } = await getAssignments(childId);
      if (error) {
        console.error('Error loading assignments:', error);
        return;
      }

      // Find assignments that have this evidence linked
      const linked = (assignments || []).filter(assignment => {
        if (!assignment.linked_evidence_ids || !Array.isArray(assignment.linked_evidence_ids)) {
          return false;
        }
        return assignment.linked_evidence_ids.some(id => id === evidenceId || id === evidenceId.toString());
      });

      setLinkedAssignments(linked);
    } catch (err) {
      console.error('Error loading linked assignments:', err);
    }
  };

  const handleReviewWork = (assignment) => {
    setSelectedAssignment(assignment);
    setShowReviewModal(true);
  };

  const handleReviewed = async () => {
    await loadLinkedAssignments(evidenceId, childIds[0]);
    setShowReviewModal(false);
    setSelectedAssignment(null);
    if (onUpdated) {
      onUpdated();
    }
  };
  
  const handleSave = async () => {
    if (!evidenceId) return;
    
    setSaving(true);
    setError(null);
    
    const payload = {
      title: title.trim() || null,
      description: description.trim() || null,
      subject: subject || null,
      type: type || null,
      tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      child_ids: childIds,
    };
    
    const { data, error: updateError } = await updateEvidence(evidenceId, payload);
    
    if (updateError) {
      setError(updateError.message || 'Unable to save changes');
    } else {
      if (onUpdated) onUpdated(data);
      onClose();
    }
    
    setSaving(false);
  };
  
  const handleToggleChild = (childId) => {
    if (childIds.includes(childId)) {
      setChildIds(childIds.filter(id => id !== childId));
    } else {
      setChildIds([...childIds, childId]);
    }
  };
  
  const handleDelete = async () => {
    if (!evidenceId || !familyId) return;
    
    if (!confirm('Are you sure you want to delete this evidence? This action cannot be undone.')) {
      return;
    }
    
    setDeleting(true);
    setError(null);
    
    const { data, error: deleteError } = await deleteEvidence(evidenceId, familyId);
    
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete evidence');
      setDeleting(false);
    } else {
      if (onUpdated) onUpdated(null); // Signal deletion
      onClose();
    }
  };
  
  const getEvidenceIcon = () => {
    if (!evidence) return FileText;
    if (evidence.type === 'photo' || evidence.mime_type?.startsWith('image/')) return Image;
    if (evidence.type === 'video' || evidence.mime_type?.includes('video')) return Video;
    if (evidence.type === 'audio' || evidence.mime_type?.includes('audio')) return Music;
    return FileText;
  };
  
  if (!isOpen || !evidenceId) return null;
  
  const EvidenceIcon = getEvidenceIcon();
  
  // On mobile, use modal; on web, use drawer
  const isWeb = Platform.OS === 'web';
  
  const content = (
    <View style={styles.drawerContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Evidence details</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <X size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      
      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.indigo} />
            <Text style={styles.loadingText}>Loading evidence…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : evidence ? (
          <>
            {/* Preview Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preview</Text>
              <View style={styles.previewCard}>
                {imageUrl && evidence.mime_type?.startsWith('image/') ? (
                  <RNImage
                    source={{ uri: imageUrl }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.previewIcon}>
                    <EvidenceIcon size={32} color={colors.textSecondary} />
                  </View>
                )}
                <Text style={styles.previewFilename} numberOfLines={1}>
                  {evidence.filename || evidence.title || 'Evidence file'}
                </Text>
                <Text style={styles.previewMeta}>
                  {evidence.mime_type || 'file'} • {evidence.uploaded_at ? new Date(evidence.uploaded_at).toLocaleDateString() : 'Unknown date'}
                </Text>
                {evidence.bytes > 0 && (
                  <Text style={styles.previewMeta}>
                    {(evidence.bytes / 1024).toFixed(1)} KB
                  </Text>
                )}
              </View>
            </View>
            
            {/* Metadata Form */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Metadata</Text>
              
              {/* Title */}
              <View style={styles.field}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Optional short title"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              
              {/* Description */}
              <View style={styles.field}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Notes about this piece of work"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>
              
              {/* Subject */}
              <View style={styles.field}>
                <Text style={styles.label}>Subject</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {subjects.map(subj => (
                    <TouchableOpacity
                      key={subj.id}
                      style={[
                        styles.chip,
                        subject === subj.id && styles.chipActive
                      ]}
                      onPress={() => setSubject(subject === subj.id ? '' : subj.id)}
                    >
                      <Text style={[
                        styles.chipText,
                        subject === subj.id && styles.chipTextActive
                      ]}>
                        {subj.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              {/* Type */}
              <View style={styles.field}>
                <Text style={styles.label}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {['photo', 'pdf', 'video', 'audio', 'file', 'project', 'writing', 'test'].map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.chip,
                        type === t && styles.chipActive
                      ]}
                      onPress={() => setType(type === t ? '' : t)}
                    >
                      <Text style={[
                        styles.chipText,
                        type === t && styles.chipTextActive
                      ]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              {/* Tags */}
              <View style={styles.field}>
                <Text style={styles.label}>Tags (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={tags}
                  onChangeText={setTags}
                  placeholder="math, project, portfolio"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              
              {/* Linked Children */}
              <View style={styles.field}>
                <Text style={styles.label}>Linked Children</Text>
                <View style={styles.childrenList}>
                  {children.map(child => (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childCheckbox,
                        childIds.includes(child.id) && styles.childCheckboxActive
                      ]}
                      onPress={() => handleToggleChild(child.id)}
                    >
                      <Text style={[
                        styles.childCheckboxText,
                        childIds.includes(child.id) && styles.childCheckboxTextActive
                      ]}>
                        {child.first_name || child.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
      
      {/* Linked Assignments Section */}
      {linkedAssignments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Linked Assignments</Text>
          {linkedAssignments.map(assignment => (
            <TouchableOpacity
              key={assignment.id}
              style={styles.assignmentItem}
              onPress={() => handleReviewWork(assignment)}
            >
              <View style={styles.assignmentItemContent}>
                <Text style={styles.assignmentItemTitle}>{assignment.title}</Text>
                <Text style={styles.assignmentItemStatus}>
                  Status: {assignment.status === 'submitted' ? 'Submitted - Ready for Review' : assignment.status}
                </Text>
              </View>
              {assignment.status === 'submitted' && (
                <CheckCircle size={20} color={colors.orangeBold} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setShowNoteEditor(true)}
        >
          <StickyNote size={14} color={colors.indigo} />
          <Text style={styles.secondaryButtonText}>Add note</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.primaryButtonText}>Saving…</Text>
            </>
          ) : (
            <>
              <Save size={14} color={colors.white} />
              <Text style={styles.primaryButtonText}>Save changes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Delete Button */}
      <View style={styles.dangerZone}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.orange} />
          ) : (
            <>
              <Trash2 size={14} color={colors.orange} />
              <Text style={styles.deleteButtonText}>Delete evidence</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
  
  if (!isOpen) return null;
  
  const drawerContent = (
    <>
      {content}
      {/* Note Editor Modal */}
      <NoteEditorModal
        visible={showNoteEditor}
        onClose={() => setShowNoteEditor(false)}
        onSaved={(note) => {
          if (onNoteSaved) onNoteSaved(note);
          setShowNoteEditor(false);
        }}
        familyId={familyId}
        defaultChildId={childIds && childIds.length > 0 ? childIds[0] : null}
        defaultSubject={subject}
        linkedEvidenceId={evidenceId}
        children={children}
      />

      {/* Assignment Review Modal */}
      <AssignmentReviewModal
        visible={showReviewModal}
        assignment={selectedAssignment}
        onClose={() => {
          setShowReviewModal(false);
          setSelectedAssignment(null);
        }}
        onReviewed={handleReviewed}
      />
        visible={showNoteEditor}
        onClose={() => setShowNoteEditor(false)}
        onSaved={(note) => {
          if (onNoteSaved) onNoteSaved(note);
          setShowNoteEditor(false);
        }}
        familyId={familyId}
        defaultChildId={childIds.length === 1 ? childIds[0] : null}
        linkedEvidenceId={evidenceId}
        children={children}
      />
    </>
  );
  
  if (isWeb) {
    // Web: Right-side drawer
    return (
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.drawer}>
          {drawerContent}
        </View>
      </View>
    );
  } else {
    // Mobile: Modal
    return (
      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
          <View style={styles.drawer}>
            {drawerContent}
          </View>
        </View>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    flexDirection: 'row',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  drawer: {
    width: Platform.OS === 'web' ? 400 : '100%',
    maxWidth: Platform.OS === 'web' ? 400 : '100%',
    backgroundColor: colors.card,
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderTopLeftRadius: Platform.OS === 'web' ? 0 : 16,
    borderTopRightRadius: Platform.OS === 'web' ? 0 : 16,
    borderTopWidth: Platform.OS === 'web' ? 0 : 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: Platform.OS === 'web' ? '100%' : '90%',
  },
  drawerContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorContainer: {
    padding: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.orange,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  previewCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  previewIcon: {
    marginBottom: 8,
  },
  previewFilename: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  previewMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.panel,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  chipText: {
    fontSize: 12,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.white,
  },
  childrenList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childCheckbox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childCheckboxActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  childCheckboxText: {
    fontSize: 12,
    color: colors.text,
  },
  childCheckboxTextActive: {
    color: colors.white,
  },
  assignmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  assignmentItemContent: {
    flex: 1,
  },
  assignmentItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  assignmentItemStatus: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: colors.indigo,
    flex: 1,
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.indigo,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 6,
    marginBottom: 8,
  },
  dangerZone: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.orange,
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.orange,
  },
});

