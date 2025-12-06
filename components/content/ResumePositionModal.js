import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { X, Save, Clock, CheckCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { updateResumePosition, markComplete } from '../../lib/services/resumeClient';
import { useToast } from '../Toast';

/**
 * ResumePositionModal
 * Allows users to update or clear resume position for an event
 */
export default function ResumePositionModal({ 
  isOpen, 
  onClose, 
  event,
  onUpdated 
}) {
  const [position, setPosition] = useState(event?.resume_position || '');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  React.useEffect(() => {
    if (isOpen && event) {
      setPosition(event.resume_position || '');
    }
  }, [isOpen, event]);

  const handleSave = async () => {
    if (!event?.id) return;

    setLoading(true);
    try {
      const { error } = await updateResumePosition(event.id, position.trim() || null);
      
      if (error) throw error;

      toast.push('Resume position updated', 'success');
      if (onUpdated) {
        onUpdated();
      }
      onClose();
    } catch (error) {
      console.error('Error updating resume position:', error);
      toast.push('Failed to update resume position', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!event?.id) return;

    setLoading(true);
    try {
      const { error } = await markComplete(event.id);
      
      if (error) throw error;

      toast.push('Event marked as complete', 'success');
      if (onUpdated) {
        onUpdated();
      }
      onClose();
    } catch (error) {
      console.error('Error marking complete:', error);
      toast.push('Failed to mark as complete', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !event) return null;

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Clock size={20} color={colors.accent} />
              <Text style={styles.title}>Resume Position</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            
            {event.source_link && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Source: {event.source_link.includes('youtube') ? 'YouTube' : 'External Link'}
                </Text>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Resume Position</Text>
              <Text style={styles.hint}>
                Enter timestamp (e.g., "12:34" or "754" seconds) or chapter/lesson info
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 12:34 or Chapter 3, Lesson 2"
                value={position}
                onChangeText={setPosition}
                autoFocus
              />
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.completeButton}
                onPress={handleMarkComplete}
                disabled={loading}
              >
                <CheckCircle size={16} color="#ffffff" />
                <Text style={styles.completeButtonText}>Mark Complete</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              <Save size={16} color="#ffffff" />
              <Text style={styles.saveButtonText}>Save Position</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
    maxHeight: 400,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  infoText: {
    fontSize: 13,
    color: '#0369a1',
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  actions: {
    marginTop: 8,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#10b981',
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

