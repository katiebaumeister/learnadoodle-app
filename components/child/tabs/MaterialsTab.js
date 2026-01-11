/**
 * Materials Tab for Child Profile
 * Shows materials grouped by reaction (Loved, OK/Neutral, Didn't click)
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { BookOpen, Heart, Meh, Frown, Plus } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { getMaterialsByChild } from '../../../lib/services/materialsClient';
import QuickReviewModal from '../../materials/QuickReviewModal';
import MaterialDetailDrawer from '../../materials/MaterialDetailDrawer';

const EMOTION_ICONS = {
  loved: { icon: Heart, color: '#ef4444', label: 'Loved' },
  liked: { icon: Heart, color: '#f59e0b', label: 'Liked' },
  neutral: { icon: Meh, color: '#6b7280', label: 'Neutral' },
  bored: { icon: Frown, color: '#9ca3af', label: 'Bored' },
  overwhelmed: { icon: Frown, color: '#ef4444', label: 'Overwhelmed' },
  frustrated: { icon: Frown, color: '#dc2626', label: 'Frustrated' },
};

export default function MaterialsTab({ child, familyId }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewMaterial, setReviewMaterial] = useState(null);

  useEffect(() => {
    if (child?.id && familyId) {
      loadMaterials();
    }
  }, [child?.id, familyId]);

  const loadMaterials = async () => {
    if (!child?.id || !familyId) return;
    setLoading(true);
    try {
      const data = await getMaterialsByChild(familyId, child.id);
      setMaterials(data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  // Group materials by emotion/reaction
  const groupedMaterials = useMemo(() => {
    const groups = {
      loved: [],
      neutral: [],
      didntClick: [],
      noReview: [],
    };

    if (!materials || !child?.id) return groups;

    materials.forEach((material) => {
      const reviews = material.material_reviews || [];
      const childReviews = reviews.filter(r => r.child_id === child.id);
      
      if (childReviews.length === 0) {
        groups.noReview.push(material);
      } else {
        const lastReview = childReviews[childReviews.length - 1];
        const emotion = lastReview.emotion;
        
        if (emotion === 'loved' || emotion === 'liked') {
          groups.loved.push(material);
        } else if (emotion === 'neutral') {
          groups.neutral.push(material);
        } else {
          groups.didntClick.push(material);
        }
      }
    });

    return groups;
  }, [materials, child?.id]);

  const handleMaterialClick = (material) => {
    setSelectedMaterial(material);
    setShowDetailDrawer(true);
  };

  const handleLogReaction = (material) => {
    setReviewMaterial(material);
    setShowReviewModal(true);
  };

  const handleReviewSaved = () => {
    setShowReviewModal(false);
    setReviewMaterial(null);
    loadMaterials();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const renderMaterialChip = (material) => {
    const reviews = material.material_reviews || [];
    const childReviews = reviews.filter(r => r.child_id === child.id);
    const lastReview = childReviews[childReviews.length - 1];
    const emotion = lastReview?.emotion;
    const emotionData = emotion ? EMOTION_ICONS[emotion] : null;
    const EmotionIcon = emotionData?.icon || BookOpen;
    const status = material.material_children?.find(mc => mc.child_id === child.id)?.status || 'planned';

    return (
      <TouchableOpacity
        key={material.id}
        style={styles.materialChip}
        onPress={() => handleMaterialClick(material)}
      >
        <View style={styles.chipContent}>
          <View style={styles.chipLeft}>
            {emotionData && (
              <EmotionIcon size={16} color={emotionData.color} />
            )}
            <View style={styles.chipText}>
              <Text style={styles.chipTitle}>{material.title}</Text>
              <Text style={styles.chipMeta}>
                {material.type} • {status.replace('_', ' ')}
              </Text>
            </View>
          </View>
          {lastReview?.rating && (
            <View style={styles.rating}>
              <Text style={styles.ratingText}>
                {'⭐'.repeat(lastReview.rating)}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.logButton}
          onPress={() => handleLogReaction(material)}
        >
          <Text style={styles.logButtonText}>Log reaction</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Materials</Text>
        <Text style={styles.subtitle}>
          Materials {child?.first_name || child?.name || 'this child'} has tried
        </Text>
      </View>

      {/* Loved */}
      {groupedMaterials.loved.length > 0 && (
        <View style={styles.group}>
          <View style={styles.groupHeader}>
            <Heart size={20} color="#ef4444" />
            <Text style={styles.groupTitle}>Loved 💚</Text>
          </View>
          {groupedMaterials.loved.map(renderMaterialChip)}
        </View>
      )}

      {/* Neutral */}
      {groupedMaterials.neutral.length > 0 && (
        <View style={styles.group}>
          <View style={styles.groupHeader}>
            <Meh size={20} color="#6b7280" />
            <Text style={styles.groupTitle}>OK / Neutral 😐</Text>
          </View>
          {groupedMaterials.neutral.map(renderMaterialChip)}
        </View>
      )}

      {/* Didn't Click */}
      {groupedMaterials.didntClick.length > 0 && (
        <View style={styles.group}>
          <View style={styles.groupHeader}>
            <Frown size={20} color="#9ca3af" />
            <Text style={styles.groupTitle}>Didn't click 💤</Text>
          </View>
          {groupedMaterials.didntClick.map(renderMaterialChip)}
        </View>
      )}

      {/* No Review Yet */}
      {groupedMaterials.noReview.length > 0 && (
        <View style={styles.group}>
          <View style={styles.groupHeader}>
            <BookOpen size={20} color={colors.muted} />
            <Text style={styles.groupTitle}>No review yet</Text>
          </View>
          {groupedMaterials.noReview.map(renderMaterialChip)}
        </View>
      )}

      {/* Empty State */}
      {materials.length === 0 && (
        <View style={styles.emptyState}>
          <BookOpen size={48} color={colors.muted} />
          <Text style={styles.emptyText}>No materials yet</Text>
          <Text style={styles.emptySubtext}>
            Materials will appear here once they're linked to events
          </Text>
        </View>
      )}

      {/* Detail Drawer */}
      <MaterialDetailDrawer
        open={showDetailDrawer}
        onClose={() => {
          setShowDetailDrawer(false);
          setSelectedMaterial(null);
        }}
        material={selectedMaterial}
        children={[child]}
        familyId={familyId}
        onReviewSaved={handleReviewSaved}
      />

      {/* Review Modal */}
      {reviewMaterial && (
        <QuickReviewModal
          visible={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setReviewMaterial(null);
          }}
          onSaved={handleReviewSaved}
          materialId={reviewMaterial.id}
          childId={child.id}
          familyId={familyId}
          materialTitle={reviewMaterial.title}
          childName={child.first_name || child.name}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  group: {
    marginBottom: 32,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  materialChip: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  chipText: {
    flex: 1,
  },
  chipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  chipMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  rating: {
    marginLeft: 8,
  },
  ratingText: {
    fontSize: 14,
  },
  logButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.accentLight,
    alignSelf: 'flex-start',
  },
  logButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.accent,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
});

