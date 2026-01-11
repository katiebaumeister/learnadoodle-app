import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Platform, Modal, TextInput, Alert } from 'react-native';
import { Plus, Award, Download, Eye, X, Save, Trash2, Edit } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { designTokens } from '../../theme/designTokens';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import GeistCard from '../GeistCard';

export default function BadgesCertificates({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const { user } = useAuth();
  const tokens = getModeTokens(mode);
  const [badges, setBadges] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'badge',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadBadgesAndCertificates();
  }, [childId]);

  const loadBadgesAndCertificates = async () => {
    try {
      setLoading(true);
      // Load from child_documents with type 'badge' or 'certificate'
      const { data, error } = await supabase
        .from('child_documents')
        .select('*')
        .eq('child_id', childId)
        .in('type', ['badge', 'certificate', 'award'])
        .order('created_at', { ascending: false });
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      const badgesList = data?.filter(d => d.type === 'badge') || [];
      const certsList = data?.filter(d => d.type === 'certificate' || d.type === 'award') || [];
      
      setBadges(badgesList);
      setCertificates(certsList);
    } catch (error) {
      console.error('Error loading badges/certificates:', error);
      setBadges([]);
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.pdf';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          setSelectedFile(file);
          if (!formData.title) {
            setFormData({ ...formData, title: file.name.replace(/\.[^/.]+$/, '') });
          }
        }
      };
      input.click();
    }
  };

  const saveItem = async () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    try {
      let fileUrl = null;
      let filePath = null;

      // Upload file if selected
      if (selectedFile) {
        const path = `${familyId}/${childId}/${formData.type}/${crypto.randomUUID()}_${selectedFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(path, selectedFile, {
            contentType: selectedFile.type,
            metadata: { family_id: familyId, child_id: childId }
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(path);
        fileUrl = urlData?.publicUrl;
        filePath = path;
      }

      const documentData = {
        child_id: childId,
        family_id: familyId,
        type: formData.type,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        file_url: fileUrl || editingItem?.file_url || null,
        metadata: {
          date: formData.date,
          ...(filePath && { storage_path: filePath }),
        },
      };

      if (editingItem) {
        // Update existing
        const { error } = await supabase
          .from('child_documents')
          .update(documentData)
          .eq('id', editingItem.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('child_documents')
          .insert(documentData);

        if (error) throw error;
      }

      await loadBadgesAndCertificates();
      setShowModal(false);
      setEditingItem(null);
      setFormData({ title: '', type: 'badge', description: '', date: new Date().toISOString().split('T')[0] });
      setSelectedFile(null);
    } catch (error) {
      console.error('Error saving badge/certificate:', error);
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  };

  const deleteItem = async (item) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('child_documents')
                .delete()
                .eq('id', item.id);

              if (error) throw error;
              await loadBadgesAndCertificates();
            } catch (error) {
              console.error('Error deleting item:', error);
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      title: item.title || '',
      type: item.type || 'badge',
      description: item.description || '',
      date: item.metadata?.date || item.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    });
    setSelectedFile(null);
    setShowModal(true);
  };

  const openAddModal = (type = 'badge') => {
    setEditingItem(null);
    setFormData({ title: '', type, description: '', date: new Date().toISOString().split('T')[0] });
    setSelectedFile(null);
    setShowModal(true);
  };

  const getFileUrl = (item) => {
    if (item.file_url) return item.file_url;
    if (item.metadata?.storage_path) {
      const { data } = supabase.storage.from('evidence').getPublicUrl(item.metadata.storage_path);
      return data?.publicUrl;
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: tokens.text }]}>Badges & Certificates</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: tokens.accent }]}
            onPress={() => openAddModal('badge')}
          >
            <Plus size={16} color={tokens.surface} />
            <Text style={[styles.addButtonText, { color: tokens.surface }]}>Add Badge</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: tokens.accent }]}
            onPress={() => openAddModal('certificate')}
          >
            <Plus size={16} color={tokens.surface} />
            <Text style={[styles.addButtonText, { color: tokens.surface }]}>Add Certificate</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Badges Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>Badges</Text>
        {loading ? (
          <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading...</Text>
        ) : badges.length === 0 ? (
          <GeistCard variant="small">
            <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
              No badges earned yet. Click "Add Badge" to get started.
            </Text>
          </GeistCard>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll}>
            {badges.map((badge) => {
              const imageUrl = getFileUrl(badge);
              return (
                <GeistCard key={badge.id} variant="small" hoverable style={styles.badgeCard}>
                  <View style={styles.badgeContent}>
                    {imageUrl ? (
                      <Image 
                        source={{ uri: imageUrl }} 
                        style={styles.badgeImage}
                        onError={(e) => {
                          // Suppress 404 errors for missing images - they're harmless
                          if (Platform.OS === 'web' && e.nativeEvent) {
                            e.preventDefault?.();
                          }
                        }}
                      />
                    ) : (
                      <View style={[styles.badgeIcon, { backgroundColor: tokens.accentSoft }]}>
                        <Award size={48} color={tokens.accent} />
                      </View>
                    )}
                    <Text style={[styles.badgeName, { color: tokens.text }]} numberOfLines={2}>
                      {badge.title || 'Badge'}
                    </Text>
                    {badge.metadata?.date && (
                      <Text style={[styles.badgeDate, { color: tokens.textSecondary }]}>
                        {new Date(badge.metadata.date).toLocaleDateString()}
                      </Text>
                    )}
                    <View style={styles.badgeActions}>
                      <TouchableOpacity onPress={() => openEditModal(badge)}>
                        <Edit size={14} color={tokens.iconMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteItem(badge)}>
                        <Trash2 size={14} color={tokens.iconMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </GeistCard>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Certificates Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>Certificates</Text>
        {loading ? (
          <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading...</Text>
        ) : certificates.length === 0 ? (
          <GeistCard variant="small">
            <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
              No certificates recorded yet. Click "Add Certificate" to get started.
            </Text>
          </GeistCard>
        ) : (
          <View style={styles.certificatesGrid}>
            {certificates.map((cert) => {
              const imageUrl = getFileUrl(cert);
              return (
                <GeistCard key={cert.id} variant="medium" hoverable style={styles.certCard}>
                  <View style={styles.certContent}>
                    {imageUrl ? (
                      <Image 
                        source={{ uri: imageUrl }} 
                        style={styles.certImage}
                        onError={(e) => {
                          // Suppress 404 errors for missing images - they're harmless
                          if (Platform.OS === 'web' && e.nativeEvent) {
                            e.preventDefault?.();
                          }
                        }}
                      />
                    ) : (
                      <View style={[styles.certPlaceholder, { backgroundColor: tokens.bgSubtle }]}>
                        <Award size={32} color={tokens.iconMuted} />
                      </View>
                    )}
                    <View style={styles.certInfo}>
                      <Text style={[styles.certName, { color: tokens.text }]} numberOfLines={2}>
                        {cert.title || 'Certificate'}
                      </Text>
                      {cert.metadata?.date && (
                        <Text style={[styles.certDate, { color: tokens.textSecondary }]}>
                          {new Date(cert.metadata.date).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.certActions}>
                      {imageUrl && (
                        <>
                          <TouchableOpacity 
                            style={styles.certAction}
                            onPress={() => window.open(imageUrl, '_blank')}
                          >
                            <Eye size={16} color={tokens.iconMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.certAction}
                            onPress={() => {
                              const link = document.createElement('a');
                              link.href = imageUrl;
                              link.download = cert.title || 'certificate';
                              link.click();
                            }}
                          >
                            <Download size={16} color={tokens.iconMuted} />
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity onPress={() => openEditModal(cert)}>
                        <Edit size={16} color={tokens.iconMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteItem(cert)}>
                        <Trash2 size={16} color={tokens.iconMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </GeistCard>
              );
            })}
          </View>
        )}
      </View>

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowModal(false);
          setEditingItem(null);
          setFormData({ title: '', type: 'badge', description: '', date: new Date().toISOString().split('T')[0] });
          setSelectedFile(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: tokens.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.text }]}>
                {editingItem ? `Edit ${formData.type === 'badge' ? 'Badge' : 'Certificate'}` : `Add ${formData.type === 'badge' ? 'Badge' : 'Certificate'}`}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setEditingItem(null);
                  setFormData({ title: '', type: 'badge', description: '', date: new Date().toISOString().split('T')[0] });
                  setSelectedFile(null);
                }}
              >
                <X size={20} color={tokens.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Title *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="e.g., Math Excellence Award"
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Type</Text>
                <View style={styles.typeButtons}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor: formData.type === 'badge' ? tokens.accent : tokens.bg,
                        borderColor: tokens.border,
                      }
                    ]}
                    onPress={() => setFormData({ ...formData, type: 'badge' })}
                  >
                    <Text style={[
                      styles.typeButtonText,
                      { color: formData.type === 'badge' ? tokens.surface : tokens.text }
                    ]}>
                      Badge
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor: formData.type === 'certificate' ? tokens.accent : tokens.bg,
                        borderColor: tokens.border,
                      }
                    ]}
                    onPress={() => setFormData({ ...formData, type: 'certificate' })}
                  >
                    <Text style={[
                      styles.typeButtonText,
                      { color: formData.type === 'certificate' ? tokens.surface : tokens.text }
                    ]}>
                      Certificate
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Date</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="YYYY-MM-DD"
                  value={formData.date}
                  onChangeText={(text) => setFormData({ ...formData, date: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Description</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="Additional notes..."
                  multiline
                  numberOfLines={4}
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Image/File</Text>
                <TouchableOpacity
                  style={[styles.fileButton, { borderColor: tokens.border, backgroundColor: tokens.bg }]}
                  onPress={handleFileSelect}
                >
                  <Text style={[styles.fileButtonText, { color: tokens.text }]}>
                    {selectedFile ? selectedFile.name : editingItem?.file_url ? 'Change file...' : 'Select file...'}
                  </Text>
                  <Plus size={16} color={tokens.iconMuted} />
                </TouchableOpacity>
                {selectedFile && (
                  <Text style={[styles.fileInfo, { color: tokens.textSecondary }]}>
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </Text>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: tokens.border }]}
                onPress={() => {
                  setShowModal(false);
                  setEditingItem(null);
                  setFormData({ title: '', type: 'badge', description: '', date: new Date().toISOString().split('T')[0] });
                  setSelectedFile(null);
                }}
              >
                <Text style={[styles.cancelButtonText, { color: tokens.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: tokens.accent }]}
                onPress={saveItem}
              >
                <Save size={16} color={tokens.surface} />
                <Text style={[styles.saveButtonText, { color: tokens.surface }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
    marginBottom: spacing.sm,
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
    fontFamily: designTokens.fonts.sans,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
    fontFamily: designTokens.fonts.sans,
  },
  badgeScroll: {
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  badgeCard: {
    width: 160,
    marginRight: spacing.md,
  },
  badgeContent: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  badgeImage: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    resizeMode: 'cover',
  },
  badgeIcon: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
    textAlign: 'center',
  },
  badgeDate: {
    fontSize: 12,
    fontFamily: designTokens.fonts.sans,
  },
  badgeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  certificatesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  certCard: {
    flex: 1,
    minWidth: 250,
    maxWidth: 350,
  },
  certContent: {
    gap: spacing.md,
  },
  certImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    resizeMode: 'cover',
  },
  certPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  certInfo: {
    gap: spacing.xs,
  },
  certName: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
  },
  certDate: {
    fontSize: 13,
    fontFamily: designTokens.fonts.sans,
  },
  certActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  certAction: {
    padding: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '80%',
    borderRadius: radius.lg,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
  },
  modalBody: {
    flex: 1,
    padding: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  typeButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
  },
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  fileButtonText: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    flex: 1,
  },
  fileInfo: {
    fontSize: 12,
    fontFamily: designTokens.fonts.sans,
    marginTop: spacing.xs,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
  },
});
