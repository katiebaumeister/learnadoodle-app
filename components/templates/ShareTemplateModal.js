import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { X, Globe, Tag, Share2, AlertCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { shareTemplate } from '../../lib/services/templatesClient';
import { useToast } from '../Toast';

export default function ShareTemplateModal({
  isOpen,
  onClose,
  template,
  familyId,
  onShared,
}) {
  const [sharing, setSharing] = useState(false);
  const [marketplaceDescription, setMarketplaceDescription] = useState('');
  const [marketplaceTags, setMarketplaceTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const toast = useToast();

  const handleShare = async () => {
    if (!template?.id) {
      toast.push('No template selected', 'error');
      return;
    }

    if (!marketplaceDescription.trim()) {
      toast.push('Please provide a description for the marketplace', 'error');
      return;
    }

    setSharing(true);
    try {
      const { data, error } = await shareTemplate(template.id, {
        marketplace_description: marketplaceDescription.trim(),
        marketplace_tags: marketplaceTags,
      });

      if (error) throw error;

      toast.push('Template shared to marketplace successfully!', 'success');
      onShared?.(data);
      onClose();
      // Reset form
      setMarketplaceDescription('');
      setMarketplaceTags([]);
      setTagInput('');
    } catch (error) {
      toast.push('Failed to share template to marketplace', 'error');
    } finally {
      setSharing(false);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !marketplaceTags.includes(tag)) {
      setMarketplaceTags([...marketplaceTags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setMarketplaceTags(marketplaceTags.filter(t => t !== tagToRemove));
  };

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
              <Share2 size={20} color={colors.accent} />
              <Text style={styles.title}>Share to Marketplace</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {template && (
            <View style={styles.templateInfo}>
              <Text style={styles.templateName}>{template.title || template.template_name}</Text>
              <Text style={styles.templateSubtext}>
                Make this template available to other families
              </Text>
            </View>
          )}

          <ScrollView style={styles.content}>
            <View style={styles.infoBox}>
              <AlertCircle size={16} color={colors.accent} />
              <Text style={styles.infoText}>
                Sharing a template makes it visible to all users in the marketplace. 
                Make sure your template is complete and ready for others to use.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Marketplace Description <Text style={styles.required}>*</Text>
              </Text>
              <Text style={styles.hint}>
                Describe what this template is for and how others can use it
              </Text>
              <TextInput
                style={styles.textArea}
                placeholder="e.g., A comprehensive math lesson template for fractions, suitable for grades 3-5..."
                value={marketplaceDescription}
                onChangeText={setMarketplaceDescription}
                multiline
                numberOfLines={4}
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Tags</Text>
              <Text style={styles.hint}>
                Add tags to help others find your template (e.g., "math", "fractions", "elementary")
              </Text>
              <View style={styles.tagInputContainer}>
                <TextInput
                  style={styles.tagInput}
                  placeholder="Type a tag and press Enter"
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={handleAddTag}
                  placeholderTextColor={colors.muted}
                />
                <TouchableOpacity
                  style={styles.addTagButton}
                  onPress={handleAddTag}
                >
                  <Tag size={16} color={colors.accent} />
                </TouchableOpacity>
              </View>
              {marketplaceTags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {marketplaceTags.map((tag, idx) => (
                    <View key={idx} style={styles.tagChip}>
                      <Text style={styles.tagText}>{tag}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveTag(tag)}
                        style={styles.removeTagButton}
                      >
                        <X size={12} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shareButton, sharing && styles.shareButtonDisabled]}
              onPress={handleShare}
              disabled={sharing || !marketplaceDescription.trim()}
            >
              {sharing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Globe size={16} color="#ffffff" />
                  <Text style={styles.shareButtonText}>Share to Marketplace</Text>
                </>
              )}
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
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 600,
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
  templateInfo: {
    padding: 16,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  templateSubtext: {
    fontSize: 14,
    color: colors.muted,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  required: {
    color: '#ef4444',
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  tagInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  tagInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  addTagButton: {
    padding: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3730a3',
  },
  removeTagButton: {
    padding: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  shareButtonDisabled: {
    opacity: 0.5,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

