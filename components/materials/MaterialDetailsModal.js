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
import { X, Calendar, DollarSign, MapPin, ExternalLink, FileText, UserCircle, Star, Tag, HardDrive, Type } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getMaterial } from '../../lib/services/materialsClient';
import { normalizeMaterial, normalizeUpload, roleLabel as getRoleLabel } from '../../lib/docs/roles';
import MaterialScheduleLinksSection from './MaterialScheduleLinksSection';
import ConfirmDialog from '../ConfirmDialog';
import { ModalFooter } from '../ui/ModalFooter';

const FG = '#111827';
const SUB = '#6b7280';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const MATERIAL_ACCENT = '#9ECFFB';
const MATERIAL_ACCENT_SOFT = '#F0F8FF';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    } else if (!visible) {
      setShowDeleteConfirm(false);
    }
  }, [visible, initialMaterial]);

  const [plannerHasLinks, setPlannerHasLinks] = useState(false);

  useEffect(() => {
    setPlannerHasLinks(false);
  }, [initialMaterial?.id]);

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
  const roleDisplayName = role ? getRoleLabel(role) : null;
  const childLabels = materialChildren
    .map((mc) => {
      const child = children.find((c) => c.id === mc.child_id);
      return child?.first_name || child?.name || null;
    })
    .filter(Boolean);
  const subjectLabels = [
    material.subject_name,
    material.subject_key,
  ].filter(Boolean);

  const showScheduleLinks = !!(material?.id && familyId);
  const hasProviderMetadata = !!(material.provider_name || material.provider_url);
  const hasPurchaseMetadata = !!(
    material.purchase_date ||
    material.purchase_price ||
    material.is_subscription
  );
  const hasReviewMetadata = !!(
    material.review_child_id ||
    material.review_rating ||
    material.review_emotion ||
    material.review_pacing_fit ||
    material.review_difficulty ||
    material.review_notes
  );
  const hasMaterialMetadataSection =
    hasProviderMetadata || hasPurchaseMetadata || hasReviewMetadata;

  return (
    <>
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
            <View style={styles.headerTextWrap}>
              <View style={styles.eyebrowBadge}>
                <Text style={styles.eyebrowText}>MATERIAL DETAILS</Text>
              </View>
              <Text style={styles.headerTitle}>Material Details</Text>
              {!!material?.title && (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {material.title}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.muted || 'rgba(15, 23, 42, 0.5)'} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={MATERIAL_ACCENT} />
                <Text style={styles.loadingText}>Loading material details...</Text>
              </View>
            ) : (
              <>
                {/* Core fields (match Edit Material form shape) */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Details</Text>
                  {material.title ? (
                    <View style={styles.detailFieldBlock}>
                      <Text style={styles.detailFieldLabel}>Title</Text>
                      <Text style={styles.detailFieldValue}>{material.title}</Text>
                    </View>
                  ) : null}
                  {material.created_at && (
                    <View style={styles.detailFieldBlock}>
                      <Text style={styles.detailFieldLabel}>Date</Text>
                      <Text style={styles.detailFieldValue}>
                        {new Date(material.created_at).toLocaleDateString(undefined, {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  )}
                  {roleDisplayName ? (
                    <View style={styles.detailFieldBlock}>
                      <Text style={styles.detailFieldLabel}>Type</Text>
                      <View style={styles.tagsContainer}>
                        <View style={styles.tagChip}>
                          <Text style={styles.tagText}>{roleDisplayName}</Text>
                        </View>
                      </View>
                    </View>
                  ) : null}
                  {childLabels.length > 0 ? (
                    <View style={styles.detailFieldBlock}>
                      <Text style={styles.detailFieldLabel}>Children</Text>
                      <View style={styles.tagsContainer}>
                        {childLabels.map((name) => (
                          <View key={name} style={styles.tagChip}>
                            <Text style={styles.tagText}>{name}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {subjectLabels.length > 0 ? (
                    <View style={styles.detailFieldBlock}>
                      <Text style={styles.detailFieldLabel}>Subject</Text>
                      <View style={styles.tagsContainer}>
                        {subjectLabels.map((subjectName) => (
                          <View key={subjectName} style={styles.tagChip}>
                            <Text style={styles.tagText}>{subjectName}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Notes */}
                {material.notes && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Notes</Text>
                    <Text style={styles.notesText}>{material.notes}</Text>
                  </View>
                )}

                {showScheduleLinks ? (
                  <MaterialScheduleLinksSection
                    materialId={material.id}
                    familyId={familyId}
                    refreshToken={material.updated_at || material.id}
                    hideWhenEmpty
                    categoryTitle="Planner Linking (optional)"
                    categoryTitleStyle={[styles.metadataSectionTitle, styles.metadataSectionTitleAfterSubject]}
                    onLinkageResolved={setPlannerHasLinks}
                  />
                ) : null}

                {hasMaterialMetadataSection ? (
                  <View
                    style={[
                      styles.section,
                      styles.metadataCollapseGroup,
                      plannerHasLinks && styles.metadataCollapseAfterSchedule,
                    ]}
                  >
                    <Text
                      style={[
                        styles.metadataSectionTitle,
                        plannerHasLinks && styles.metadataSectionTitleNoTopMargin,
                      ]}
                    >
                      Material Metadata (optional)
                    </Text>
                  {/* Provider Information - Expandable */}
                  {hasProviderMetadata && (
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
                                  <ExternalLink size={16} color={MATERIAL_ACCENT} />
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
                  {hasPurchaseMetadata && (
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
                  {hasReviewMetadata && (
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
                ) : null}

                {/* Location */}
                {material.location_hint && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Location</Text>
                    <View style={styles.tagsContainer}>
                      <View style={styles.infoRow}>
                        <MapPin size={16} color={colors.muted} />
                        <Text style={styles.infoValue}>{material.location_hint}</Text>
                      </View>
                    </View>
                  </View>
                )}

              </>
            )}
          </ScrollView>

          {/* Footer with Edit and Delete buttons */}
          {!loading && (
            <View style={styles.footer}>
              <ModalFooter
                mode="edit"
                primaryLabel="Edit"
                destructiveLabel="Delete"
                onCancel={onClose}
                onDelete={() => setShowDeleteConfirm(true)}
                onPrimary={() => onEdit?.(material)}
                accent={MATERIAL_ACCENT}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
    <ConfirmDialog
      visible={showDeleteConfirm}
      title="Delete material?"
      message="This will permanently delete this material. This cannot be undone."
      confirmLabel="Delete material"
      cancelLabel="Cancel"
      destructive
      onCancel={() => setShowDeleteConfirm(false)}
      onConfirm={async () => {
        setShowDeleteConfirm(false);
        await onDelete?.(material, { confirmed: true });
        onClose?.();
      }}
    />
    </>
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
    borderRadius: 34,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(36, 50, 74, 0.20)',
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
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: MATERIAL_ACCENT_SOFT,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F5',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  eyebrowBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFFE6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DCECFB',
  },
  eyebrowText: {
    color: MATERIAL_ACCENT,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  headerTitle: {
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '800',
    color: '#1E2A3A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6C738E',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCECFB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEF0F5',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  detailFieldBlock: {
    marginBottom: 10,
  },
  detailFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C738E',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  detailFieldValue: {
    fontSize: 15,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C738E',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginBottom: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  metadataSectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: SUB,
    marginTop: 24,
    marginBottom: 4,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  metadataSectionTitleNoTopMargin: {
    marginTop: 0,
  },
  metadataSectionTitleAfterSubject: {
    marginTop: 12,
  },
  metadataCollapseGroup: {
    gap: 12,
  },
  metadataCollapseAfterSchedule: {
    marginTop: 8,
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
    color: MATERIAL_ACCENT,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
    backgroundColor: '#FFFFFF',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  editButton: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: MATERIAL_ACCENT,
    backgroundColor: MATERIAL_ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  blockSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
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

