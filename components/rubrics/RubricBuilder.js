/**
 * Rubric Builder Component
 * Create and edit rubrics with criteria
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Plus, X, Trash2, Save } from 'lucide-react';
import { createRubric, updateRubric } from '../../lib/services/gradebookClient';
import { colors } from '../../theme/colors';

export default function RubricBuilder({ familyId, rubric = null, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (rubric) {
      setTitle(rubric.title || '');
      setDescription(rubric.description || '');
      setCriteria(rubric.criteria || []);
    } else {
      // Start with one empty criterion
      setCriteria([{ name: '', description: '', max_points: 10, weight: 1 }]);
    }
  }, [rubric]);

  const addCriterion = () => {
    setCriteria([...criteria, { name: '', description: '', max_points: 10, weight: 1 }]);
  };

  const removeCriterion = (index) => {
    if (criteria.length > 1) {
      setCriteria(criteria.filter((_, i) => i !== index));
    } else {
      Alert.alert('Cannot Remove', 'A rubric must have at least one criterion.');
    }
  };

  const updateCriterion = (index, field, value) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };
    setCriteria(updated);
  };

  const calculateTotalPoints = () => {
    return criteria.reduce((sum, c) => sum + (parseFloat(c.max_points) || 0), 0);
  };

  const validateRubric = () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a rubric title.');
      return false;
    }

    if (criteria.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one criterion.');
      return false;
    }

    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      if (!c.name || !c.name.trim()) {
        Alert.alert('Validation Error', `Please enter a name for criterion ${i + 1}.`);
        return false;
      }
      if (!c.max_points || parseFloat(c.max_points) <= 0) {
        Alert.alert('Validation Error', `Please enter valid points for criterion ${i + 1}.`);
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateRubric()) return;

    setLoading(true);
    try {
      const rubricData = {
        family_id: familyId,
        title: title.trim(),
        description: description.trim() || null,
        criteria: criteria.map((c, index) => ({
          id: `criterion_${index}`,
          name: c.name.trim(),
          description: c.description.trim() || '',
          max_points: parseFloat(c.max_points) || 0,
          weight: parseFloat(c.weight) || 1,
        })),
        total_points: calculateTotalPoints(),
      };

      let result;
      if (rubric?.id) {
        const apiResult = await updateRubric(rubric.id, {
          title: rubricData.title,
          description: rubricData.description,
          criteria: rubricData.criteria,
          total_points: rubricData.total_points,
        });
        result = apiResult?.data || apiResult;
      } else {
        const apiResult = await createRubric({
          title: rubricData.title,
          description: rubricData.description,
          criteria: rubricData.criteria,
          total_points: rubricData.total_points,
        });
        result = apiResult?.data || apiResult;
      }

      if (!result?.id) {
        throw new Error('Rubric save failed');
      }

      if (onSave) {
        onSave(result);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save rubric. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{rubric ? 'Edit Rubric' : 'Create Rubric'}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={styles.field}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., Essay Rubric"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description of the rubric"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Criteria */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Criteria</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={addCriterion}
            >
              <Plus size={18} color={colors.white} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {criteria.map((criterion, index) => (
            <View key={index} style={styles.criterionCard}>
              <View style={styles.criterionHeader}>
                <Text style={styles.criterionNumber}>Criterion {index + 1}</Text>
                {criteria.length > 1 && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => removeCriterion(index)}
                  >
                    <Trash2 size={16} color={colors.redBold} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={criterion.name}
                  onChangeText={(text) => updateCriterion(index, 'name', text)}
                  placeholder="e.g., Content, Grammar, Organization"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={criterion.description}
                  onChangeText={(text) => updateCriterion(index, 'description', text)}
                  placeholder="Describe what this criterion evaluates"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.criterionRow}>
                <View style={[styles.field, styles.halfField]}>
                  <Text style={styles.label}>Max Points *</Text>
                  <TextInput
                    style={styles.input}
                    value={criterion.max_points?.toString() || ''}
                    onChangeText={(text) => updateCriterion(index, 'max_points', text)}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                <View style={[styles.field, styles.halfField]}>
                  <Text style={styles.label}>Weight</Text>
                  <TextInput
                    style={styles.input}
                    value={criterion.weight?.toString() || '1'}
                    onChangeText={(text) => updateCriterion(index, 'weight', text)}
                    keyboardType="numeric"
                    placeholder="1"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            </View>
          ))}

          <View style={styles.totalPoints}>
            <Text style={styles.totalPointsLabel}>Total Points:</Text>
            <Text style={styles.totalPointsValue}>{calculateTotalPoints()}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          disabled={loading}
        >
          <X size={18} color={colors.text} />
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.saveButton, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Save size={18} color={colors.white} />
              <Text style={styles.saveButtonText}>Save Rubric</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  textArea: {
    minHeight: 80,
  },
  criterionCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  criterionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  criterionNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deleteButton: {
    padding: 4,
  },
  criterionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.indigo,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  totalPoints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    marginTop: 8,
  },
  totalPointsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  totalPointsValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.indigo,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.indigo,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

