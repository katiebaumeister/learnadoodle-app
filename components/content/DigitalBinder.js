import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Folder, File, Link as LinkIcon, Plus, X, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

const BINDER_SECTIONS = [
  { key: 'syllabus', label: 'Syllabus' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'medical', label: 'Medical' },
  { key: 'id', label: 'ID' },
  { key: 'activities', label: 'Activities' },
  { key: 'certificates', label: 'Certificates' },
];

/**
 * Digital Binder Component
 * Per-child document library organized by sections
 */
export default function DigitalBinder({ childId, familyId }) {
  const [items, setItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState('syllabus');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (childId && familyId) {
      loadBinder();
    }
  }, [childId, familyId]);

  const loadBinder = async () => {
    try {
      setLoading(true);
      const { data, error } = await apiRequest('/api/content/binder/' + childId, {
        method: 'GET',
      });

      if (error) throw error;

      // Group items by section
      const grouped = {};
      BINDER_SECTIONS.forEach(section => {
        grouped[section.key] = [];
      });

      (data || []).forEach(item => {
        if (grouped[item.binder_section]) {
          grouped[item.binder_section].push(item);
        }
      });

      setItems(grouped);
    } catch (error) {
      console.error('Error loading binder:', error);
      Alert.alert('Error', 'Failed to load binder');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToBinder = async (uploadId, externalLinkId, section) => {
    try {
      const { data, error } = await apiRequest('/api/content/binder', {
        method: 'POST',
        body: JSON.stringify({
          child_id: childId,
          upload_id: uploadId,
          external_link_id: externalLinkId,
          binder_section: section,
        }),
      });

      if (error) throw error;

      await loadBinder();
      setShowAddModal(false);
      Alert.alert('Success', 'Item added to binder');
    } catch (error) {
      console.error('Error adding to binder:', error);
      Alert.alert('Error', 'Failed to add item');
    }
  };

  const handleRemoveFromBinder = async (itemId) => {
    try {
      await supabase
        .from('document_binder')
        .delete()
        .eq('id', itemId);

      await loadBinder();
    } catch (error) {
      console.error('Error removing from binder:', error);
      Alert.alert('Error', 'Failed to remove item');
    }
  };

  const renderItem = (item) => {
    const isExternal = !!item.external_link_id;
    
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.itemCard}
        onPress={() => {
          if (item.url) {
            // Open URL
            if (typeof window !== 'undefined') {
              window.open(item.url, '_blank');
            }
          }
        }}
      >
        <View style={styles.itemIcon}>
          {isExternal ? (
            <LinkIcon size={20} color={colors.text} />
          ) : (
            <File size={20} color={colors.text} />
          )}
        </View>
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title || 'Untitled'}
          </Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            {isExternal ? 'External Link' : item.mime || 'File'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveFromBinder(item.id)}
        >
          <X size={16} color={colors.muted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const currentItems = items[selectedSection] || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Digital Binder</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Plus size={16} color={colors.text} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sections}>
        {BINDER_SECTIONS.map(section => (
          <TouchableOpacity
            key={section.key}
            style={[
              styles.sectionTab,
              selectedSection === section.key && styles.sectionTabActive
            ]}
            onPress={() => setSelectedSection(section.key)}
          >
            <Text
              style={[
                styles.sectionTabText,
                selectedSection === section.key && styles.sectionTabTextActive
              ]}
            >
              {section.label}
            </Text>
            {currentItems.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{currentItems.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : currentItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Folder size={48} color={colors.muted} />
          <Text style={styles.emptyText}>
            No items in {BINDER_SECTIONS.find(s => s.key === selectedSection)?.label}
          </Text>
          <Text style={styles.emptySubtext}>
            Add documents, links, or files to organize them here
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.itemsList}>
          {currentItems.map(renderItem)}
        </ScrollView>
      )}

      {/* Add Modal - simplified for now */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Binder</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalText}>
              Use the file upload or external links features to add items, then add them to the binder.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
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
  sections: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  sectionTabActive: {
    borderBottomColor: colors.text,
  },
  sectionTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted,
  },
  sectionTabTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  itemsList: {
    flex: 1,
    padding: 16,
  },
  itemCard: {
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
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  removeButton: {
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
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalText: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: colors.text,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.card,
  },
});

