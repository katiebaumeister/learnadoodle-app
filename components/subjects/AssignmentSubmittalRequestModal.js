import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X, Send, Paperclip } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import {
  appendAssignmentMessage,
  dispatchAssignmentRefreshEvents,
  ensureLinkedAssignment,
  getChildIdsFromEvent,
} from '../../lib/assignmentWorkflowClient';

function resolveMaterialLabel(material) {
  return String(material?.title || material?.provider_name || 'Attachment').trim() || 'Attachment';
}

function getEventMaterialIds(event) {
  const ids = [];
  (Array.isArray(event?.materials_attachment_ids) ? event.materials_attachment_ids : []).forEach((id) => {
    const normalized = String(id || '').trim();
    if (normalized) ids.push(normalized);
  });
  const primaryId = String(event?.material_id || '').trim();
  if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  return ids;
}

export default function AssignmentSubmittalRequestModal({
  visible = false,
  onClose,
  onRequested,
  familyId,
  event = null,
  assignment = null,
  subjectId = null,
  assignedChildIds = [],
  children = [],
  materials = [],
  eventAttachmentMaterials = [],
  onOpenAttachment,
}) {
  const toast = useToast();
  const [instructions, setInstructions] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [authUserId, setAuthUserId] = useState(null);

  const childIds = useMemo(
    () => getChildIdsFromEvent(event, assignedChildIds),
    [event, assignedChildIds],
  );
  const primaryChildId = childIds[0] || null;
  const childName = useMemo(() => {
    if (!primaryChildId) return 'Student';
    const match = (children || []).find((c) => String(c?.id) === String(primaryChildId));
    return String(match?.first_name || match?.name || 'Student').trim() || 'Student';
  }, [children, primaryChildId]);

  const materialById = useMemo(() => {
    const map = new Map();
    [...(materials || []), ...(eventAttachmentMaterials || [])].forEach((material) => {
      const id = String(material?.id || '').trim();
      if (id) map.set(id, material);
    });
    return map;
  }, [materials, eventAttachmentMaterials]);

  const attachmentItems = useMemo(() => {
    return getEventMaterialIds(event).map((id) => ({
      id,
      label: resolveMaterialLabel(materialById.get(id)),
      material: materialById.get(id) || { id, title: id },
    }));
  }, [event, materialById]);

  useEffect(() => {
    if (!visible) return;
    setInstructions('');
    setError('');
    supabase.auth.getUser().then(({ data }) => {
      setAuthUserId(data?.user?.id || null);
    });
  }, [visible, event?.id, assignment?.id]);

  const handleRequest = useCallback(async () => {
    const trimmed = String(instructions || '').trim();
    if (!trimmed && attachmentItems.length === 0) {
      setError('Add instructions or attach materials on the event first.');
      return;
    }
    if (!familyId || !event?.id || !primaryChildId) {
      setError('Choose a student on this event first.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const bodyParts = [];
      if (trimmed) bodyParts.push(trimmed);
      if (attachmentItems.length > 0) {
        bodyParts.push(`Attachments: ${attachmentItems.map((item) => item.label).join(', ')}`);
      }
      const composedBody = bodyParts.join('\n\n').trim() || 'Please submit your work for this assignment.';
      const assignmentId = await ensureLinkedAssignment({
        familyId,
        event,
        childId: primaryChildId,
        subjectId: subjectId || event?.subject_id,
        userId: authUserId,
        title: event?.title,
        description: composedBody,
        status: 'not_started',
      });
      if (!assignmentId) throw new Error('Could not create submittal request');
      await appendAssignmentMessage(assignmentId, `[Submittal requested]\n${composedBody}`, 'submittal_request');
      toast.push(`Submittal requested from ${childName}`, 'success');
      dispatchAssignmentRefreshEvents();
      onRequested?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not request submittal.');
    } finally {
      setSending(false);
    }
  }, [
    instructions,
    attachmentItems,
    familyId,
    event,
    primaryChildId,
    subjectId,
    authUserId,
    childName,
    toast,
    onRequested,
    onClose,
  ]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
            <X size={20} color="#6B7280" />
          </TouchableOpacity>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Request submittal</Text>
            <Text style={styles.helperText}>
              Send a focused work request to {childName}. Use instructions below and any event attachments as the artifact to complete.
            </Text>

            <Text style={styles.fieldLabel}>Instructions for student</Text>
            <TextInput
              style={styles.input}
              placeholder="What should they submit? (e.g. complete worksheet, upload photo of work…)"
              placeholderTextColor="#9CA3AF"
              value={instructions}
              onChangeText={(value) => {
                setInstructions(value);
                if (error) setError('');
              }}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Included attachments</Text>
            {attachmentItems.length === 0 ? (
              <Text style={styles.emptyAttachments}>No attachments on this event yet.</Text>
            ) : (
              <View style={styles.attachmentsList}>
                {attachmentItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.attachmentRow}
                    onPress={() => onOpenAttachment?.(item.material)}
                    {...(Platform.OS === 'web' && { cursor: onOpenAttachment ? 'pointer' : 'default', title: item.label })}
                  >
                    <Paperclip size={14} color="#2563EB" />
                    <Text style={styles.attachmentText} numberOfLines={1} ellipsizeMode="tail">
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              onPress={handleRequest}
              disabled={sending}
              {...(Platform.OS === 'web' && { cursor: sending ? 'not-allowed' : 'pointer' })}
            >
              {sending ? (
                <ActivityIndicator color="#5B6880" />
              ) : (
                <View style={styles.sendRow}>
                  <Send size={14} color="#5B6880" />
                  <Text style={styles.sendText}>Request submittal</Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '84%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    paddingRight: 36,
  },
  helperText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: '#6B7280',
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 120,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  emptyAttachments: {
    fontSize: 13,
    color: '#94A3B8',
  },
  attachmentsList: {
    gap: 6,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    minWidth: 0,
  },
  attachmentText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#DC2626',
  },
  sendButton: {
    marginTop: 20,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
});
