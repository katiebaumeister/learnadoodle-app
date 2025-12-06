/**
 * Add Material Modal
 * Form for adding a new material to the library
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { createMaterial } from '../../lib/services/materialsClient';

const TYPE_OPTIONS = [
  { value: 'textbook', label: 'Textbook' },
  { value: 'workbook', label: 'Workbook' },
  { value: 'kit', label: 'Kit' },
  { value: 'course', label: 'Course' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'video', label: 'Video' },
  { value: 'other', label: 'Other' },
];

export default function AddMaterialModal({
  visible,
  onClose,
  onSaved,
  familyId,
}) {
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [type, setType] = useState('');
  const [subjectKey, setSubjectKey] = useState('');
  const [gradeRangeMin, setGradeRangeMin] = useState('');
  const [gradeRangeMax, setGradeRangeMax] = useState('');
  const [isConsumable, setIsConsumable] = useState(false);
  const [isSubscription, setIsSubscription] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(null);
  const [purchasePrice, setPurchasePrice] = useState('');
  
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      // Reset form when modal opens
      setTitle('');
      setType('');
      setSubjectKey('');
      setGradeRangeMin('');
      setGradeRangeMax('');
      setIsConsumable(false);
      setIsSubscription(false);
      setProviderName('');
      setProviderUrl('');
      setPurchaseDate(null);
      setPurchasePrice('');
    }
  }, [visible]);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }
    if (!type) {
      alert('Please select a type');
      return;
    }
    if (!familyId) {
      alert('Missing family ID');
      return;
    }

    setLoading(true);
    try {
      // Get current user for created_by
      const { data: { user } } = await supabase.auth.getUser();

      const materialData = {
        family_id: familyId,
        title: title.trim(),
        type,
        subject_key: subjectKey.trim() || null,
        grade_range_min: gradeRangeMin ? parseInt(gradeRangeMin) : null,
        grade_range_max: gradeRangeMax ? parseInt(gradeRangeMax) : null,
        is_consumable: isConsumable,
        is_subscription: isSubscription,
        provider_name: providerName.trim() || null,
        provider_url: providerUrl.trim() || null,
        purchase_date: purchaseDate ? purchaseDate.toISOString().split('T')[0] : null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        created_by: user?.id || null,
      };

      await createMaterial(materialData);

      if (onSaved) {
        onSaved();
      }
      onClose();
    } catch (error) {
      console.error('Error saving material:', error);
      alert(`Failed to save material: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Material</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Title - Required */}
            <View style={styles.section}>
              <Text style={styles.label}>
                Title <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., Biology Textbook, Grade 4"
                placeholderTextColor={colors.muted}
              />
            </View>

            {/* Type - Required */}
            <View style={styles.section}>
              <Text style={styles.label}>
                Type <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.typeContainer}>
                {TYPE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.typeButton,
                      type === opt.value && styles.typeButtonActive
                    ]}
                    onPress={() => setType(opt.value)}
                  >
                    <Text style={[
                      styles.typeButtonText,
                      type === opt.value && styles.typeButtonTextActive
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Subject */}
            <View style={styles.section}>
              <Text style={styles.label}>Subject</Text>
              <TextInput
                style={styles.input}
                value={subjectKey}
                onChangeText={setSubjectKey}
                placeholder="e.g., math.algebra, science.biology"
                placeholderTextColor={colors.muted}
              />
            </View>

            {/* Grade Range */}
            <View style={styles.section}>
              <Text style={styles.label}>Grade Range</Text>
              <View style={styles.gradeRangeContainer}>
                <TextInput
                  style={[styles.input, styles.gradeInput]}
                  value={gradeRangeMin}
                  onChangeText={setGradeRangeMin}
                  placeholder="Min"
                  keyboardType="numeric"
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.gradeRangeSeparator}>to</Text>
                <TextInput
                  style={[styles.input, styles.gradeInput]}
                  value={gradeRangeMax}
                  onChangeText={setGradeRangeMax}
                  placeholder="Max"
                  keyboardType="numeric"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            {/* Checkboxes */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setIsConsumable(!isConsumable)}
              >
                <View style={[styles.checkbox, isConsumable && styles.checkboxChecked]}>
                  {isConsumable && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Consumable (one-time use)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setIsSubscription(!isSubscription)}
              >
                <View style={[styles.checkbox, isSubscription && styles.checkboxChecked]}>
                  {isSubscription && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Subscription</Text>
              </TouchableOpacity>
            </View>

            {/* Provider Info */}
            <View style={styles.section}>
              <Text style={styles.label}>Provider</Text>
              <TextInput
                style={styles.input}
                value={providerName}
                onChangeText={setProviderName}
                placeholder="e.g., OpenStax, Khan Academy"
                placeholderTextColor={colors.muted}
              />
              <TextInput
                style={[styles.input, styles.inputMarginTop]}
                value={providerUrl}
                onChangeText={setProviderUrl}
                placeholder="Provider URL (optional)"
                placeholderTextColor={colors.muted}
                keyboardType="url"
                autoCapitalize="none"
              />
            </View>

            {/* Purchase Info */}
            <View style={styles.section}>
              <Text style={styles.label}>Purchase Information</Text>
              {Platform.OS === 'web' ? (
                <View style={styles.datePickerContainer}>
                  <DatePicker
                    selected={purchaseDate}
                    onChange={(date) => setPurchaseDate(date)}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select purchase date"
                    isClearable
                    className={styles.datePicker}
                  />
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={purchaseDate ? purchaseDate.toISOString().split('T')[0] : ''}
                  onChangeText={(text) => {
                    if (text) {
                      const date = new Date(text);
                      if (!isNaN(date.getTime())) {
                        setPurchaseDate(date);
                      }
                    } else {
                      setPurchaseDate(null);
                    }
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                />
              )}
              <TextInput
                style={[styles.input, styles.inputMarginTop]}
                value={purchasePrice}
                onChangeText={setPurchasePrice}
                placeholder="Price (e.g., 29.99)"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.muted}
              />
            </View>


            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Add Material</Text>
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
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  required: {
    color: '#ef4444',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#ffffff',
  },
  inputMarginTop: {
    marginTop: 8,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
  },
  typeButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  typeButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.accent,
    fontWeight: '500',
  },
  gradeRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gradeInput: {
    flex: 1,
  },
  gradeRangeSeparator: {
    fontSize: 14,
    color: colors.muted,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkmark: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
  },
  datePickerContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  datePicker: {
    width: '100%',
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
});

