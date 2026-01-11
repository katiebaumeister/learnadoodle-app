import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { X, Search, Check } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

/**
 * StandardsSearchModal Component
 * Modal for searching and selecting standards to attach to lessons
 */
export default function StandardsSearchModal({
  visible,
  onClose,
  onSelect,
  subjectId = null,
  initialSelected = [],
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStandards, setSelectedStandards] = useState(initialSelected);
  const [gradeLevel, setGradeLevel] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedStandards(initialSelected);
      loadStandards();
    }
  }, [visible, subjectId]);

  const loadStandards = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (subjectId) params.append('subject_id', subjectId);
      if (gradeLevel) params.append('grade_level', gradeLevel);
      
      const { data, error } = await apiRequest(`/api/standards/search?${params.toString()}`);
      
      if (error) throw error;
      setStandards(data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (visible) {
        loadStandards();
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, gradeLevel]);

  const toggleStandard = (standard) => {
    setSelectedStandards(prev => {
      const exists = prev.find(s => s.id === standard.id);
      if (exists) {
        return prev.filter(s => s.id !== standard.id);
      } else {
        return [...prev, standard];
      }
    });
  };

  const handleConfirm = () => {
    // Allow accepting even with 0 selected (to clear standards)
    onSelect(selectedStandards);
    onClose();
  };

  const isSelected = (standardId) => {
    return selectedStandards.some(s => s.id === standardId);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { height: Platform.OS === 'web' ? 'auto' : undefined }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Attach Standards</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Search size={18} color={colors.muted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search standards..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* Filters */}
          <View style={styles.filters}>
            <TextInput
              style={styles.filterInput}
              placeholder="Grade level (optional)"
              value={gradeLevel}
              onChangeText={setGradeLevel}
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* Results - Scrollable area */}
          <View style={styles.resultsContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <ScrollView 
                style={styles.results} 
                contentContainerStyle={styles.resultsContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                {standards.length === 0 ? (
                  <Text style={styles.emptyText}>No standards found</Text>
                ) : (
                  standards.map(standard => (
                    <TouchableOpacity
                      key={standard.id}
                      style={[
                        styles.standardItem,
                        isSelected(standard.id) && styles.standardItemSelected
                      ]}
                      onPress={() => toggleStandard(standard)}
                    >
                      <View style={styles.standardContent}>
                      <Text style={styles.standardCode}>
                        {standard.standard_code || standard.code || 'N/A'}
                      </Text>
                      <Text style={styles.standardDescription} numberOfLines={2}>
                        {standard.standard_text || standard.description || ''}
                      </Text>
                      </View>
                      {isSelected(standard.id) && (
                        <Check size={20} color={colors.greenBold} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>

          {/* Footer - Fixed at bottom, always visible */}
          <View style={styles.footer}>
            <Text style={styles.selectedCount}>
              {selectedStandards.length} selected
            </Text>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmButtonText}>
                {selectedStandards.length === 0 ? 'Clear' : 'Attach'}
              </Text>
            </TouchableOpacity>
          </View>
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
  },
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '90%',
    maxWidth: 600,
    maxHeight: Platform.OS === 'web' ? '85vh' : '85%',
    flexDirection: 'column',
    overflow: 'hidden',
    ...shadows.large,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  filters: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterInput: {
    padding: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  resultsContainer: {
    flex: 1,
    minHeight: 150,
    maxHeight: 280,
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
    }),
  },
  results: {
    flex: 1,
  },
  resultsContent: {
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 40,
  },
  standardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standardItemSelected: {
    borderColor: colors.greenBold,
    backgroundColor: colors.greenSoft,
  },
  standardContent: {
    flex: 1,
  },
  standardCode: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  standardDescription: {
    fontSize: 12,
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    zIndex: 10,
    flexShrink: 0,
    minHeight: 60,
  },
  selectedCount: {
    fontSize: 14,
    color: colors.muted,
  },
  confirmButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.accent || '#8B7CF6',
    borderRadius: 8,
    minWidth: 100,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.5,
  },
  confirmButtonText: {
    color: colors.accentContrast || '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButtonTextDisabled: {
    color: '#ffffff',
    opacity: 0.7,
  },
});

