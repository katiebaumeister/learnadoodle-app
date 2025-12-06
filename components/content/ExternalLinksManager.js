import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Link as LinkIcon, Plus, X, ExternalLink, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

const PROVIDERS = [
  { key: 'google_drive', label: 'Google Drive', icon: '📁' },
  { key: 'google_docs', label: 'Google Docs', icon: '📄' },
  { key: 'dropbox', label: 'Dropbox', icon: '📦' },
  { key: 'onedrive', label: 'OneDrive', icon: '☁️' },
  { key: 'other', label: 'Other', icon: '🔗' },
];

/**
 * External Links Manager Component
 * Add and manage links to Google Drive, Dropbox, etc.
 */
export default function ExternalLinksManager({ familyId, childId, subjectId, onLinkAdded }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    provider: 'google_drive',
    link_type: 'file',
    title: '',
    url: '',
    thumbnail_url: '',
  });

  useEffect(() => {
    if (familyId) {
      loadLinks();
    }
  }, [familyId, childId]);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (childId) params.append('child_id', childId);
      
      const { data, error } = await apiRequest(`/api/content/external-links?${params.toString()}`, {
        method: 'GET',
      });

      if (error) throw error;
      setLinks(data || []);
    } catch (error) {
      console.error('Error loading links:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLink = async () => {
    if (!formData.title.trim() || !formData.url.trim()) {
      Alert.alert('Error', 'Please fill in title and URL');
      return;
    }

    try {
      const { data, error } = await apiRequest('/api/content/external-links', {
        method: 'POST',
        body: JSON.stringify({
          child_id: childId,
          subject_id: subjectId,
          ...formData,
        }),
      });

      if (error) throw error;

      await loadLinks();
      setShowAddModal(false);
      setFormData({
        provider: 'google_drive',
        link_type: 'file',
        title: '',
        url: '',
        thumbnail_url: '',
      });

      if (onLinkAdded) {
        onLinkAdded(data);
      }

      Alert.alert('Success', 'Link added successfully');
    } catch (error) {
      console.error('Error adding link:', error);
      Alert.alert('Error', 'Failed to add link');
    }
  };

  const handleDeleteLink = async (linkId) => {
    try {
      await supabase
        .from('external_links')
        .delete()
        .eq('id', linkId);

      await loadLinks();
    } catch (error) {
      console.error('Error deleting link:', error);
      Alert.alert('Error', 'Failed to delete link');
    }
  };

  const renderLink = (link) => {
    const provider = PROVIDERS.find(p => p.key === link.provider);
    
    return (
      <TouchableOpacity
        key={link.id}
        style={styles.linkCard}
        onPress={() => {
          if (link.url && typeof window !== 'undefined') {
            window.open(link.url, '_blank');
          }
        }}
      >
        <View style={styles.linkIcon}>
          <ExternalLink size={20} color={colors.text} />
        </View>
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle} numberOfLines={1}>
            {link.title}
          </Text>
          <Text style={styles.linkMeta} numberOfLines={1}>
            {provider?.label || link.provider} • {link.link_type}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteLink(link.id)}
        >
          <Trash2 size={16} color={colors.muted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>External Links</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Plus size={16} color={colors.text} />
          <Text style={styles.addButtonText}>Add Link</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : links.length === 0 ? (
        <View style={styles.emptyState}>
          <LinkIcon size={48} color={colors.muted} />
          <Text style={styles.emptyText}>No external links</Text>
          <Text style={styles.emptySubtext}>
            Add links to Google Drive, Dropbox, or other cloud storage
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.linksList}>
          {links.map(renderLink)}
        </ScrollView>
      )}

      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add External Link</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Provider</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.providerChips}>
              {PROVIDERS.map(provider => (
                <TouchableOpacity
                  key={provider.key}
                  style={[
                    styles.providerChip,
                    formData.provider === provider.key && styles.providerChipActive
                  ]}
                  onPress={() => setFormData({ ...formData, provider: provider.key })}
                >
                  <Text style={styles.providerChipText}>{provider.icon} {provider.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Link Type</Text>
            <View style={styles.typeButtons}>
              {['file', 'folder', 'document'].map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    formData.link_type === type && styles.typeButtonActive
                  ]}
                  onPress={() => setFormData({ ...formData, link_type: type })}
                >
                  <Text style={[
                    styles.typeButtonText,
                    formData.link_type === type && styles.typeButtonTextActive
                  ]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Document name"
              value={formData.title}
              onChangeText={(text) => setFormData({ ...formData, title: text })}
            />

            <Text style={styles.label}>URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://..."
              value={formData.url}
              onChangeText={(text) => setFormData({ ...formData, url: text })}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Thumbnail URL (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="https://..."
              value={formData.thumbnail_url}
              onChangeText={(text) => setFormData({ ...formData, thumbnail_url: text })}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.addButton]}
                onPress={handleAddLink}
              >
                <Text style={styles.addButtonText}>Add Link</Text>
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
    backgroundColor: colors.bgSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.text,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.card,
  },
  linksList: {
    flex: 1,
    padding: 16,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkContent: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  linkMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  deleteButton: {
    padding: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  providerChips: {
    marginBottom: 16,
  },
  providerChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  providerChipText: {
    fontSize: 14,
    color: colors.text,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.card,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bgSubtle,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: colors.bgSubtle,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
});

