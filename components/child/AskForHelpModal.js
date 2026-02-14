/**
 * Ask for Help Modal
 * 
 * Child can request help on assignments, subjects, or general questions
 * Quick chips for common issues + optional note + photo
 * Stores in assignment_comments or creates help request event
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, TextInput, Platform, ActivityIndicator, Alert } from 'react-native';
import { X, Camera, Image as ImageIcon, Send, HelpCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toggleNeedHelp, createAssignment } from '../../lib/services/assignmentsClient';
import { createFileMaterial } from '../../lib/services/materialsClient';
import { useToast } from '../Toast';

const HELP_CHIPS = [
  { id: 'too_easy', label: 'Too easy' },
  { id: 'too_hard', label: 'Too hard' },
  { id: 'confusing', label: 'Confusing' },
  { id: 'bored', label: 'Bored' },
  { id: 'need_example', label: 'Need example' },
  { id: 'stuck', label: 'Stuck' },
];

export default function AskForHelpModal({
  visible,
  onClose,
  assignment = null,
  subject = null,
  childId,
  familyId,
  onHelpRequested,
}) {
  const [selectedChips, setSelectedChips] = useState([]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const handleChipToggle = (chipId) => {
    setSelectedChips(prev => 
      prev.includes(chipId) 
        ? prev.filter(id => id !== chipId)
        : [...prev, chipId]
    );
  };

  const handlePhotoSelect = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          setPhoto(file);
        }
      };
      input.click();
    } else {
      Alert.alert('Photo', 'Photo selection requires native implementation');
    }
  };

  const handleSubmit = async () => {
    if (selectedChips.length === 0 && !note.trim() && !photo) {
      toast.push('Please select an issue or add a note', 'error');
      return;
    }

    setUploading(true);
    try {
      let photoMaterialId = null;

      // Upload photo if provided
      if (photo) {
        const filePath = `${familyId}/${childId}/help_requests/${Date.now()}_${photo.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(filePath, photo, {
            upsert: false,
            contentType: photo.type,
            metadata: { family_id: familyId },
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath);
        const materialData = await createFileMaterial({
          familyId,
          storagePath: filePath,
          title: photo.name,
          mime: photo.type,
          bytes: photo.size,
          childId: childId,
          url: urlData?.publicUrl,
        });
        photoMaterialId = materialData.id;
      }

      // If assignment provided, toggle need_help and add comment
      if (assignment) {
        // Toggle need_help flag
        await toggleNeedHelp(assignment.id);

        // Add help request comment
        const helpText = [
          ...selectedChips.map(id => HELP_CHIPS.find(c => c.id === id)?.label).filter(Boolean),
          note.trim(),
        ].filter(Boolean).join('. ');

        await supabase.from('assignment_comments').insert({
          assignment_id: assignment.id,
          family_id: familyId,
          author_id: (await supabase.auth.getUser()).data.user.id,
          comment_text: helpText || 'Help requested',
          comment_type: 'question',
          is_internal: false,
        });

        toast.push('Help request sent!', 'success');
      } else {
        // Create a help request event/log entry
        // Store as event with source='help_request' or in learning log
        const helpText = [
          ...selectedChips.map(id => HELP_CHIPS.find(c => c.id === id)?.label).filter(Boolean),
          note.trim(),
        ].filter(Boolean).join('. ');

        // Create event for help request
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('events').insert({
          family_id: familyId,
          child_id: childId,
          title: subject ? `Help: ${subject.name}` : 'Help Request',
          description: helpText,
          event_type: 'Note',
          source: 'help_request',
          status: 'scheduled',
          start_ts: new Date().toISOString(),
          created_by: user.id,
        });

        toast.push('Help request sent!', 'success');
      }

      // Reset form
      setSelectedChips([]);
      setNote('');
      setPhoto(null);

      if (onHelpRequested) {
        onHelpRequested({ assignment, subject, chips: selectedChips, note, photoMaterialId });
      }

      onClose();
    } catch (error) {
      console.error('[AskForHelpModal] Error:', error);
      toast.push('Failed to send help request: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <HelpCircle size={24} color="#887DEE" />
              <Text style={styles.title}>Ask for Help</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              disabled={uploading}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Context */}
          {(assignment || subject) && (
            <View style={styles.contextContainer}>
              <Text style={styles.contextText}>
                {assignment ? `Assignment: ${assignment.title}` : `Subject: ${subject.name}`}
              </Text>
            </View>
          )}

          {/* Quick Chips */}
          <View style={styles.chipsContainer}>
            <Text style={styles.chipsLabel}>What's hard?</Text>
            <View style={styles.chipsRow}>
              {HELP_CHIPS.map(chip => (
                <TouchableOpacity
                  key={chip.id}
                  style={[
                    styles.chip,
                    selectedChips.includes(chip.id) && styles.chipSelected,
                  ]}
                  onPress={() => handleChipToggle(chip.id)}
                  disabled={uploading}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedChips.includes(chip.id) && styles.chipTextSelected,
                    ]}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Optional Note */}
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>Add a note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Tell us more..."
              placeholderTextColor="#9ca3af"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              editable={!uploading}
            />
          </View>

          {/* Photo Upload */}
          <View style={styles.photoContainer}>
            <TouchableOpacity
              style={styles.photoButton}
              onPress={handlePhotoSelect}
              disabled={uploading}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              {photo ? (
                <>
                  <ImageIcon size={16} color="#887DEE" />
                  <Text style={styles.photoButtonTextSelected}>{photo.name}</Text>
                </>
              ) : (
                <>
                  <Camera size={16} color="#6b7280" />
                  <Text style={styles.photoButtonText}>Add photo (optional)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={uploading}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, uploading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={uploading || (selectedChips.length === 0 && !note.trim() && !photo)}
              {...(Platform.OS === 'web' && { cursor: (uploading || (selectedChips.length === 0 && !note.trim() && !photo)) ? 'not-allowed' : 'pointer' })}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Send size={16} color="#ffffff" />
                  <Text style={styles.submitButtonText}>Send</Text>
                </>
              )}
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
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    padding: 24,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  contextContainer: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  contextText: {
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipsContainer: {
    marginBottom: 20,
  },
  chipsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
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
  chipSelected: {
    backgroundColor: '#ede9fe',
    borderColor: '#887DEE',
  },
  chipText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipTextSelected: {
    color: '#887DEE',
  },
  noteContainer: {
    marginBottom: 20,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  noteInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 80,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  photoContainer: {
    marginBottom: 24,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  photoButtonText: {
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  photoButtonTextSelected: {
    fontSize: 14,
    color: '#887DEE',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#887DEE',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
