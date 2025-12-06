import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { X, Globe, Share2, Tag, Search, CheckCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { listLessonTemplates, shareTemplate } from '../../lib/services/templatesClient';
import { useToast } from '../Toast';
import TemplateCard from './TemplateCard';

export default function MarketplaceModal({
  isOpen,
  onClose,
  familyId,
  onTemplateSelected,
}) {
  const [marketplaceTemplates, setMarketplaceTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      loadMarketplaceTemplates();
    }
  }, [isOpen]);

  const loadMarketplaceTemplates = async () => {
    setLoading(true);
    try {
      // Load all templates and filter for marketplace/public ones
      const { data, error } = await listLessonTemplates({});
      if (error) throw error;
      
      // Filter for marketplace/public templates
      const marketplace = (data || []).filter(
        t => t.is_marketplace_template === true || t.is_public === true
      );
      
      setMarketplaceTemplates(marketplace);
    } catch (error) {
      console.error('Error loading marketplace templates:', error);
      toast.push('Failed to load marketplace templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const allTags = Array.from(
    new Set(
      marketplaceTemplates
        .flatMap(t => t.marketplace_tags || [])
        .filter(Boolean)
    )
  ).sort();

  const filteredTemplates = marketplaceTemplates.filter(template => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        template.title?.toLowerCase().includes(query) ||
        template.marketplace_description?.toLowerCase().includes(query) ||
        (template.marketplace_tags || []).some(tag => tag.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    if (selectedTags.length > 0) {
      const templateTags = template.marketplace_tags || [];
      const hasSelectedTag = selectedTags.some(tag => templateTags.includes(tag));
      if (!hasSelectedTag) return false;
    }

    return true;
  });

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Globe size={20} color={colors.accent} />
              <Text style={styles.title}>Template Marketplace</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchSection}>
            <View style={styles.searchContainer}>
              <Search size={16} color={colors.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search marketplace templates..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>

          {allTags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.tagsLabel}>Filter by tags:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScroll}>
                {allTags.map(tag => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.tagChip,
                        isSelected && styles.tagChipSelected
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedTags(selectedTags.filter(t => t !== tag));
                        } else {
                          setSelectedTags([...selectedTags, tag]);
                        }
                      }}
                    >
                      <Tag size={12} color={isSelected ? '#ffffff' : colors.muted} />
                      <Text style={[
                        styles.tagText,
                        isSelected && styles.tagTextSelected
                      ]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <ScrollView style={styles.templatesList}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : filteredTemplates.length === 0 ? (
              <View style={styles.emptyState}>
                <Globe size={48} color={colors.muted} />
                <Text style={styles.emptyText}>
                  {searchQuery || selectedTags.length > 0
                    ? 'No templates match your search'
                    : 'No marketplace templates available'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery || selectedTags.length > 0
                    ? 'Try adjusting your filters'
                    : 'Templates shared to the marketplace will appear here'}
                </Text>
              </View>
            ) : (
              filteredTemplates.map(template => (
                <View key={template.id} style={styles.templateWrapper}>
                  <TemplateCard
                    template={template}
                    onPreview={() => onTemplateSelected?.(template)}
                    onApply={() => onTemplateSelected?.(template)}
                  />
                  {template.marketplace_description && (
                    <Text style={styles.marketplaceDescription}>
                      {template.marketplace_description}
                    </Text>
                  )}
                </View>
              ))
            )}
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
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 800,
    maxHeight: '85%',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  searchSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  tagsSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tagsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagsScroll: {
    flexDirection: 'row',
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tagChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  tagTextSelected: {
    color: '#ffffff',
  },
  templatesList: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  templateWrapper: {
    marginBottom: 16,
  },
  marketplaceDescription: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
    paddingLeft: 4,
    fontStyle: 'italic',
  },
});

