/**
 * MaterialDetailDrawer Component
 * Slide-over drawer showing material details with tabs for Overview, By Child, and Reviews
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { X, Star, ExternalLink, MapPin, Calendar, DollarSign } from 'lucide-react';
import { colors } from '../../theme/colors';
import QuickReviewModal from './QuickReviewModal';

const EMOTION_EMOJIS = {
  loved: '❤️',
  liked: '👍',
  neutral: '😐',
  bored: '😴',
  overwhelmed: '😰',
  frustrated: '😤',
};

const STATUS_LABELS = {
  planned: 'Planned',
  in_use: 'In Use',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

export default function MaterialDetailDrawer({
  open,
  onClose,
  material,
  children = [],
  familyId,
  onReviewSaved,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedChildForReview, setSelectedChildForReview] = useState(null);

  if (!material) return null;

  const materialChildren = material.material_children || [];
  const reviews = material.material_reviews || [];

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : null;

  const handleLogReaction = (childId) => {
    setSelectedChildForReview(childId);
    setShowReviewModal(true);
  };

  const handleReviewSaved = () => {
    setShowReviewModal(false);
    setSelectedChildForReview(null);
    if (onReviewSaved) {
      onReviewSaved();
    }
  };

  return (
    <>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.overlayTouchable}
            activeOpacity={1}
            onPress={onClose}
          />
          <View style={styles.drawer}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <Text style={styles.title} numberOfLines={2}>
                  {material.title}
                </Text>
                {material.type && (
                  <Text style={styles.subtitle}>
                    {material.type.charAt(0).toUpperCase() + material.type.slice(1)}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
                onPress={() => setActiveTab('overview')}
              >
                <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
                  Overview
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'by_child' && styles.tabActive]}
                onPress={() => setActiveTab('by_child')}
              >
                <Text style={[styles.tabText, activeTab === 'by_child' && styles.tabTextActive]}>
                  By Child
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'reviews' && styles.tabActive]}
                onPress={() => setActiveTab('reviews')}
              >
                <Text style={[styles.tabText, activeTab === 'reviews' && styles.tabTextActive]}>
                  Reviews
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={styles.content}>
              {activeTab === 'overview' && (
                <View style={styles.tabContent}>
                  {/* Basic Info */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Details</Text>
                    {material.subject_key && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Subject:</Text>
                        <Text style={styles.infoValue}>{material.subject_key}</Text>
                      </View>
                    )}
                    {material.grade_range_min !== null && material.grade_range_max !== null && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Grade Range:</Text>
                        <Text style={styles.infoValue}>
                          {material.grade_range_min}-{material.grade_range_max}
                        </Text>
                      </View>
                    )}
                    {material.provider_name && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Provider:</Text>
                        <Text style={styles.infoValue}>{material.provider_name}</Text>
                      </View>
                    )}
                    {material.location_hint && (
                      <View style={styles.infoRow}>
                        <MapPin size={16} color={colors.muted} />
                        <Text style={styles.infoValue}>{material.location_hint}</Text>
                      </View>
                    )}
                  </View>

                  {/* Purchase Info */}
                  {(material.purchase_date || material.purchase_price) && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Purchase</Text>
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
                    </View>
                  )}

                  {/* Stats */}
                  {avgRating && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Stats</Text>
                      <View style={styles.infoRow}>
                        <Star size={16} color="#fbbf24" fill="#fbbf24" />
                        <Text style={styles.infoValue}>
                          {avgRating.toFixed(1)} / 5.0 ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Used by:</Text>
                        <Text style={styles.infoValue}>
                          {materialChildren.length} {materialChildren.length === 1 ? 'child' : 'children'}
                        </Text>
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

                  {/* Provider Link */}
                  {material.provider_url && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          window.open(material.provider_url, '_blank');
                        }
                      }}
                    >
                      <ExternalLink size={16} color={colors.accent} />
                      <Text style={styles.linkButtonText}>Visit Provider</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {activeTab === 'by_child' && (
                <View style={styles.tabContent}>
                  {materialChildren.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>No children have used this material yet.</Text>
                    </View>
                  ) : (
                    materialChildren.map((mc) => {
                      const child = children.find(c => c.id === mc.child_id);
                      const childReviews = reviews.filter(r => r.child_id === mc.child_id);
                      const lastReview = childReviews[0];
                      
                      return (
                        <View key={mc.id} style={styles.childCard}>
                          <View style={styles.childHeader}>
                            <Text style={styles.childName}>
                              {child?.first_name || child?.name || 'Unknown'}
                            </Text>
                            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(mc.status) }]}>
                              <Text style={styles.statusBadgeText}>
                                {STATUS_LABELS[mc.status] || mc.status}
                              </Text>
                            </View>
                          </View>
                          
                          {lastReview && (
                            <View style={styles.reviewSummary}>
                              {lastReview.rating && (
                                <View style={styles.ratingRow}>
                                  <Star size={14} color="#fbbf24" fill="#fbbf24" />
                                  <Text style={styles.ratingText}>{lastReview.rating}/5</Text>
                                </View>
                              )}
                              {lastReview.emotion && (
                                <Text style={styles.emotionEmoji}>
                                  {EMOTION_EMOJIS[lastReview.emotion] || '😐'}
                                </Text>
                              )}
                            </View>
                          )}
                          
                          <TouchableOpacity
                            style={styles.logButton}
                            onPress={() => handleLogReaction(mc.child_id)}
                          >
                            <Text style={styles.logButtonText}>
                              {lastReview ? 'Update Reaction' : 'Log Reaction'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {activeTab === 'reviews' && (
                <View style={styles.tabContent}>
                  {reviews.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>No reviews yet.</Text>
                      <Text style={styles.emptySubtext}>
                        Log reactions from the "By Child" tab to see reviews here.
                      </Text>
                    </View>
                  ) : (
                    reviews.map((review) => {
                      const child = children.find(c => c.id === review.child_id);
                      return (
                        <View key={review.id} style={styles.reviewCard}>
                          <View style={styles.reviewHeader}>
                            <Text style={styles.reviewChildName}>
                              {child?.first_name || child?.name || 'Unknown'}
                            </Text>
                            <Text style={styles.reviewDate}>
                              {new Date(review.created_at).toLocaleDateString()}
                            </Text>
                          </View>
                          
                          {review.rating && (
                            <View style={styles.reviewRating}>
                              <Star size={16} color="#fbbf24" fill="#fbbf24" />
                              <Text style={styles.reviewRatingText}>{review.rating}/5</Text>
                            </View>
                          )}
                          
                          <View style={styles.reviewDetails}>
                            {review.emotion && (
                              <View style={styles.reviewDetail}>
                                <Text style={styles.reviewDetailLabel}>Feeling:</Text>
                                <Text style={styles.reviewDetailValue}>
                                  {EMOTION_EMOJIS[review.emotion]} {review.emotion}
                                </Text>
                              </View>
                            )}
                            {review.pacing_fit && (
                              <View style={styles.reviewDetail}>
                                <Text style={styles.reviewDetailLabel}>Pacing:</Text>
                                <Text style={styles.reviewDetailValue}>
                                  {review.pacing_fit.replace('_', ' ')}
                                </Text>
                              </View>
                            )}
                            {review.difficulty && (
                              <View style={styles.reviewDetail}>
                                <Text style={styles.reviewDetailLabel}>Difficulty:</Text>
                                <Text style={styles.reviewDetailValue}>
                                  {review.difficulty.replace('_', ' ')}
                                </Text>
                              </View>
                            )}
                          </View>
                          
                          {review.notes && (
                            <Text style={styles.reviewNotes}>{review.notes}</Text>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Quick Review Modal */}
      <QuickReviewModal
        visible={showReviewModal}
        onClose={() => {
          setShowReviewModal(false);
          setSelectedChildForReview(null);
        }}
        onSaved={handleReviewSaved}
        materialId={material.id}
        childId={selectedChildForReview}
        familyId={familyId}
        materialTitle={material.title}
        childName={children.find(c => c.id === selectedChildForReview)?.first_name || ''}
      />
    </>
  );
}

function getStatusColor(status) {
  switch (status) {
    case 'completed':
      return '#dcfce7';
    case 'in_use':
      return '#dbeafe';
    case 'abandoned':
      return '#fee2e2';
    default:
      return '#f3f4f6';
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  drawer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        maxWidth: 600,
        marginLeft: 'auto',
        marginRight: 'auto',
        width: '100%',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textTransform: 'capitalize',
  },
  closeButton: {
    padding: 4,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
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
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
  },
  notesText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  childCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  childHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  reviewSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  emotionEmoji: {
    fontSize: 20,
  },
  logButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.accentLight,
    alignSelf: 'flex-start',
  },
  logButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
  },
  reviewCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewChildName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.muted,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  reviewRatingText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  reviewDetails: {
    marginBottom: 8,
  },
  reviewDetail: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  reviewDetailLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
  },
  reviewDetailValue: {
    fontSize: 13,
    color: colors.text,
    textTransform: 'capitalize',
  },
  reviewNotes: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

