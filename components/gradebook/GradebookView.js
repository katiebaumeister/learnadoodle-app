/**
 * Gradebook View Component
 * Full gradebook UI with categories, weightings, and rubrics
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { Plus, Edit, Trash2, Calculator, FileText } from 'lucide-react';
import { 
  getCategories, 
  createCategory, 
  calculateGradebookGrade,
  getRubrics 
} from '../../lib/services/gradebookClient';
import { colors } from '../../theme/colors';

export default function GradebookView({ childId, subjectId = null, termLabel = null }) {
  const [categories, setCategories] = useState([]);
  const [rubrics, setRubrics] = useState([]);
  const [gradebookData, setGradebookData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', weight: 0.25 });

  useEffect(() => {
    loadData();
  }, [childId, subjectId, termLabel]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catsResult, rubricsResult, gradeResult] = await Promise.all([
        getCategories(childId, subjectId),
        getRubrics(),
        calculateGradebookGrade(childId, subjectId, termLabel),
      ]);
      
      // Handle apiRequest format: { data, error }
      const catsData = catsResult?.data || (catsResult?.error ? null : catsResult);
      const rubricsData = rubricsResult?.data || (rubricsResult?.error ? null : rubricsResult);
      const gradeData = gradeResult?.data || (gradeResult?.error ? null : gradeResult);
      
      // Ensure categories is always an array
      setCategories(Array.isArray(catsData) ? catsData : []);
      setRubrics(Array.isArray(rubricsData) ? rubricsData : []);
      setGradebookData(gradeData || {});
      
      // Log errors but don't crash
      if (catsResult?.error) {
        console.warn('Error loading categories:', catsResult.error);
      }
      if (rubricsResult?.error) {
        console.warn('Error loading rubrics:', rubricsResult.error);
      }
      if (gradeResult?.error) {
        console.warn('Error loading gradebook data:', gradeResult.error);
      }
    } catch (error) {
      console.error('Exception loading gradebook data:', error);
      // Set empty arrays on error to prevent crashes
      setCategories([]);
      setRubrics([]);
      setGradebookData({});
      // Don't show alert - just log and continue with empty state
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCategory = async () => {
    try {
      if (editingCategory) {
        // Update existing category
        // TODO: Add update endpoint
        Alert.alert('Info', 'Update functionality coming soon');
      } else {
        // Create new category
        await createCategory({
          child_id: childId,
          subject_id: subjectId,
          name: categoryForm.name,
          weight: parseFloat(categoryForm.weight),
        });
        setShowCategoryModal(false);
        setCategoryForm({ name: '', weight: 0.25 });
        loadData();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save category');
    }
  };

  // Calculate total weight safely
  const totalWeight = Array.isArray(categories) 
    ? categories.reduce((sum, cat) => sum + (cat.weight || 0), 0)
    : 0;
  const finalGrade = gradebookData?.final_grade;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading gradebook...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Gradebook</Text>
          {finalGrade !== null && finalGrade !== undefined && (
            <Text style={styles.finalGrade}>Final Grade: {finalGrade.toFixed(1)}%</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setEditingCategory(null);
            setCategoryForm({ name: '', weight: 0.25 });
            setShowCategoryModal(true);
          }}
        >
          <Plus size={20} color={colors.card} />
          <Text style={styles.addButtonText}>Category</Text>
        </TouchableOpacity>
      </View>

      {/* Weight Warning */}
      {totalWeight > 1 && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            Total weight exceeds 100%. Current: {(totalWeight * 100).toFixed(1)}%
          </Text>
        </View>
      )}

      {/* Categories */}
      <ScrollView style={styles.content}>
        {categories.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={48} color={colors.muted} />
            <Text style={styles.emptyText}>No categories yet</Text>
            <Text style={styles.emptySubtext}>Add a category to start organizing grades</Text>
          </View>
        ) : (
          categories.map((category) => {
            const categoryData = gradebookData?.categories?.find(
              c => c.category_id === category.id
            ) || {};
            const avgScore = categoryData.average_score || 0;
            const gradeCount = categoryData.grade_count || 0;

            return (
              <View key={category.id} style={styles.categoryCard}>
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryWeight}>
                      Weight: {(category.weight * 100).toFixed(0)}%
                    </Text>
                  </View>
                  <View style={styles.categoryActions}>
                    <Text style={styles.categoryGrade}>
                      {avgScore > 0 ? `${avgScore.toFixed(1)}%` : '—'}
                    </Text>
                    <Text style={styles.categoryCount}>
                      {gradeCount} grade{gradeCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                {avgScore > 0 && (
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { width: `${Math.min(avgScore, 100)}%` }
                      ]} 
                    />
                  </View>
                )}

                {/* Weighted Contribution */}
                {avgScore > 0 && (
                  <Text style={styles.weightedContribution}>
                    Weighted: {(avgScore * category.weight).toFixed(1)}%
                  </Text>
                )}
              </View>
            );
          })
        )}

        {/* Calculation Summary */}
        {gradebookData && gradebookData.categories && gradebookData.categories.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Calculation Summary</Text>
            {gradebookData.categories.map((cat) => (
              <View key={cat.category_id} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{cat.name}</Text>
                <Text style={styles.summaryValue}>
                  {cat.average_score.toFixed(1)}% × {(cat.weight * 100).toFixed(0)}% = {(cat.average_score * cat.weight).toFixed(1)}%
                </Text>
              </View>
            ))}
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>Final Grade</Text>
              <Text style={styles.summaryTotalValue}>
                {finalGrade !== null && finalGrade !== undefined ? `${finalGrade.toFixed(1)}%` : '—'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Category Modal */}
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCategory ? 'Edit Category' : 'New Category'}
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Category Name</Text>
              <TextInput
                style={styles.input}
                value={categoryForm.name}
                onChangeText={(text) => setCategoryForm({ ...categoryForm, name: text })}
                placeholder="e.g., Tests, Homework, Projects"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Weight (0-1)</Text>
              <TextInput
                style={styles.input}
                value={categoryForm.weight.toString()}
                onChangeText={(text) => {
                  const num = parseFloat(text) || 0;
                  setCategoryForm({ ...categoryForm, weight: Math.max(0, Math.min(1, num)) });
                }}
                keyboardType="numeric"
                placeholder="0.25"
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.helperText}>
                {(categoryForm.weight * 100).toFixed(0)}% of total grade
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowCategoryModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveCategory}
                disabled={!categoryForm.name.trim()}
              >
                <Text style={styles.saveButtonText}>Save</Text>
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
    backgroundColor: colors.bg,
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
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  finalGrade: {
    fontSize: 16,
    color: colors.muted,
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: colors.card,
    fontWeight: '600',
    fontSize: 14,
  },
  warning: {
    backgroundColor: colors.orangeSoft,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  warningText: {
    color: colors.orangeBold,
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  categoryCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  categoryWeight: {
    fontSize: 12,
    color: colors.muted,
  },
  categoryActions: {
    alignItems: 'flex-end',
  },
  categoryGrade: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  categoryCount: {
    fontSize: 12,
    color: colors.muted,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.greenBold,
    borderRadius: 4,
  },
  weightedContribution: {
    fontSize: 12,
    color: colors.muted,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  summaryValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  summaryTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bgSubtle,
  },
  helperText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.bgSubtle,
  },
  cancelButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.text,
  },
  saveButtonText: {
    color: colors.card,
    fontWeight: '600',
  },
});

