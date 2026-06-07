import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Paperclip } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import AppModalOverlay from '../ui/AppModalOverlay';
import AppModalShell from '../ui/AppModalShell';
import { ModalFooter } from '../ui/ModalFooter';
import ModalField from '../ui/ModalField';
import ModalSection from '../ui/ModalSection';
import { MODAL_SIZE } from '../ui/modalSystem';
import { modalFieldStyles } from '../ui/modalFieldStyles';
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
    <AppModalOverlay visible={visible} onClose={onClose} size={MODAL_SIZE.standard}>
      <AppModalShell
        title="New Submission Request"
        description={`Send work instructions to ${childName}.`}
        onClose={onClose}
        onGenerate={() => {
          toast.push('AI generation for submission requests is coming soon.', 'info');
        }}
        generateLabel="Generate"
        size={MODAL_SIZE.standard}
        footer={(
          <ModalFooter
            mode="add"
            primaryLabel={sending ? 'Sending…' : 'Create'}
            onCancel={onClose}
            onPrimary={handleRequest}
            onBlockedPrimary={() => setError('Add instructions or attachments before sending.')}
            disabled={sending}
            loading={sending}
          />
        )}
      >
        <ModalSection title="Details" showDividerAfter={false}>
          <ModalField label="Instructions" required>
            <TextInput
              style={[modalFieldStyles.input, styles.multilineInput]}
              placeholder="What should they submit?"
              placeholderTextColor="#9CA3AF"
              value={instructions}
              onChangeText={(value) => {
                setInstructions(value);
                if (error) setError('');
              }}
              multiline
              textAlignVertical="top"
            />
          </ModalField>

          <ModalField label="Submission type">
            <Text style={styles.staticValue}>Student upload / completion</Text>
          </ModalField>

          <ModalField label="Included attachments">
            {attachmentItems.length === 0 ? (
              <Text style={styles.emptyAttachments}>No attachments on this event yet.</Text>
            ) : (
              <View style={styles.attachmentsList}>
                {attachmentItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.attachmentRow}
                    onPress={() => onOpenAttachment?.(item.material)}
                    {...(Platform.OS === 'web' && { cursor: onOpenAttachment ? 'pointer' : 'default' })}
                  >
                    <Paperclip size={14} color="#2563EB" />
                    <Text style={styles.attachmentText} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ModalField>
        </ModalSection>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </AppModalShell>
    </AppModalOverlay>
  );
}

const styles = StyleSheet.create({
  multilineInput: {
    minHeight: 120,
    height: 'auto',
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: 'top',
  },
  staticValue: {
    fontSize: 15,
    color: '#475569',
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
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  errorText: {
    marginTop: 4,
    fontSize: 13,
    color: '#DC2626',
  },
});
