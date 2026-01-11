import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { X, GitBranch, Clock, CheckCircle, Plus } from 'lucide-react';
import { colors } from '../../theme/colors';
import { listTemplateVersions, createTemplateVersion } from '../../lib/services/templatesClient';
import { useToast } from '../Toast';

export default function TemplateVersionModal({
  isOpen,
  onClose,
  template,
  familyId,
  onVersionCreated,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [versionNotes, setVersionNotes] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (isOpen && template?.id) {
      loadVersions();
    }
  }, [isOpen, template?.id]);

  const loadVersions = async () => {
    if (!template?.id) return;
    setLoading(true);
    try {
      const { data, error } = await listTemplateVersions(template.id);
      if (error) throw error;
      setVersions(data || []);
    } catch (error) {
      toast.push('Failed to load template versions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!template?.id || !versionNotes.trim()) {
      toast.push('Version notes are required', 'error');
      return;
    }

    setCreatingVersion(true);
    try {
      const { data, error } = await createTemplateVersion({
        templateId: template.id,
        versionNotes: versionNotes.trim(),
      });

      if (error) throw error;

      toast.push('New version created successfully!', 'success');
      setVersionNotes('');
      setShowCreateForm(false);
      await loadVersions();
      onVersionCreated?.(data);
    } catch (error) {
      toast.push('Failed to create version', 'error');
    } finally {
      setCreatingVersion(false);
    }
  };

  const getCurrentVersion = () => {
    return versions.find(v => v.is_current_version) || versions[0];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <GitBranch size={20} color={colors.accent} />
              <Text style={styles.title}>Template Versions</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {template && (
            <View style={styles.templateInfo}>
              <Text style={styles.templateName}>{template.title || template.template_name}</Text>
              <Text style={styles.templateSubtext}>
                {versions.length} version{versions.length !== 1 ? 's' : ''} available
              </Text>
            </View>
          )}

          {!showCreateForm ? (
            <>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => setShowCreateForm(true)}
                >
                  <Plus size={16} color="#ffffff" />
                  <Text style={styles.createButtonText}>Create New Version</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.versionsList}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                  </View>
                ) : versions.length === 0 ? (
                  <View style={styles.emptyState}>
                    <GitBranch size={48} color={colors.muted} />
                    <Text style={styles.emptyText}>No versions yet</Text>
                    <Text style={styles.emptySubtext}>
                      Create a new version to track changes over time
                    </Text>
                  </View>
                ) : (
                  versions.map((version) => {
                    const isCurrent = version.is_current_version;
                    return (
                      <View
                        key={version.id}
                        style={[
                          styles.versionCard,
                          isCurrent && styles.versionCardCurrent
                        ]}
                      >
                        <View style={styles.versionHeader}>
                          <View style={styles.versionInfo}>
                            <View style={styles.versionBadge}>
                              <Text style={styles.versionNumber}>v{version.version}</Text>
                              {isCurrent && (
                                <View style={styles.currentBadge}>
                                  <CheckCircle size={14} color={colors.accent} />
                                  <Text style={styles.currentText}>Current</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.versionMeta}>
                              <Clock size={12} color={colors.muted} />
                              <Text style={styles.versionDate}>
                                {formatDate(version.created_at)}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {version.version_notes && (
                          <Text style={styles.versionNotes}>{version.version_notes}</Text>
                        )}

                        {version.created_by && (
                          <Text style={styles.versionAuthor}>
                            Created by {version.created_by}
                          </Text>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </>
          ) : (
            <View style={styles.createForm}>
              <Text style={styles.formTitle}>Create New Version</Text>
              <Text style={styles.formSubtitle}>
                Describe what changed in this version
              </Text>

              <TextInput
                style={styles.notesInput}
                placeholder="e.g., Updated objectives, added new materials, adjusted pacing..."
                value={versionNotes}
                onChangeText={setVersionNotes}
                multiline
                numberOfLines={4}
                autoFocus
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowCreateForm(false);
                    setVersionNotes('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, creatingVersion && styles.saveButtonDisabled]}
                  onPress={handleCreateVersion}
                  disabled={creatingVersion || !versionNotes.trim()}
                >
                  {creatingVersion ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Create Version</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
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
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  templateInfo: {
    padding: 16,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  templateSubtext: {
    fontSize: 14,
    color: colors.muted,
  },
  actions: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  versionsList: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  versionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  versionCardCurrent: {
    borderColor: colors.accent,
    backgroundColor: '#eff6ff',
  },
  versionHeader: {
    marginBottom: 8,
  },
  versionInfo: {
    gap: 8,
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  versionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  versionDate: {
    fontSize: 12,
    color: colors.muted,
  },
  versionNotes: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  versionAuthor: {
    fontSize: 12,
    color: colors.muted,
  },
  createForm: {
    padding: 20,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

