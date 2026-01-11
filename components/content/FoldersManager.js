import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Folder, FolderPlus, Edit2, Trash2, X, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

const FOLDER_TYPES = [
  { key: 'syllabus', label: 'Syllabus' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'medical', label: 'Medical' },
  { key: 'id', label: 'ID' },
  { key: 'activities', label: 'Activities' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'custom', label: 'Custom' },
];

/**
 * Folders Manager Component
 * Organize documents into folders
 */
export default function FoldersManager({ familyId, childId, onFolderSelected }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    folder_type: 'custom',
    parent_folder_id: null,
  });

  useEffect(() => {
    if (familyId) {
      loadFolders();
    }
  }, [familyId, childId]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (childId) params.append('child_id', childId);
      
      const { data, error } = await apiRequest(`/api/content/folders?${params.toString()}`, {
        method: 'GET',
      });

      if (error) throw error;
      setFolders(data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    try {
      const { data, error } = await apiRequest('/api/content/folders', {
        method: 'POST',
        body: JSON.stringify({
          child_id: childId,
          ...formData,
        }),
      });

      if (error) throw error;

      await loadFolders();
      setShowCreateModal(false);
      setFormData({ name: '', folder_type: 'custom', parent_folder_id: null });
      Alert.alert('Success', 'Folder created');
    } catch (error) {
      Alert.alert('Error', 'Failed to create folder');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    Alert.alert(
      'Delete Folder',
      'Are you sure? Files in this folder will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('document_folders')
                .delete()
                .eq('id', folderId);

              await loadFolders();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete folder');
            }
          },
        },
      ]
    );
  };

  const getFolderPath = (folder) => {
    const path = [folder];
    let current = folder;
    while (current.parent_folder_id) {
      const parent = folders.find(f => f.id === current.parent_folder_id);
      if (parent) {
        path.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }
    return path;
  };

  const renderFolder = (folder) => {
    const path = getFolderPath(folder);
    const folderType = FOLDER_TYPES.find(t => t.key === folder.folder_type);
    const hasChildren = folders.some(f => f.parent_folder_id === folder.id);

    return (
      <TouchableOpacity
        key={folder.id}
        style={styles.folderItem}
        onPress={() => {
          if (onFolderSelected) {
            onFolderSelected(folder);
          }
        }}
      >
        <View style={styles.folderIcon}>
          <Folder size={20} color={colors.text} />
        </View>
        <View style={styles.folderContent}>
          <Text style={styles.folderName}>{folder.name}</Text>
          <View style={styles.folderPath}>
            {path.map((p, idx) => (
              <React.Fragment key={p.id}>
                <Text style={styles.pathSegment}>{p.name}</Text>
                {idx < path.length - 1 && (
                  <ChevronRight size={12} color={colors.muted} />
                )}
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.folderMeta}>
            {folderType?.label || folder.folder_type}
            {hasChildren && ' • Has subfolders'}
          </Text>
        </View>
        <View style={styles.folderActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              setEditingFolder(folder);
              setFormData({
                name: folder.name,
                folder_type: folder.folder_type,
                parent_folder_id: folder.parent_folder_id,
              });
              setShowEditModal(true);
            }}
          >
            <Edit2 size={16} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDeleteFolder(folder.id)}
          >
            <Trash2 size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const handleUpdateFolder = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    try {
      await supabase
        .from('document_folders')
        .update({
          name: formData.name,
          folder_type: formData.folder_type,
          parent_folder_id: formData.parent_folder_id,
        })
        .eq('id', editingFolder.id);

      await loadFolders();
      setShowEditModal(false);
      setEditingFolder(null);
      Alert.alert('Success', 'Folder updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update folder');
    }
  };

  const renderModal = (isEdit = false) => {
    const availableParents = folders.filter(f => 
      !isEdit || f.id !== editingFolder?.id
    );

    return (
      <Modal
        visible={isEdit ? showEditModal : showCreateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          if (isEdit) {
            setShowEditModal(false);
            setEditingFolder(null);
          } else {
            setShowCreateModal(false);
          }
          setFormData({ name: '', folder_type: 'custom', parent_folder_id: null });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isEdit ? 'Edit Folder' : 'Create Folder'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (isEdit) {
                    setShowEditModal(false);
                    setEditingFolder(null);
                  } else {
                    setShowCreateModal(false);
                  }
                  setFormData({ name: '', folder_type: 'custom', parent_folder_id: null });
                }}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Folder Name</Text>
            <TextInput
              style={styles.input}
              placeholder="My Folder"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
            />

            <Text style={styles.label}>Folder Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeChips}>
              {FOLDER_TYPES.map(type => (
                <TouchableOpacity
                  key={type.key}
                  style={[
                    styles.typeChip,
                    formData.folder_type === type.key && styles.typeChipActive
                  ]}
                  onPress={() => setFormData({ ...formData, folder_type: type.key })}
                >
                  <Text style={[
                    styles.typeChipText,
                    formData.folder_type === type.key && styles.typeChipTextActive
                  ]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {availableParents.length > 0 && (
              <>
                <Text style={styles.label}>Parent Folder (optional)</Text>
                <ScrollView style={styles.parentList}>
                  <TouchableOpacity
                    style={[
                      styles.parentOption,
                      !formData.parent_folder_id && styles.parentOptionActive
                    ]}
                    onPress={() => setFormData({ ...formData, parent_folder_id: null })}
                  >
                    <Text style={styles.parentOptionText}>None (root level)</Text>
                  </TouchableOpacity>
                  {availableParents.map(parent => (
                    <TouchableOpacity
                      key={parent.id}
                      style={[
                        styles.parentOption,
                        formData.parent_folder_id === parent.id && styles.parentOptionActive
                      ]}
                      onPress={() => setFormData({ ...formData, parent_folder_id: parent.id })}
                    >
                      <Text style={styles.parentOptionText}>{parent.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  if (isEdit) {
                    setShowEditModal(false);
                    setEditingFolder(null);
                  } else {
                    setShowCreateModal(false);
                  }
                  setFormData({ name: '', folder_type: 'custom', parent_folder_id: null });
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={isEdit ? handleUpdateFolder : handleCreateFolder}
              >
                <Text style={styles.saveButtonText}>
                  {isEdit ? 'Update' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Folders</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowCreateModal(true)}
        >
          <FolderPlus size={16} color={colors.text} />
          <Text style={styles.addButtonText}>New Folder</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : folders.length === 0 ? (
        <View style={styles.emptyState}>
          <Folder size={48} color={colors.muted} />
          <Text style={styles.emptyText}>No folders</Text>
          <Text style={styles.emptySubtext}>
            Create folders to organize your documents
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.foldersList}>
          {folders.map(renderFolder)}
        </ScrollView>
      )}

      {renderModal(false)}
      {renderModal(true)}
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
  foldersList: {
    flex: 1,
    padding: 16,
  },
  folderItem: {
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
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderContent: {
    flex: 1,
  },
  folderName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  folderPath: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  pathSegment: {
    fontSize: 12,
    color: colors.muted,
  },
  folderMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  folderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
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
  typeChips: {
    marginBottom: 16,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  typeChipText: {
    fontSize: 14,
    color: colors.text,
  },
  typeChipTextActive: {
    color: colors.card,
  },
  parentList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  parentOption: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  parentOptionActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  parentOptionText: {
    fontSize: 14,
    color: colors.text,
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
  saveButton: {
    backgroundColor: colors.text,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.card,
  },
});

