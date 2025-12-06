/**
 * SuggestionActionModal Component
 * Contextual modal for handling suggestion actions
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { X, Calendar, TrendingUp, AlertTriangle, Clock, BookOpen } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function SuggestionActionModal({
  visible,
  suggestion,
  onClose,
  onNavigateToPlanner,
  onOpenSmoothing,
  onOpenReschedule,
}) {
  if (!suggestion) return null;

  const handleAction = () => {
    switch (suggestion.suggestion_type) {
      case 'tonight_prep':
        // Navigate to planner for tomorrow
        if (onNavigateToPlanner && suggestion.context_json?.tomorrow_date) {
          onNavigateToPlanner(suggestion.context_json.tomorrow_date);
        }
        break;
      case 'week_smoothing':
        // Open smoothing/reschedule modal
        if (onOpenSmoothing) {
          onOpenSmoothing(suggestion);
        } else if (onNavigateToPlanner && suggestion.context_json?.week_start) {
          onNavigateToPlanner(suggestion.context_json.week_start);
        }
        break;
      case 'overload_warning':
        // Navigate to planner for the overloaded day
        if (onNavigateToPlanner && suggestion.context_json?.date) {
          onNavigateToPlanner(suggestion.context_json.date);
        }
        break;
      case 'long_gap':
      case 'under_covered':
        // Navigate to planner to add sessions
        if (onNavigateToPlanner) {
          onNavigateToPlanner();
        }
        break;
      default:
        if (onNavigateToPlanner) {
          onNavigateToPlanner();
        }
    }
    onClose();
  };

  const getActionLabel = () => {
    switch (suggestion.suggestion_type) {
      case 'tonight_prep':
        return 'View Tomorrow\'s Schedule';
      case 'week_smoothing':
        return 'Smooth Week';
      case 'overload_warning':
        return 'Reschedule Day';
      case 'long_gap':
      case 'under_covered':
        return 'Add Sessions';
      default:
        return 'View Planner';
    }
  };

  const getIcon = () => {
    switch (suggestion.suggestion_type) {
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
        return Calendar;
    }
  };

  const Icon = getIcon();
  const severityColor = suggestion.severity === 'urgent' ? colors.redBold : 
                        suggestion.severity === 'warning' ? colors.orangeBold : 
                        colors.blueBold;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: severityColor + '20' }]}>
              <Icon size={24} color={severityColor} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Suggestion</Text>
              {suggestion.child_name && (
                <Text style={styles.subtitle}>{suggestion.child_name}</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <Text style={styles.message}>{suggestion.message}</Text>

            {suggestion.context_json && Object.keys(suggestion.context_json).length > 0 && (
              <View style={styles.contextSection}>
                <Text style={styles.contextTitle}>Details</Text>
                {suggestion.context_json.week_start && (
                  <Text style={styles.contextText}>
                    Week: {new Date(suggestion.context_json.week_start).toLocaleDateString()}
                  </Text>
                )}
                {suggestion.context_json.date && (
                  <Text style={styles.contextText}>
                    Date: {new Date(suggestion.context_json.date).toLocaleDateString()}
                  </Text>
                )}
                {suggestion.context_json.threshold_minutes && (
                  <Text style={styles.contextText}>
                    Threshold: {Math.round(suggestion.context_json.threshold_minutes / 60)} hours
                  </Text>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: severityColor }]}
              onPress={handleAction}
            >
              <Text style={styles.actionButtonText}>{getActionLabel()}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  message: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 16,
  },
  contextSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
  },
  contextTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contextText: {
    fontSize: 13,
    color: colors.text,
    marginBottom: 4,
  },
  actions: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.card,
  },
});

