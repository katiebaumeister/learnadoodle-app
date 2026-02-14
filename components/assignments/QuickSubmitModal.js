/**
 * Quick Submit Modal Component
 * One-tap assignment submission with photo/video upload
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { X, Camera, Upload, Image as ImageIcon, Video } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { submitAssignment } from '../../lib/services/assignmentsClient';
import { createFileMaterial } from '../../lib/services/materialsClient';
import ReflectionPrompts from '../child/ReflectionPrompts';

export default function QuickSubmitModal({ visible, assignment, childId, familyId, onClose, onSubmitted, showReflection = false }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showReflectionPrompts, setShowReflectionPrompts] = useState(false);
  const [submittedEvidenceId, setSubmittedEvidenceId] = useState(null);

  const handleCameraCapture = async () => {
    if (Platform.OS === 'web') {
      // Web: Use file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.capture = 'environment'; // Prefer rear camera on mobile
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          await handleFileUpload(file);
        }
      };
      input.click();
    } else {
      // Mobile: Would use expo-image-picker or similar
      Alert.alert('Camera', 'Camera functionality requires native implementation');
    }
  };

  const handlePhotoLibrary = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.multiple = false;
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          await handleFileUpload(file);
        }
      };
      input.click();
    } else {
      Alert.alert('Photo Library', 'Photo library requires native implementation');
    }
  };

  const handleFileUpload = async (file) => {
    if (!assignment || !childId || !familyId) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${assignment.id}_${Date.now()}.${fileExt}`;
      const filePath = `${familyId}/${childId}/assignments/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('uploads')
        .getPublicUrl(filePath);

      // Create file material (replaces uploads table insert)
      const recordData = await createFileMaterial({
        familyId,
        storagePath: filePath,
        title: file.name,
        mime: file.type,
        bytes: file.size,
        childId: childId,
        url: publicUrl,
      });

      // Submit assignment with evidence
      const { error: submitError } = await submitAssignment(assignment.id, recordData.id);

      if (submitError) throw submitError;

      // Update assignment with submission media info
      const mediaInfo = {
        type: file.type.startsWith('image/') ? 'image' : 'video',
        url: publicUrl,
        thumbnail: file.type.startsWith('image/') ? publicUrl : null,
      };

      const currentMedia = assignment.submission_media || [];
      await supabase
        .from('assignments')
        .update({
          submission_media: [...currentMedia, mediaInfo],
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignment.id);

      // Success!
      setSubmittedEvidenceId(recordData.id);

      if (showReflection) {
        // Show reflection prompts instead of closing
        setShowReflectionPrompts(true);
      } else {
        if (Platform.OS === 'web') {
          // Don't show alert - let parent component handle success
        } else {
          Alert.alert('Success', 'Assignment submitted successfully!');
        }

        if (onSubmitted) {
          onSubmitted(assignment.id, recordData.id);
        }

        onClose();
      }
    } catch (error) {
      const errorMessage = error.message || 'Failed to submit assignment';
      if (Platform.OS === 'web') {
        alert(`Error: ${errorMessage}`);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Show reflection prompts if enabled and submission successful
  if (showReflectionPrompts && showReflection) {
    return (
      <Modal
        visible={visible}
        transparent={true}
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            <ReflectionPrompts
              assignment={assignment}
              childId={childId}
              familyId={familyId}
              onComplete={(reflection) => {
                setShowReflectionPrompts(false);
                if (onSubmitted) {
                  onSubmitted(assignment.id, submittedEvidenceId, reflection);
                }
                onClose();
              }}
            />
          </View>
        </View>
      </Modal>
    );
  }

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
            <Text style={styles.title}>Quick Submit</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={uploading}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Assignment Info */}
          <View style={styles.assignmentInfo}>
            <Text style={styles.assignmentTitle}>{assignment?.title}</Text>
            <Text style={styles.instructionText}>
              Take a photo or select from your library to submit this assignment
            </Text>
          </View>

          {/* Upload Options */}
          {!uploading ? (
            <View style={styles.optionsContainer}>
              <TouchableOpacity
                style={styles.optionButton}
                onPress={handleCameraCapture}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIcon, { backgroundColor: colors.blueSoft }]}>
                  <Camera size={32} color={colors.blueBold} />
                </View>
                <Text style={styles.optionLabel}>Take Photo</Text>
                <Text style={styles.optionSubtext}>Use camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionButton}
                onPress={handlePhotoLibrary}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIcon, { backgroundColor: colors.greenSoft }]}>
                  <ImageIcon size={32} color={colors.greenBold} />
                </View>
                <Text style={styles.optionLabel}>Choose Photo</Text>
                <Text style={styles.optionSubtext}>From library</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color={colors.indigo} />
              <Text style={styles.uploadingText}>Uploading and submitting...</Text>
              {uploadProgress > 0 && (
                <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
              )}
            </View>
          )}

          {/* Cancel Button */}
          {!uploading && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
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
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  assignmentInfo: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  assignmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  optionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  optionSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  uploadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  uploadingText: {
    fontSize: 16,
    color: colors.text,
    marginTop: 16,
  },
  progressText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});

