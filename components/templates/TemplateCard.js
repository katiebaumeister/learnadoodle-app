import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { FileText, Eye, Play, GitBranch, Share2, Globe } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function TemplateCard({ 
  template, 
  onPreview, 
  onApply,
  onViewVersions,
  onShare,
  showActions = true,
}) {
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 768;
  
  // Handle both plan_templates and lesson_templates formats
  const isLessonTemplate = template.title !== undefined; // lesson_templates have 'title', plan_templates have 'template_name'
  
  const templateTitle = isLessonTemplate ? template.title : template.template_name;
  const templateDescription = isLessonTemplate ? template.default_objectives : template.template_description;
  const durationMinutes = isLessonTemplate ? template.default_duration : null;
  const durationDays = isLessonTemplate ? null : (template.template_data?.duration_days || 0);
  
  const getDurationLabel = () => {
    if (durationMinutes) {
      if (durationMinutes <= 30) return `${durationMinutes} min`;
      if (durationMinutes <= 60) return '1 hour';
      return `${Math.round(durationMinutes / 60)} hours`;
    }
    if (durationDays) {
      if (durationDays <= 14) return '1-2 weeks';
      if (durationDays <= 42) return '3-6 weeks';
      return '>6 weeks';
    }
    return null;
  };

  return (
    <View style={[styles.card, isMobile && styles.cardMobile]}>
      <View style={[styles.cardHeader, isMobile && styles.cardHeaderMobile]}>
        <View style={styles.cardHeaderLeft}>
          <FileText size={isMobile ? 18 : 20} color={colors.accent} />
          <View style={styles.cardTitleSection}>
            <Text style={[styles.cardTitle, isMobile && styles.cardTitleMobile]} numberOfLines={isMobile ? 2 : 1}>
              {templateTitle}
            </Text>
            <View style={[styles.cardBadges, isMobile && styles.cardBadgesMobile]}>
              <View style={styles.typeBadge}>
                <Text style={[styles.typeBadgeText, isMobile && styles.typeBadgeTextMobile]}>
                  {isLessonTemplate ? 'Lesson Template' : (template.template_type || 'Template')}
                </Text>
              </View>
              {template.version && template.version > 1 && (
                <View style={styles.versionBadge}>
                  <Text style={[styles.versionBadgeText, isMobile && styles.versionBadgeTextMobile]}>
                    v{template.version}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {templateDescription && (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {templateDescription}
        </Text>
      )}

      {/* Metadata */}
      <View style={styles.metadata}>
        {getDurationLabel() && (
          <Text style={styles.metadataText}>{getDurationLabel()}</Text>
        )}
        {template.subject_id && (
          <Text style={styles.metadataText}>Subject linked</Text>
        )}
        {template.grade_levels && template.grade_levels.length > 0 && (
          <Text style={styles.metadataText}>
            Grades: {template.grade_levels.join(', ')}
          </Text>
        )}
      </View>

      {/* Marketplace Badge */}
      {template.is_marketplace_template && (
        <View style={styles.marketplaceBadge}>
          <Globe size={12} color={colors.accent} />
          <Text style={styles.marketplaceText}>Marketplace</Text>
        </View>
      )}

      {/* Actions */}
      {showActions && (
        <View style={[styles.actions, isMobile && styles.actionsMobile]}>
          <TouchableOpacity
            style={[styles.previewButton, isMobile && styles.previewButtonMobile]}
            onPress={() => onPreview(template)}
          >
            <Eye size={isMobile ? 18 : 16} color={colors.accent} />
            <Text style={[styles.previewButtonText, isMobile && styles.previewButtonTextMobile]}>
              Preview
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.applyButton, isMobile && styles.applyButtonMobile]}
            onPress={() => onApply(template)}
          >
            <Play size={isMobile ? 18 : 16} color="#ffffff" />
            <Text style={[styles.applyButtonText, isMobile && styles.applyButtonTextMobile]}>
              Apply
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Additional Actions */}
      {(onViewVersions || onShare) && (
        <View style={styles.secondaryActions}>
          {onViewVersions && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onViewVersions(template)}
            >
              <GitBranch size={14} color={colors.muted} />
              <Text style={styles.secondaryButtonText}>
                {template.version > 1 ? `v${template.version}` : 'Versions'}
              </Text>
            </TouchableOpacity>
          )}
          {onShare && !template.is_marketplace_template && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onShare(template)}
            >
              <Share2 size={14} color={colors.muted} />
              <Text style={styles.secondaryButtonText}>Share</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardMobile: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 10,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardHeaderMobile: {
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTitleSection: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  cardTitleMobile: {
    fontSize: 15,
    marginBottom: 4,
  },
  cardBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardBadgesMobile: {
    gap: 6,
  },
  typeBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1e40af',
  },
  typeBadgeTextMobile: {
    fontSize: 11,
  },
  usageBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  usageBadgeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  versionBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontSize: 12,
    color: '#3730a3',
    fontWeight: '600',
  },
  versionBadgeTextMobile: {
    fontSize: 11,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#374151',
  },
  moreTags: {
    fontSize: 12,
    color: '#9ca3af',
    paddingVertical: 4,
  },
  metadata: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metadataText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionsMobile: {
    gap: 6,
    marginTop: 10,
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  previewButtonMobile: {
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  previewButtonTextMobile: {
    fontSize: 15,
  },
  applyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  applyButtonMobile: {
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  applyButtonTextMobile: {
    fontSize: 15,
  },
  marketplaceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  marketplaceText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
});

