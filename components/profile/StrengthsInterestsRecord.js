import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Platform } from 'react-native';
import { Plus, Edit, Sparkles, Heart, X, Save, Trash2 } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { supabase } from '../../lib/supabase';
import GeistCard from '../GeistCard';

export default function StrengthsInterestsRecord({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [strengths, setStrengths] = useState([]);
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null); // 'strength' or 'interest'
  const [editingIndex, setEditingIndex] = useState(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    loadStrengthsAndInterests();
  }, [childId]);

  const loadStrengthsAndInterests = async () => {
    try {
      setLoading(true);
      const { data: childData, error } = await supabase
        .from('children')
        .select('strengths, interests')
        .eq('id', childId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (childData) {
        setStrengths(Array.isArray(childData.strengths) ? childData.strengths : []);
        setInterests(Array.isArray(childData.interests) ? childData.interests : []);
      } else {
        setStrengths([]);
        setInterests([]);
      }
    } catch (error) {
      console.error('Error loading strengths/interests:', error);
      setStrengths([]);
      setInterests([]);
    } finally {
      setLoading(false);
    }
  };

  const saveToDatabase = async (newStrengths, newInterests) => {
    try {
      const { error } = await supabase
        .from('children')
        .update({
          strengths: newStrengths,
          interests: newInterests,
        })
        .eq('id', childId);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving strengths/interests:', error);
      throw error;
    }
  };

  const handleAdd = (type) => {
    setEditingType(type);
    setEditingIndex(null);
    setInputValue('');
    setShowModal(true);
  };

  const handleEdit = (type, index, value) => {
    setEditingType(type);
    setEditingIndex(index);
    setInputValue(value);
    setShowModal(true);
  };

  const handleDelete = async (type, index) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete this ${type}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (type === 'strength') {
                const newStrengths = strengths.filter((_, i) => i !== index);
                setStrengths(newStrengths);
                await saveToDatabase(newStrengths, interests);
              } else {
                const newInterests = interests.filter((_, i) => i !== index);
                setInterests(newInterests);
                await saveToDatabase(strengths, newInterests);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete. Please try again.');
              await loadStrengthsAndInterests();
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!inputValue.trim()) {
      Alert.alert('Error', 'Please enter a value');
      return;
    }

    try {
      if (editingType === 'strength') {
        const newStrengths = editingIndex !== null
          ? strengths.map((s, i) => i === editingIndex ? inputValue.trim() : s)
          : [...strengths, inputValue.trim()];
        setStrengths(newStrengths);
        await saveToDatabase(newStrengths, interests);
      } else {
        const newInterests = editingIndex !== null
          ? interests.map((i, idx) => idx === editingIndex ? inputValue.trim() : i)
          : [...interests, inputValue.trim()];
        setInterests(newInterests);
        await saveToDatabase(strengths, newInterests);
      }

      setShowModal(false);
      setEditingType(null);
      setEditingIndex(null);
      setInputValue('');
    } catch (error) {
      Alert.alert('Error', 'Failed to save. Please try again.');
      await loadStrengthsAndInterests();
    }
  };

  return (
    <View style={styles.container}>
      {/* Strengths Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Sparkles size={20} color={tokens.accent} />
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>Strengths</Text>
          </View>
          <TouchableOpacity
            style={[styles.addButton, { borderColor: tokens.border }]}
            onPress={() => handleAdd('strength')}
          >
            <Plus size={14} color={tokens.iconMuted} />
          </TouchableOpacity>
        </View>
        
        {loading ? (
          <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading...</Text>
        ) : strengths.length === 0 ? (
          <GeistCard variant="small">
            <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
              No strengths recorded yet. Click the + button to add one.
            </Text>
          </GeistCard>
        ) : (
          <View style={styles.tagsContainer}>
            {strengths.map((strength, idx) => (
              <GeistCard key={idx} variant="small" hoverable style={styles.tag}>
                <Text style={[styles.tagText, { color: tokens.text }]}>{strength}</Text>
                <View style={styles.tagActions}>
                  <TouchableOpacity onPress={() => handleEdit('strength', idx, strength)}>
                    <Edit size={14} color={tokens.iconMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete('strength', idx)}>
                    <Trash2 size={14} color={tokens.iconMuted} />
                  </TouchableOpacity>
                </View>
              </GeistCard>
            ))}
          </View>
        )}
      </View>

      {/* Interests Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Heart size={20} color={tokens.accent} />
            <Text style={[styles.sectionTitle, { color: tokens.text }]}>Interests</Text>
          </View>
          <TouchableOpacity
            style={[styles.addButton, { borderColor: tokens.border }]}
            onPress={() => handleAdd('interest')}
          >
            <Plus size={14} color={tokens.iconMuted} />
          </TouchableOpacity>
        </View>
        
        {loading ? (
          <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading...</Text>
        ) : interests.length === 0 ? (
          <GeistCard variant="small">
            <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
              No interests recorded yet. Click the + button to add one.
            </Text>
          </GeistCard>
        ) : (
          <View style={styles.tagsContainer}>
            {interests.map((interest, idx) => (
              <GeistCard key={idx} variant="small" hoverable style={styles.tag}>
                <Text style={[styles.tagText, { color: tokens.text }]}>{interest}</Text>
                <View style={styles.tagActions}>
                  <TouchableOpacity onPress={() => handleEdit('interest', idx, interest)}>
                    <Edit size={14} color={tokens.iconMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete('interest', idx)}>
                    <Trash2 size={14} color={tokens.iconMuted} />
                  </TouchableOpacity>
                </View>
              </GeistCard>
            ))}
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
          setEditingType(null);
          setEditingIndex(null);
          setInputValue('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: tokens.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.text }]}>
                {editingIndex !== null ? 'Edit' : 'Add'} {editingType === 'strength' ? 'Strength' : 'Interest'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setEditingType(null);
                  setEditingIndex(null);
                  setInputValue('');
                }}
              >
                <X size={20} color={tokens.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>
                  {editingType === 'strength' ? 'Strength' : 'Interest'} *
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder={`e.g., ${editingType === 'strength' ? 'Problem-solving, Creative thinking' : 'Robotics, Art, Music'}`}
                  value={inputValue}
                  onChangeText={setInputValue}
                  autoFocus
                />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: tokens.border }]}
                onPress={() => {
                  setShowModal(false);
                  setEditingType(null);
                  setEditingIndex(null);
                  setInputValue('');
                }}
              >
                <Text style={[styles.cancelButtonText, { color: tokens.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: tokens.accent }]}
                onPress={handleSave}
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
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  tagActions: {
    flexDirection: 'row',
    gap: spacing.xs,
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
    maxWidth: 500,
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
  },
  modalBody: {
    padding: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
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
  },
});
