/**
 * Create Group Modal
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react';
import { colors } from '../../theme/colors';
import * as socialClient from '../../lib/services/socialClient';

export default function CreateGroupModal({ isOpen, onClose, familyId }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupType, setGroupType] = useState('coop');
  const [isPublic, setIsPublic] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [maxMembers, setMaxMembers] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    setLoading(true);
    try {
      const result = await socialClient.createGroup({
        name: name.trim(),
        description: description.trim() || null,
        group_type: groupType,
        is_public: isPublic,
        requires_approval: requiresApproval,
        max_members: maxMembers ? parseInt(maxMembers) : null,
        location: location.trim() || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });

      if (result.success) {
        Alert.alert('Success', 'Group created successfully!');
        onClose();
        resetForm();
      } else {
        Alert.alert('Error', result.error || 'Failed to create group');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setGroupType('coop');
    setIsPublic(false);
    setRequiresApproval(true);
    setMaxMembers('');
    setLocation('');
    setTags('');
  };

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Group</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.field}>
              <Text style={styles.label}>Group Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Math Co-op 2025"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe your group..."
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Group Type</Text>
              <View style={styles.typeOptions}>
                {['coop', 'pod', 'class', 'club', 'study_group'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeOption, groupType === type && styles.typeOptionActive]}
                    onPress={() => setGroupType(type)}
                  >
                    <Text style={[styles.typeOptionText, groupType === type && styles.typeOptionTextActive]}>
                      {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="City, State"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Tags (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={tags}
                onChangeText={setTags}
                placeholder="math, algebra, co-op"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Max Members (optional)</Text>
              <TextInput
                style={styles.input}
                value={maxMembers}
                onChangeText={setMaxMembers}
                placeholder="Leave empty for unlimited"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.field}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setIsPublic(!isPublic)}
              >
                <View style={[styles.checkboxBox, isPublic && styles.checkboxBoxChecked]}>
                  {isPublic && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Make group public</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setRequiresApproval(!requiresApproval)}
              >
                <View style={[styles.checkboxBox, requiresApproval && styles.checkboxBoxChecked]}>
                  {requiresApproval && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Require approval to join</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.createButton, loading && styles.buttonDisabled]}
                onPress={handleCreate}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.createButtonText}>Create Group</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    padding: 20,
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
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  typeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  typeOptionActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  typeOptionText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  typeOptionTextActive: {
    color: '#ffffff',
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#111827',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  createButton: {
    backgroundColor: colors.indigo,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

