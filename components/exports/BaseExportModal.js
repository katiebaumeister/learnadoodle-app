/**
 * Base Export Modal Component
 * Reusable modal for export operations
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';

export default function BaseExportModal({
  isOpen,
  onClose,
  onComplete,
  title,
  description,
  familyId,
  children = [],
  defaultChildId = null,
  dateFields = [],
  options = [],
  onExport,
  requiresDateRange = false,
  requiresChild = true,
}) {
  const [selectedChildId, setSelectedChildId] = useState(defaultChildId || (children.length > 0 ? children[0].id : null));
  const [dates, setDates] = useState({});
  const [selectedOptions, setSelectedOptions] = useState({});
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (requiresChild && !selectedChildId) {
      Alert.alert('Error', 'Please select a student');
      return;
    }

    if (requiresDateRange && (!dates.start || !dates.end)) {
      Alert.alert('Error', 'Please select a date range');
      return;
    }

    setIsExporting(true);
    try {
      const result = await onExport({
        childId: selectedChildId,
        dates,
        options: selectedOptions,
      });

      if (result.success) {
        Alert.alert('Success', 'Export completed successfully');
        onComplete();
      } else {
        Alert.alert('Error', result.error || 'Export failed');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const updateDate = (field, value) => {
    setDates(prev => ({ ...prev, [field]: value }));
  };

  const updateOption = (key, value) => {
    setSelectedOptions(prev => ({ ...prev, [key]: value }));
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
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {description && (
              <Text style={styles.description}>{description}</Text>
            )}

            {requiresChild && children.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>Student</Text>
                {Platform.OS === 'web' ? (
                  <select
                    value={selectedChildId || ''}
                    onChange={(e) => setSelectedChildId(e.target.value)}
                    style={styles.webSelect}
                  >
                    {children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.first_name || 'Student'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <View style={styles.pickerContainer}>
                    <Text style={styles.pickerText}>
                      {children.find(c => c.id === selectedChildId)?.first_name || 'Select student'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {dateFields.map((field) => (
              <View key={field.key} style={styles.field}>
                <Text style={styles.label}>{field.label}</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={dates[field.key] ? dates[field.key].toISOString().split('T')[0] : ''}
                    onChange={(e) => updateDate(field.key, new Date(e.target.value))}
                    style={styles.webDateInput}
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => {
                      // For native, would need a date picker library
                      Alert.alert('Date Picker', 'Please use web version for date selection');
                    }}
                  >
                    <Text style={styles.dateText}>
                      {dates[field.key] ? dates[field.key].toLocaleDateString() : 'Select date'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {options.map((option) => (
              <View key={option.key} style={styles.field}>
                <Text style={styles.label}>{option.label}</Text>
                {option.type === 'boolean' ? (
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => updateOption(option.key, !selectedOptions[option.key])}
                  >
                    <Text style={styles.checkboxText}>
                      {selectedOptions[option.key] ? '✓' : '○'} {option.label}
                    </Text>
                  </TouchableOpacity>
                ) : option.type === 'select' ? (
                  Platform.OS === 'web' ? (
                    <select
                      value={selectedOptions[option.key] || option.defaultValue}
                      onChange={(e) => updateOption(option.key, e.target.value)}
                      style={styles.webSelect}
                    >
                      {option.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <View style={styles.pickerContainer}>
                      <Text style={styles.pickerText}>
                        {option.options.find(opt => opt.value === (selectedOptions[option.key] || option.defaultValue))?.label || 'Select'}
                      </Text>
                    </View>
                  )
                ) : null}
              </View>
            ))}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                disabled={isExporting}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.exportButton, isExporting && styles.exportButtonDisabled]}
                onPress={handleExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.exportButtonText}>Export</Text>
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
    maxWidth: 500,
    maxHeight: '90%',
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#6b7280',
    lineHeight: 28,
  },
  content: {
    padding: 20,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
    lineHeight: 20,
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
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  picker: {
    height: 50,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  dateText: {
    fontSize: 16,
    color: '#111827',
  },
  webSelect: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  pickerText: {
    fontSize: 16,
    color: '#111827',
    padding: 12,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  checkboxText: {
    fontSize: 16,
    color: '#111827',
    marginLeft: 8,
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
  exportButton: {
    backgroundColor: '#3b82f6',
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

