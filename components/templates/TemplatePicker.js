import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { ChevronDown, X } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';
import { listLessonTemplates } from '../../lib/services/templatesClientWithOffline';

/**
 * TemplatePicker Component
 * Dropdown to select and apply lesson templates
 */
export default function TemplatePicker({
  subjectId,
  onSelect,
  familyId,
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  useEffect(() => {
    if (familyId) {
      loadTemplates();
    } else {
      console.warn('[TemplatePicker] No familyId provided');
      setTemplates([]);
    }
  }, [familyId, subjectId]);

  const loadTemplates = async () => {
    if (!familyId) {
      console.warn('[TemplatePicker] Cannot load templates: familyId is missing');
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await listLessonTemplates({
        subjectId: subjectId,
        familyId: familyId,
      });
      
      if (error) {
        console.error('[TemplatePicker] Error loading templates:', error);
        setTemplates([]);
        return;
      }
      
      console.log('[TemplatePicker] Loaded templates:', data?.length || 0);
      setTemplates(data || []);
    } catch (error) {
      console.error('[TemplatePicker] Exception loading templates:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (template) => {
    setSelectedTemplate(template);
    setShowDropdown(false);
    if (onSelect) {
      onSelect(template);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.picker}
        onPress={() => setShowDropdown(true)}
      >
        <Text style={styles.pickerText}>
          {selectedTemplate ? selectedTemplate.title : 'Select Template'}
        </Text>
        <ChevronDown size={16} color={colors.muted} />
      </TouchableOpacity>

      <Modal
        visible={showDropdown}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDropdown(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Template</Text>
              <TouchableOpacity onPress={() => setShowDropdown(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <ScrollView style={styles.templatesList}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading templates...</Text>
                  </View>
                ) : templates.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No templates available</Text>
                    <Text style={styles.emptySubtext}>
                      {familyId ? 'Create a template by editing a lesson and clicking "Save as Template"' : 'Family ID missing'}
                    </Text>
                  </View>
                ) : (
                  templates.map(template => (
                    <TouchableOpacity
                      key={template.id}
                      style={styles.templateItem}
                      onPress={() => handleSelect(template)}
                    >
                      <Text style={styles.templateTitle}>{template.title}</Text>
                      {template.default_duration && (
                        <Text style={styles.templateDuration}>
                          {template.default_duration} min
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerText: {
    fontSize: 14,
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '90%',
    maxWidth: 500,
    maxHeight: '70%',
    ...shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
  },
  templatesList: {
    padding: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  templateItem: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  templateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  templateDuration: {
    fontSize: 12,
    color: colors.muted,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 40,
  },
});

