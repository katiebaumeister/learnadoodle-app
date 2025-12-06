/**
 * MaterialCard Component
 * Displays a material in a card format with cover, title, type, and usage info
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { BookOpen, Users, Star } from 'lucide-react';
import { colors } from '../../theme/colors';
import { calculateReusePotential } from '../../lib/utils/materialReuseLogic';

const TYPE_LABELS = {
  textbook: 'Textbook',
  workbook: 'Workbook',
  kit: 'Kit',
  course: 'Course',
  subscription: 'Subscription',
  video: 'Video',
  other: 'Other',
};

const TYPE_COLORS = {
  textbook: '#3b82f6',
  workbook: '#10b981',
  kit: '#f59e0b',
  course: '#8b5cf6',
  subscription: '#ec4899',
  video: '#ef4444',
  other: '#6b7280',
};

export default function MaterialCard({ material, onPress, children = [] }) {
  const avgRating = material.material_reviews?.length > 0
    ? material.material_reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / material.material_reviews.length
    : null;

  const childrenUsed = material.material_children || [];
  const reusePotential = calculateReusePotential(material);

  const getInitials = (title) => {
    return title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Cover Image */}
      <View style={styles.coverContainer}>
        {material.cover_image_url ? (
          <Image
            source={{ uri: material.cover_image_url }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: TYPE_COLORS[material.type] || TYPE_COLORS.other }]}>
            <BookOpen size={32} color="#ffffff" />
            <Text style={styles.coverInitials}>{getInitials(material.title)}</Text>
          </View>
        )}
        <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[material.type] || TYPE_COLORS.other }]}>
          <Text style={styles.typeBadgeText}>{TYPE_LABELS[material.type] || 'Other'}</Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {material.title}
        </Text>

        {/* Subject & Grade Range */}
        {(material.subject_key || material.grade_range_min !== null) && (
          <View style={styles.metaRow}>
            {material.subject_key && (
              <Text style={styles.metaText}>{material.subject_key}</Text>
            )}
            {material.grade_range_min !== null && material.grade_range_max !== null && (
              <Text style={styles.metaText}>
                Grades {material.grade_range_min}-{material.grade_range_max}
              </Text>
            )}
          </View>
        )}

        {/* Children Avatars & Rating */}
        <View style={styles.footer}>
          {childrenUsed.length > 0 && (
            <View style={styles.childrenContainer}>
              <Users size={14} color={colors.muted} />
              <Text style={styles.childrenText}>
                {childrenUsed.length} {childrenUsed.length === 1 ? 'child' : 'children'}
              </Text>
            </View>
          )}
          {avgRating && (
            <View style={styles.ratingContainer}>
              <Star size={14} color="#fbbf24" fill="#fbbf24" />
              <Text style={styles.ratingText}>{avgRating.toFixed(1)}</Text>
            </View>
          )}
        </View>

        {/* Reuse Indicator */}
        {reusePotential.score && (
          <View style={[
            styles.reuseBadge,
            reusePotential.score === 'high' && styles.reuseBadgeHigh,
            reusePotential.score === 'low' && styles.reuseBadgeLow
          ]}>
            <Text style={[
              styles.reuseBadgeText,
              reusePotential.score === 'high' && styles.reuseBadgeTextHigh,
              reusePotential.score === 'low' && styles.reuseBadgeTextLow
            ]}>
              {reusePotential.label}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  coverContainer: {
    width: '100%',
    height: 160,
    position: 'relative',
    backgroundColor: colors.bgLight,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  coverInitials: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  content: {
    padding: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    minHeight: 40,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  childrenContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  childrenText: {
    fontSize: 12,
    color: colors.muted,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  reuseBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  reuseBadgeHigh: {
    backgroundColor: '#dcfce7',
  },
  reuseBadgeLow: {
    backgroundColor: '#fee2e2',
  },
  reuseBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reuseBadgeTextHigh: {
    color: '#166534',
  },
  reuseBadgeTextLow: {
    color: '#991b1b',
  },
});

