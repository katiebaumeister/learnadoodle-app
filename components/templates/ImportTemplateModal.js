import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { X, Upload, FileText, Link, AlertCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import { apiRequest } from '../../lib/apiClient';

export default function ImportTemplateModal({ 
  isOpen, 
  onClose,
  onSuccess,
  familyId,
}) {
  const [importType, setImportType] = useState('file'); // 'file' or 'url'
  const [selectedFile, setSelectedFile] = useState(null);
  const [googleDocUrl, setGoogleDocUrl] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [processing, setProcessing] = useState(false);
  const toast = useToast();

  const handleFileSelect = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.txt';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          setSelectedFile(file);
          if (!templateTitle) {
            // Remove extension for default title
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            setTemplateTitle(nameWithoutExt);
          }
        }
      };
      input.click();
    } else {
      Alert.alert('File Upload', 'File picker not available on this platform');
    }
  };

  const handleImport = async () => {
    if (!templateTitle.trim()) {
      toast.push('Template title is required', 'error');
      return;
    }

    if (importType === 'file' && !selectedFile) {
      toast.push('Please select a file', 'error');
      return;
    }

    if (importType === 'url' && !googleDocUrl.trim()) {
      toast.push('Please enter a Google Docs URL', 'error');
      return;
    }

    setProcessing(true);
    try {
      let filePath = null;
      let fileUrl = null;

      if (importType === 'file') {
        // Upload file to storage
        const randomId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const path = `${familyId}/templates/${randomId}_${selectedFile.name}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(path, selectedFile, {
            contentType: selectedFile.type,
            metadata: { family_id: familyId, type: 'template_import' }
          });

        if (uploadError) throw uploadError;
        filePath = uploadData.path;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('evidence')
          .getPublicUrl(path);
        fileUrl = urlData.publicUrl;
      } else {
        // For Google Docs, we'll use the URL directly
        fileUrl = googleDocUrl.trim();
      }

      // Call backend to parse and create template
      const { data, error } = await apiRequest('/api/lesson-templates/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: templateTitle.trim(),
          file_path: filePath,
          file_url: fileUrl,
          import_type: importType,
          family_id: familyId,
        }),
      });

      if (error) throw error;

      toast.push('Template imported successfully!', 'success');
      onSuccess?.();
      onClose();
      resetForm();
    } catch (error) {
      toast.push('Failed to import template: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setGoogleDocUrl('');
    setTemplateTitle('');
    setImportType('file');
  };

  const handleClose = () => {
    if (!processing) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Upload size={20} color={colors.accent} />
              <Text style={styles.title}>Import Template</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton} disabled={processing}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Import Type Selector */}
            <View style={styles.field}>
              <Text style={styles.label}>Import From</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    importType === 'file' && styles.typeButtonActive
                  ]}
                  onPress={() => setImportType('file')}
                  disabled={processing}
                >
                  <FileText size={16} color={importType === 'file' ? '#ffffff' : colors.muted} />
                  <Text style={[
                    styles.typeButtonText,
                    importType === 'file' && styles.typeButtonTextActive
                  ]}>
                    File (PDF/DOC)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    importType === 'url' && styles.typeButtonActive
                  ]}
                  onPress={() => setImportType('url')}
                  disabled={processing}
                >
                  <Link size={16} color={importType === 'url' ? '#ffffff' : colors.muted} />
                  <Text style={[
                    styles.typeButtonText,
                    importType === 'url' && styles.typeButtonTextActive
                  ]}>
                    Google Docs URL
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Template Title */}
            <View style={styles.field}>
              <Text style={styles.label}>Template Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Math Unit 1 Template"
                value={templateTitle}
                onChangeText={setTemplateTitle}
                editable={!processing}
              />
            </View>

            {/* File Upload */}
            {importType === 'file' && (
              <View style={styles.field}>
                <Text style={styles.label}>Select File</Text>
                <TouchableOpacity
                  style={styles.fileButton}
                  onPress={handleFileSelect}
                  disabled={processing}
                >
                  <Upload size={18} color={colors.accent} />
                  <Text style={styles.fileButtonText}>
                    {selectedFile ? selectedFile.name : 'Choose PDF, DOC, or DOCX file'}
                  </Text>
                </TouchableOpacity>
                {selectedFile && (
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileInfoText}>
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Google Docs URL */}
            {importType === 'url' && (
              <View style={styles.field}>
                <Text style={styles.label}>Google Docs URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://docs.google.com/document/d/..."
                  value={googleDocUrl}
                  onChangeText={setGoogleDocUrl}
                  editable={!processing}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <View style={styles.infoBox}>
                  <AlertCircle size={16} color="#0369a1" />
                  <Text style={styles.infoText}>
                    Make sure the Google Doc is set to "Anyone with the link can view"
                  </Text>
                </View>
              </View>
            )}

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                The system will extract lesson structure, objectives, materials, and steps from your document.
                You can edit the template after import.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={processing}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.importButton, processing && styles.importButtonDisabled]}
              onPress={handleImport}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.importButtonText}>Import Template</Text>
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
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
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
    maxHeight: Platform.OS === 'web' ? 500 : 400,
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
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  typeButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  typeButtonTextActive: {
    color: '#ffffff',
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
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  fileButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  fileInfo: {
    marginTop: 8,
  },
  fileInfoText: {
    fontSize: 12,
    color: '#6b7280',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#0369a1',
    lineHeight: 18,
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
  importButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  importButtonDisabled: {
    opacity: 0.6,
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

