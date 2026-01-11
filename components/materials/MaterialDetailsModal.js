/**
 * Material Details Modal
 * View-only modal showing material details with Edit and Delete buttons
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X, Trash2, Edit2, Calendar, DollarSign, MapPin, ExternalLink, FileText, UserCircle, Star, Tag, HardDrive, Type } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getMaterial } from '../../lib/services/materialsClient';
import { normalizeMaterial, normalizeUpload, roleLabel as getRoleLabel } from '../../lib/docs/roles';

const FG = '#111827';
const SUB = '#6b7280';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';

export default function MaterialDetailsModal({
  visible,
  onClose,
  material: initialMaterial,
  familyId,
  children = [],
  onEdit,
  onDelete,
}) {
  const [material, setMaterial] = useState(initialMaterial);
  const [loading, setLoading] = useState(!initialMaterial);
  const [showProviderInfo, setShowProviderInfo] = useState(true);
  const [showPurchaseInfo, setShowPurchaseInfo] = useState(true);
  const [showReviewInfo, setShowReviewInfo] = useState(true);

  useEffect(() => {
    if (visible && initialMaterial?.id) {
      // Always reload material to get fresh data including reviews
      loadMaterial();
      // Auto-expand sections when material loads
      setShowProviderInfo(true);
      setShowPurchaseInfo(true);
      setShowReviewInfo(true);
    } else if (visible && initialMaterial) {
      setMaterial(initialMaterial);
      setLoading(false);
      // Auto-expand sections when material loads
      setShowProviderInfo(true);
      setShowPurchaseInfo(true);
      setShowReviewInfo(true);
    }
  }, [visible, initialMaterial]);

  const loadMaterial = async () => {
    if (!initialMaterial?.id) return;
    
    setLoading(true);
    try {
      const freshMaterial = await getMaterial(initialMaterial.id);
      // Single review is now stored directly on material (review_* fields)
      // No need to check for duplicate reviews
      console.log('[MaterialDetailsModal] Loaded material with review fields:', {
        review_child_id: freshMaterial?.review_child_id,
        review_rating: freshMaterial?.review_rating,
        review_emotion: freshMaterial?.review_emotion,
        review_pacing_fit: freshMaterial?.review_pacing_fit,
        review_difficulty: freshMaterial?.review_difficulty,
        review_notes: freshMaterial?.review_notes,
        review_updated_at: freshMaterial?.review_updated_at,
      });
      setMaterial(freshMaterial);
    } catch (error) {
      console.error('[MaterialDetailsModal] Error loading material:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !material) return null;

  const isFileBased = material.storage_path;
  const normalized = isFileBased ? normalizeUpload(material) : normalizeMaterial(material);
  const materialChildren = material.material_children || [];
  const tags = material.tags || [];
  const roleTag = tags.find(t => t.startsWith('role:'));
  const role = roleTag ? roleTag.replace('role:', '') : null;

  // Get role label for display
  const roleDisplayName = role ? 
    role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 
    'Unknown';

  // Get children names
  const childNames = materialChildren
    .map(mc => {
      const child = children.find(c => c.id === mc.child_id);
      return child?.first_name || child?.name || 'Unknown';
    })
    .join(', ') || 'None';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Attachment Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.muted || 'rgba(15, 23, 42, 0.5)'} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>Loading material details...</Text>
              </View>
            ) : (
              <>
                {/* Basic Info */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Details</Text>
                  
                  {material.grade_range_min !== null && material.grade_range_max !== null && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Grade Range:</Text>
                      <Text style={styles.infoValue}>
                        {material.grade_range_min}-{material.grade_range_max}
                      </Text>
                    </View>
                  )}

                  {material.title && (
                    <View style={styles.infoRow}>
                      <Type size={16} color={colors.muted} />
                      <Text style={styles.infoLabel}>Title:</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>
                        {material.title}
                      </Text>
                    </View>
                  )}

                  {isFileBased && material.storage_path && (
                    <View style={styles.infoRow}>
                      <FileText size={16} color={colors.muted} />
                      <Text style={styles.infoLabel}>File:</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>
                        {material.filename || material.storage_path.split('/').pop() || 'Uploaded file'}
                      </Text>
                    </View>
                  )}

                  {(role || material.mime) && (
                    <View style={styles.infoRow}>
                      <Tag size={16} color={colors.muted} />
                      <Text style={styles.infoLabel}>Type:</Text>
                      <Text style={styles.infoValue}>
                        {(() => {
                          const roleName = role ? getRoleLabel(role) : null;
                          let fileType = null;
                          if (material.mime) {
                            if (material.mime.includes('pdf')) fileType = 'PDF';
                            else if (material.mime.includes('word') || material.mime.includes('document')) fileType = 'DOC';
                            else if (material.mime.startsWith('image/')) fileType = 'Image';
                            else if (material.mime.startsWith('video/')) fileType = 'Video';
                            else fileType = material.mime.split('/').pop().toUpperCase();
                          }
                          if (roleName && fileType) {
                            return `${roleName} (${fileType})`;
                          } else if (roleName) {
                            return roleName;
                          } else if (fileType) {
                            return fileType;
                          }
                          return 'Unknown';
                        })()}
                      </Text>
                    </View>
                  )}

                  {material.bytes && (
                    <View style={styles.infoRow}>
                      <HardDrive size={16} color={colors.muted} />
                      <Text style={styles.infoLabel}>Size:</Text>
                      <Text style={styles.infoValue}>
                        {(material.bytes / 1024).toFixed(1)} KB
                      </Text>
                    </View>
                  )}

                  {material.created_at && (
                    <View style={styles.infoRow}>
                      <Calendar size={16} color={colors.muted} />
                      <Text style={styles.infoLabel}>Created:</Text>
                      <Text style={styles.infoValue}>
                        {new Date(material.created_at).toLocaleDateString(undefined, {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Children */}
                {materialChildren.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Children</Text>
                    <View style={styles.tagsContainer}>
                      {materialChildren.map((mc) => {
                        const child = children.find(c => c.id === mc.child_id);
                        const childName = child?.first_name || child?.name || 'Unknown';
                        return (
                          <View key={mc.id || mc.child_id} style={styles.tagChip}>
                            <Text style={styles.tagText}>{childName}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Subjects */}
                {(material.subject_key || material.subject_id) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Subjects</Text>
                    <View style={styles.tagsContainer}>
                      {material.subject_key && (
                        <View style={styles.tagChip}>
                          <Text style={styles.tagText}>{material.subject_key}</Text>
                        </View>
                      )}
                      {/* If we have subject_id but no subject_key, we could look it up, but for now just show if we have the key */}
                    </View>
                  </View>
                )}

                {/* Metadata Sections */}
                <View style={styles.section}>
                  {/* Provider Information - Expandable */}
                  {(material.provider_name || material.provider_url) && (
                    <View style={styles.blockSection}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.expandableSectionTitle}>Provider Information</Text>
                      </View>
                      {showProviderInfo && (
                        <>
                          {material.provider_name && (
                            <View style={styles.infoRow}>
                              <Text style={styles.infoLabel}>Provider:</Text>
                              <Text style={styles.infoValue}>{material.provider_name}</Text>
                            </View>
                          )}
                          {material.provider_url && (
                            <View style={styles.infoRow}>
                              {material.provider_url.startsWith('http://') || material.provider_url.startsWith('https://') ? (
                                <TouchableOpacity
                                  style={styles.linkRow}
                                  onPress={() => {
                                    if (Platform.OS === 'web') {
                                      window.open(material.provider_url, '_blank');
                                    }
                                  }}
                                >
                                  <ExternalLink size={16} color={colors.accent} />
                                  <Text style={styles.linkText}>Visit Provider</Text>
                                </TouchableOpacity>
                              ) : (
                                <View style={styles.infoRow}>
                                  <Text style={styles.infoLabel}>URL:</Text>
                                  <Text style={styles.infoValue} numberOfLines={1}>{material.provider_url}</Text>
                                </View>
                              )}
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  )}

                  {/* Purchase Information - Expandable */}
                  {(material.purchase_date || material.purchase_price || material.is_subscription) && (
                    <View style={styles.blockSection}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.expandableSectionTitle}>Purchase Information</Text>
                      </View>
                      {showPurchaseInfo && (
                        <>
                          {material.is_subscription && (
                            <View style={styles.infoRow}>
                              <Text style={styles.infoLabel}>Subscription:</Text>
                              <Text style={styles.infoValue}>Yes</Text>
                            </View>
                          )}
                          {material.purchase_date && (
                            <View style={styles.infoRow}>
                              <Calendar size={16} color={colors.muted} />
                              <Text style={styles.infoValue}>
                                {new Date(material.purchase_date).toLocaleDateString()}
                              </Text>
                            </View>
                          )}
                          {material.purchase_price && (
                            <View style={styles.infoRow}>
                              <DollarSign size={16} color={colors.muted} />
                              <Text style={styles.infoValue}>
                                ${parseFloat(material.purchase_price).toFixed(2)}
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  )}

                  {/* Rate and Review Material - Expandable */}
                  {(material.review_child_id || material.review_rating || material.review_emotion || material.review_pacing_fit || material.review_difficulty || material.review_notes) && (
                    <View style={styles.blockSection}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.expandableSectionTitle}>Rate and Review Material</Text>
                      </View>
                      {showReviewInfo && (
                        <>
                          <View style={styles.reviewItem}>
                            {material.review_child_id && (
                              <View style={styles.infoRow}>
                                <UserCircle size={16} color={colors.muted} />
                                <Text style={styles.infoLabel}>Child:</Text>
                                <Text style={styles.infoValue}>
                                  {(() => {
                                    const reviewChild = children.find(c => c.id === material.review_child_id);
                                    return reviewChild?.first_name || reviewChild?.name || 'Unknown';
                                  })()}
                                </Text>
                              </View>
                            )}
                            {material.review_rating && (
                              <View style={styles.infoRow}>
                                <Star size={16} color="#fbbf24" fill="#fbbf24" />
                                <Text style={styles.infoValue}>
                                  {material.review_rating} / 5
                                </Text>
                              </View>
                            )}
                            {material.review_emotion && (
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Emotion:</Text>
                                <Text style={styles.infoValue}>
                                  {material.review_emotion.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                </Text>
                              </View>
                            )}
                            {material.review_pacing_fit && (
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Pacing:</Text>
                                <Text style={styles.infoValue}>
                                  {material.review_pacing_fit.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                </Text>
                              </View>
                            )}
                            {material.review_difficulty && (
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Difficulty:</Text>
                                <Text style={styles.infoValue}>
                                  {material.review_difficulty.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                </Text>
                              </View>
                            )}
                            {material.review_notes && (
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Notes:</Text>
                                <Text style={styles.infoValue}>{material.review_notes}</Text>
                              </View>
                            )}
                            {material.review_updated_at && (
                              <View style={styles.infoRow}>
                                <Calendar size={16} color={colors.muted} />
                                <Text style={styles.infoValue}>
                                  {new Date(material.review_updated_at).toLocaleDateString()}
                                </Text>
                              </View>
                            )}
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </View>

                {/* Location */}
                {material.location_hint && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Location</Text>
                    <View style={styles.infoRow}>
                      <MapPin size={16} color={colors.muted} />
                      <Text style={styles.infoValue}>{material.location_hint}</Text>
                    </View>
                  </View>
                )}

                {/* Notes */}
                {material.notes && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Notes</Text>
                    <Text style={styles.notesText}>{material.notes}</Text>
                  </View>
                )}

              </>
            )}
          </ScrollView>

          {/* Footer with Edit and Delete buttons */}
          {!loading && (
            <View style={styles.footer}>
              <TouchableOpacity onPress={() => {
                onEdit?.(material);
                onClose();
              }}>
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => {
                  onDelete?.(material);
                  onClose();
                }}
                style={styles.deleteButton}
              >
                <Trash2 size={16} color="#ef4444" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
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
  overlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  notesText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: BORDER,
  },
  tagText: {
    fontSize: 12,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ef4444',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  blockSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
    backgroundColor: '#f9fafb',
    overflow: 'visible',
  },
  expandableSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  reviewItem: {
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
});

