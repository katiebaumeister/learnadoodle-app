/**
 * Evidence Upload Modal
 * Modal for uploading evidence files
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Alert, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { X, Upload, FileText } from 'lucide-react';
import { uploadEvidence } from '../../lib/services/recordsClient';
import { supabase } from '../../lib/supabase';
import { shouldSuppressError } from '../../lib/apiClient';
import { colors } from '../../theme/colors';
import { createFileMaterial } from '../../lib/services/materialsClient';

export default function EvidenceUploadModal({
  visible,
  onClose,
  onUploaded,
  familyId,
  defaultChildId = null,
  defaultDate = null,
  linkedEventId = null,
  children = [],
  subjects = [],
}) {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedChildId, setSelectedChildId] = useState(defaultChildId);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [selectedType, setSelectedType] = useState('');
  const fileInputRef = useRef(null);

  // Initialize from props when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedChildId(defaultChildId);
      if (linkedEventId) {
        // Pre-fill child from event if available
        // (We'll get this from the event context when opening from planner)
      }
    }
  }, [visible, defaultChildId, linkedEventId]);
  
  const handleFileSelect = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          setSelectedFile(file);
          if (!title) {
            setTitle(file.name);
          }
        }
      };
      input.click();
    } else {
      // Mobile file picker would go here
      Alert.alert('File Upload', 'File picker not implemented for mobile yet');
    }
  };
  
  const handleUpload = async () => {
    if (!selectedFile || !familyId) {
      Alert.alert('Error', 'Please select a file');
      return;
    }
    
    setUploading(true);
    
    try {
      const path = `${familyId}/${crypto.randomUUID()}_${selectedFile.name}`;
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(path, selectedFile, {
          upsert: false,
          contentType: selectedFile.type,
        });
      
      if (uploadError) {
        Alert.alert('Upload Error', uploadError.message);
        setUploading(false);
        return;
      }
      
      // Create upload record
      const insertPayload = {
        family_id: familyId,
        child_id: selectedChildId,
        subject_id: selectedSubjectId,
        storage_path: uploadData.path,
        caption: title || selectedFile.name,
        description: description || null,
        mime: selectedFile.type || 'application/octet-stream',
        bytes: selectedFile.size,
      };
      
      // Add linked event if provided
      if (linkedEventId) {
        insertPayload.event_id = linkedEventId;
      }
      
      const { data: recordData, error: recordError } = await supabase
        .from('uploads')
        .insert(insertPayload)
        .select()
        .single();
      
      if (recordError) {
        if (!shouldSuppressError(recordError)) {
          Alert.alert('Error', 'Failed to create upload record: ' + recordError.message);
        }
      } else {
        // Get file URL for auto-captioning
        const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(uploadData.path);
        const fileUrl = urlData?.publicUrl;

        // Trigger auto-captioning (non-blocking)
        if (recordData?.id && fileUrl) {
          autoCaptionOnUpload(recordData.id, selectedFile.type, fileUrl, title || selectedFile.name).catch(err => {
          });
        }

        if (onUploaded) onUploaded(recordData);
        if (Platform.OS === 'web' && linkedEventId) {
          // Show success message for evidence attached to event
          setTimeout(() => {
            if (typeof window !== 'undefined' && window.__ldShowToast) {
              window.__ldShowToast('Evidence attached to this session', 'success');
            }
          }, 100);
        }
        handleClose();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };
  
  const handleClose = () => {
    setSelectedFile(null);
    setTitle('');
    setDescription('');
    setSelectedChildId(defaultChildId);
    setSelectedSubjectId(null);
    setSelectedType('');
    onClose();
  };
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Upload Evidence</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.body}>
            {/* File Selection */}
            <View style={styles.field}>
              <Text style={styles.label}>File</Text>
              <TouchableOpacity
                style={styles.fileButton}
                onPress={handleFileSelect}
                disabled={uploading}
              >
                <Upload size={16} color={colors.indigo} />
                <Text style={styles.fileButtonText}>
                  {selectedFile ? selectedFile.name : 'Choose file...'}
                </Text>
              </TouchableOpacity>
              {selectedFile && (
                <Text style={styles.fileSize}>
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </Text>
              )}
            </View>
            
            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Optional title"
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
                placeholder="Optional notes"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>
            
            {/* Child Selection */}
            {children.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>Child</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {children.map(child => (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.chip,
                        selectedChildId === child.id && styles.chipActive
                      ]}
                      onPress={() => setSelectedChildId(child.id)}
                    >
                      <Text style={[
                        styles.chipText,
                        selectedChildId === child.id && styles.chipTextActive
                      ]}>
                        {child.first_name || child.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            
            {/* Subject Selection */}
            {subjects.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>Subject</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {subjects.map(subj => (
                    <TouchableOpacity
                      key={subj.id}
                      style={[
                        styles.chip,
                        selectedSubjectId === subj.id && styles.chipActive
                      ]}
                      onPress={() => setSelectedSubjectId(selectedSubjectId === subj.id ? null : subj.id)}
                    >
                      <Text style={[
                        styles.chipText,
                        selectedSubjectId === subj.id && styles.chipTextActive
                      ]}>
                        {subj.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
          
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={uploading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadButton, (!selectedFile || uploading) && styles.uploadButtonDisabled]}
              onPress={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? (
                <>
                  <ActivityIndicator size="small" color={colors.white} />
                  <Text style={styles.uploadButtonText}>Uploading…</Text>
                </>
              ) : (
                <>
                  <Upload size={14} color={colors.white} />
                  <Text style={styles.uploadButtonText}>Upload</Text>
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
    backgroundColor: colors.card,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    padding: 16,
    maxHeight: 500,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  fileButtonText: {
    fontSize: 14,
    color: colors.indigo,
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
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
    minHeight: 60,
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
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});

