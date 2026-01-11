/**
 * Advanced AI Insights Tab Component
 * Comprehensive multi-layer insights with predictive and prescriptive capabilities
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { 
  Lightbulb, 
  AlertTriangle, 
  TrendingUp, 
  Target, 
  CheckCircle, 
  XCircle,
  Filter,
  Sparkles,
  Layers,
  Eye,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { generateAdvancedInsights, getInsights, applyInsight, dismissInsight } from '../../lib/services/aiAdvancedInsightsClient';

const INSIGHT_TYPES = {
  EMOTIONAL: 'emotional',
  TACTICAL: 'tactical',
  STRATEGIC: 'strategic',
  PREDICTIVE: 'predictive',
  PRESCRIPTIVE: 'prescriptive',
};

const INSIGHT_LAYERS = {
  SURFACE: 'surface',
  PATTERN: 'pattern',
  DEEP: 'deep',
  PREDICTIVE: 'predictive',
};

const INSIGHT_TYPE_LABELS = {
  [INSIGHT_TYPES.EMOTIONAL]: 'Emotional',
  [INSIGHT_TYPES.TACTICAL]: 'Tactical',
  [INSIGHT_TYPES.STRATEGIC]: 'Strategic',
  [INSIGHT_TYPES.PREDICTIVE]: 'Predictive',
  [INSIGHT_TYPES.PRESCRIPTIVE]: 'Prescriptive',
};

const INSIGHT_LAYER_LABELS = {
  [INSIGHT_LAYERS.SURFACE]: 'Surface',
  [INSIGHT_LAYERS.PATTERN]: 'Pattern',
  [INSIGHT_LAYERS.DEEP]: 'Deep',
  [INSIGHT_LAYERS.PREDICTIVE]: 'Predictive',
};

export default function AdvancedInsightsTab({ familyId, children = [], selectedChildId = null }) {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState([INSIGHT_TYPES.TACTICAL, INSIGHT_TYPES.STRATEGIC]);
  const [selectedLayers, setSelectedLayers] = useState([INSIGHT_LAYERS.SURFACE, INSIGHT_LAYERS.PATTERN]);
  const [actionableOnly, setActionableOnly] = useState(true);
  const [dateRangeStart, setDateRangeStart] = useState(null);
  const [dateRangeEnd, setDateRangeEnd] = useState(null);

  useEffect(() => {
    loadInsights();
  }, [selectedChildId, selectedTypes, selectedLayers, actionableOnly]);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const { data, error } = await getInsights(
        selectedChildId,
        null, // Get all types, filter client-side
        null, // Get all layers, filter client-side
        actionableOnly,
        50
      );

      if (error) {
        return;
      }

      // Filter by selected types and layers
      const filtered = (data || []).filter(insight => 
        selectedTypes.includes(insight.insight_type) &&
        selectedLayers.includes(insight.layer)
      );

      setInsights(filtered);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await generateAdvancedInsights(
        selectedChildId,
        selectedTypes,
        selectedLayers,
        dateRangeStart,
        dateRangeEnd
      );

      if (error) {
        return;
      }

      // Reload insights after generation
      await loadInsights();
    } catch (err) {
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async (insightId) => {
    const { error } = await applyInsight(insightId);
    if (!error) {
      setInsights(prev => prev.map(i => 
        i.id === insightId ? { ...i, applied_at: new Date().toISOString() } : i
      ));
    }
  };

  const handleDismiss = async (insightId) => {
    const { error } = await dismissInsight(insightId);
    if (!error) {
      setInsights(prev => prev.filter(i => i.id !== insightId));
    }
  };

  const toggleType = (type) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const toggleLayer = (layer) => {
    setSelectedLayers(prev => 
      prev.includes(layer)
        ? prev.filter(l => l !== layer)
        : [...prev, layer]
    );
  };

  const getInsightIcon = (type) => {
    switch (type) {
      case INSIGHT_TYPES.EMOTIONAL:
        return Lightbulb;
      case INSIGHT_TYPES.TACTICAL:
        return Target;
      case INSIGHT_TYPES.STRATEGIC:
        return TrendingUp;
      case INSIGHT_TYPES.PREDICTIVE:
        return Eye;
      case INSIGHT_TYPES.PRESCRIPTIVE:
        return Sparkles;
      default:
        return Lightbulb;
    }
  };

  const getInsightColor = (type) => {
    switch (type) {
      case INSIGHT_TYPES.EMOTIONAL:
        return '#f59e0b';
      case INSIGHT_TYPES.TACTICAL:
        return '#3b82f6';
      case INSIGHT_TYPES.STRATEGIC:
        return '#8b5cf6';
      case INSIGHT_TYPES.PREDICTIVE:
        return '#10b981';
      case INSIGHT_TYPES.PRESCRIPTIVE:
        return '#ec4899';
      default:
        return colors.textSecondary;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Layers size={20} color={colors.indigo} />
            <Text style={styles.headerTitle}>Advanced AI Insights</Text>
          </View>
          <TouchableOpacity
            onPress={handleGenerate}
            style={[styles.generateButton, generating && styles.generateButtonDisabled]}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Sparkles size={16} color={colors.white} />
                <Text style={styles.generateButtonText}>Generate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Filters */}
        <View style={styles.filters}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Types:</Text>
            <View style={styles.filterChips}>
              {Object.entries(INSIGHT_TYPE_LABELS).map(([type, label]) => {
                const Icon = getInsightIcon(type);
                const isSelected = selectedTypes.includes(type);
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.filterChip,
                      isSelected && styles.filterChipActive,
                      isSelected && { backgroundColor: getInsightColor(type) + '20', borderColor: getInsightColor(type) }
                    ]}
                    onPress={() => toggleType(type)}
                  >
                    <Icon size={14} color={isSelected ? getInsightColor(type) : colors.textSecondary} />
                    <Text style={[
                      styles.filterChipText,
                      isSelected && { color: getInsightColor(type), fontWeight: '600' }
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Layers:</Text>
            <View style={styles.filterChips}>
              {Object.entries(INSIGHT_LAYER_LABELS).map(([layer, label]) => {
                const isSelected = selectedLayers.includes(layer);
                return (
                  <TouchableOpacity
                    key={layer}
                    style={[
                      styles.filterChip,
                      isSelected && styles.filterChipActive
                    ]}
                    onPress={() => toggleLayer(layer)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextActive
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.toggleButton, actionableOnly && styles.toggleButtonActive]}
            onPress={() => setActionableOnly(!actionableOnly)}
          >
            <Text style={[styles.toggleButtonText, actionableOnly && styles.toggleButtonTextActive]}>
              Actionable Only
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Insights List */}
      <ScrollView style={styles.insightsList} contentContainerStyle={styles.insightsContent}>
        {loading && (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.indigo} />
            <Text style={styles.emptyStateText}>Loading insights...</Text>
          </View>
        )}

        {!loading && insights.length === 0 && (
          <View style={styles.emptyState}>
            <Lightbulb size={48} color={colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>No insights yet</Text>
            <Text style={styles.emptyStateText}>
              Generate insights to see personalized recommendations and patterns.
            </Text>
          </View>
        )}

        {!loading && insights.map((insight) => {
          const Icon = getInsightIcon(insight.insight_type);
          const iconColor = getInsightColor(insight.insight_type);
          const isApplied = insight.applied_at;
          const isDismissed = insight.dismissed_at;

          if (isDismissed) return null;

          return (
            <View key={insight.id} style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <View style={[styles.insightIcon, { backgroundColor: iconColor + '20' }]}>
                  <Icon size={20} color={iconColor} />
                </View>
                <View style={styles.insightHeaderText}>
                  <Text style={styles.insightTitle}>{insight.title}</Text>
                  <View style={styles.insightMeta}>
                    <Text style={[styles.insightBadge, { color: iconColor }]}>
                      {INSIGHT_TYPE_LABELS[insight.insight_type]}
                    </Text>
                    <Text style={styles.insightBadge}>
                      {INSIGHT_LAYER_LABELS[insight.layer]}
                    </Text>
                    <Text style={styles.insightBadge}>
                      {Math.round(insight.confidence_score * 100)}% confidence
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.insightDescription}>{insight.description}</Text>

              {insight.proposed_changes && insight.proposed_changes.length > 0 && (
                <View style={styles.proposedChanges}>
                  <Text style={styles.proposedChangesTitle}>Proposed Actions:</Text>
                  {insight.proposed_changes.map((change, idx) => (
                    <View key={idx} style={styles.proposedChange}>
                      <Text style={styles.proposedChangeText}>• {change.action || change.description || JSON.stringify(change)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!isApplied && (
                <View style={styles.insightActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.applyButton]}
                    onPress={() => handleApply(insight.id)}
                  >
                    <CheckCircle size={16} color={colors.white} />
                    <Text style={styles.actionButtonText}>Apply</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.dismissButton]}
                    onPress={() => handleDismiss(insight.id)}
                  >
                    <XCircle size={16} color={colors.textSecondary} />
                    <Text style={[styles.actionButtonText, styles.dismissButtonText]}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isApplied && (
                <View style={styles.appliedBadge}>
                  <CheckCircle size={16} color={colors.green} />
                  <Text style={styles.appliedText}>Applied</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  filters: {
    gap: 12,
  },
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    borderWidth: 2,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.indigo,
    fontWeight: '600',
  },
  toggleButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButtonActive: {
    backgroundColor: colors.indigo + '20',
    borderColor: colors.indigo,
  },
  toggleButtonText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  toggleButtonTextActive: {
    color: colors.indigo,
    fontWeight: '600',
  },
  insightsList: {
    flex: 1,
  },
  insightsContent: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  insightCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightHeaderText: {
    flex: 1,
    gap: 4,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  insightMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  insightBadge: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.background,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  insightDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  proposedChanges: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 12,
  },
  proposedChangesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  proposedChange: {
    marginBottom: 4,
  },
  proposedChangeText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  insightActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  applyButton: {
    backgroundColor: colors.indigo,
  },
  dismissButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  dismissButtonText: {
    color: colors.textSecondary,
  },
  appliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 8,
    backgroundColor: colors.green + '20',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  appliedText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.green,
  },
});

