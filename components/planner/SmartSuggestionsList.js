/**
 * SmartSuggestionsList Component
 * Displays planner intelligence suggestions with contextual actions
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Lightbulb, X, AlertCircle, Clock, Calendar, BookOpen, TrendingUp, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { generateDailySuggestions, getActiveSuggestions, dismissSuggestion } from '../../lib/services/plannerSuggestionsClient';
import { colors } from '../../theme/colors';

export default function SmartSuggestionsList({
  familyId,
  childId = null,
  onSuggestionClick,
  maxSuggestions = 5,
  autoGenerate = true,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(new Set());
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (familyId) {
      loadSuggestions();
    }
  }, [familyId, childId]);

  const loadSuggestions = async () => {
    if (!familyId) return;
    
    setLoading(true);
    try {
      // Generate new suggestions if auto-generate is enabled
      if (autoGenerate) {
        await generateDailySuggestions(familyId);
      }
      
      // Load active suggestions
      const { data, error } = await getActiveSuggestions(familyId, childId);
      
      if (error) {
        setSuggestions([]);
        return;
      }
      
      // Filter suggestions
      const filtered = (data || [])
        .filter(s => !s.dismissed_at);
      
      // Group suggestions by category (suggestion_type)
      const grouped = filtered.reduce((acc, suggestion) => {
        const category = suggestion.suggestion_type || 'other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(suggestion);
        return acc;
      }, {});
      
      // Flatten grouped suggestions (combine messages when same category)
      const combined = [];
      Object.keys(grouped).forEach(category => {
        const categorySuggestions = grouped[category];
        if (categorySuggestions.length === 1) {
          combined.push(categorySuggestions[0]);
        } else {
          // Combine multiple suggestions of same category
          const combinedMessage = categorySuggestions
            .map(s => s.message)
            .join(' • ');
          combined.push({
            ...categorySuggestions[0],
            message: combinedMessage,
            combinedCount: categorySuggestions.length,
            originalIds: categorySuggestions.map(s => s.id),
          });
        }
      });
      
      setSuggestions(combined.slice(0, maxSuggestions));
    } catch (error) {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (suggestionId, e) => {
    e?.stopPropagation();
    
    setDismissing(prev => new Set(prev).add(suggestionId));
    
    try {
      // Handle combined suggestions (dismiss all original IDs)
      const suggestion = suggestions.find(s => s.id === suggestionId || s.originalIds?.includes(suggestionId));
      const idsToDismiss = suggestion?.originalIds || [suggestionId];
      
      // Dismiss all related suggestions
      await Promise.all(idsToDismiss.map(id => dismissSuggestion(id)));
      
      // Remove from list
      setSuggestions(prev => prev.filter(s => 
        s.id !== suggestionId && !s.originalIds?.includes(suggestionId)
      ));
    } catch (error) {
    } finally {
      setDismissing(prev => {
        const next = new Set(prev);
        next.delete(suggestionId);
        return next;
      });
    }
  };

  const handleSuggestionClick = (suggestion) => {
    if (onSuggestionClick) {
      onSuggestionClick(suggestion);
    }
  };

  const getSuggestionIcon = (type) => {
    switch (type) {
      case 'tonight_prep':
        return Clock;
      case 'week_smoothing':
        return TrendingUp;
      case 'overload_warning':
        return AlertTriangle;
      case 'long_gap':
        return Calendar;
      case 'under_covered':
        return BookOpen;
      default:
        return Lightbulb;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'urgent':
        return colors.redBold;
      case 'warning':
        return colors.orangeBold;
      case 'info':
      default:
        return colors.blueBold;
    }
  };

  const getSeverityBg = (severity) => {
    switch (severity) {
      case 'urgent':
        return colors.redSoft;
      case 'warning':
        return colors.orangeSoft;
      case 'info':
      default:
        return colors.blueSoft;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Lightbulb size={14} color={colors.text} />
          <Text style={styles.title}>Smart Suggestions</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.muted} />
        </View>
      </View>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  const visibleSuggestions = isExpanded ? suggestions : suggestions.slice(0, 1);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Lightbulb size={14} color={colors.text} />
        <Text style={styles.title}>Smart Suggestions</Text>
          {suggestions.length > 1 && (
            <Text style={styles.countText}>({suggestions.length})</Text>
          )}
      </View>
        {suggestions.length > 1 && (
          isExpanded ? (
            <ChevronUp size={16} color={colors.muted} />
          ) : (
            <ChevronDown size={16} color={colors.muted} />
          )
        )}
      </TouchableOpacity>
      
      {isExpanded && (
        <View style={styles.suggestionsList}>
          {visibleSuggestions.map((suggestion) => {
          const Icon = getSuggestionIcon(suggestion.suggestion_type);
          const severityColor = getSeverityColor(suggestion.severity);
          const severityBg = getSeverityBg(suggestion.severity);
          const isDismissing = dismissing.has(suggestion.id);
          
          return (
            <TouchableOpacity
                key={suggestion.id || suggestion.originalIds?.[0]}
              style={[styles.suggestionCard, { borderLeftColor: severityColor }]}
              onPress={() => handleSuggestionClick(suggestion)}
              disabled={isDismissing}
              activeOpacity={0.7}
            >
              <View style={styles.suggestionContent}>
                <View style={[styles.iconContainer, { backgroundColor: severityBg }]}>
                    <Icon size={12} color={severityColor} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.suggestionMessage}>{suggestion.message}</Text>
                  {suggestion.child_id && (
                    <Text style={styles.childHint}>
                      {suggestion.child_name || 'Child'}
                    </Text>
                  )}
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={(e) => handleDismiss(suggestion.id || suggestion.originalIds?.[0], e)}
                  disabled={isDismissing}
                >
                  {isDismissing ? (
                    <ActivityIndicator size="small" color={colors.muted} />
                  ) : (
                    <X size={12} color={colors.muted} />
                  )}
                </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  countText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  suggestionsList: {
    gap: 6,
  },
  suggestionCard: {
    backgroundColor: colors.card,
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadows?.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  suggestionContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  iconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textContainer: {
    flex: 1,
  },
  suggestionMessage: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
    marginBottom: 2,
  },
  childHint: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '500',
  },
  dismissButton: {
    padding: 2,
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: 0,
  },
});

