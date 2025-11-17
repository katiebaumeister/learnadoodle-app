import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

const ConflictBubble = ({ 
  conflict, 
  onResolve, 
  onDismiss,
  style 
}) => {
  const [slideAnim] = useState(new Animated.Value(-100));
  const [fadeAnim] = useState(new Animated.Value(0));

  React.useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getConflictIcon = (type) => {
    switch (type) {
      case 'overlap': return '⏰';
      case 'rule_violation': return '🚫';
      case 'time_constraint': return '⏱️';
      case 'availability': return '📅';
      default: return '⚠️';
    }
  };

  const getConflictColor = (severity) => {
    switch (severity) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const handleQuickFix = async () => {
    try {
      if (conflict.quick_fix) {
        await conflict.quick_fix();
        onResolve?.(conflict);
      }
    } catch (error) {
      console.error('Error applying quick fix:', error);
    }
  };

  const handleMoveToValidSlot = async () => {
    try {
      if (conflict.valid_slot) {
        // Update the event to the suggested slot
        const { data, error } = await supabase
          .from('events')
          .update({
            start_ts: conflict.valid_slot.start,
            end_ts: conflict.valid_slot.end,
            updated_at: new Date().toISOString()
          })
          .eq('id', conflict.event_id)
          .select()
          .single();

        if (error) throw error;

        showAlert(
          'Event Moved',
          `Event moved to ${formatDate(conflict.valid_slot.start)} at ${formatTime(conflict.valid_slot.start)}`
        );

        onResolve?.(conflict);
      }
    } catch (error) {
      console.error('Error moving event:', error);
      showAlert('Error', 'Failed to move event. Please try again.');
    }
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          borderLeftColor: getConflictColor(conflict.severity),
          opacity: fadeAnim,
          transform: [{ translateX: slideAnim }],
        },
        style,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{getConflictIcon(conflict.type)}</Text>
        </View>
        
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{conflict.title}</Text>
          <Text style={styles.severity}>{conflict.severity.toUpperCase()}</Text>
        </View>
        
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={() => onDismiss?.(conflict)}
        >
          <Text style={styles.dismissButtonText}>×</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>{conflict.description}</Text>
        
        {conflict.affected_event && (
          <View style={styles.eventDetails}>
            <Text style={styles.eventTitle}>Event: {conflict.affected_event.title}</Text>
            <Text style={styles.eventTime}>
              {formatDate(conflict.affected_event.start_ts)} • {formatTime(conflict.affected_event.start_ts)} - {formatTime(conflict.affected_event.end_ts)}
            </Text>
          </View>
        )}

        {conflict.violated_rule && (
          <View style={styles.ruleDetails}>
            <Text style={styles.ruleTitle}>Violated Rule: {conflict.violated_rule.title}</Text>
            <Text style={styles.ruleDescription}>{conflict.violated_rule.description}</Text>
          </View>
        )}

        {conflict.valid_slot && (
          <View style={styles.suggestionDetails}>
            <Text style={styles.suggestionTitle}>Suggested Time:</Text>
            <Text style={styles.suggestionTime}>
              {formatDate(conflict.valid_slot.start)} • {formatTime(conflict.valid_slot.start)} - {formatTime(conflict.valid_slot.end)}
            </Text>
            <Text style={styles.suggestionReason}>{conflict.valid_slot.reason}</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {conflict.quick_fix && (
          <TouchableOpacity
            style={[styles.actionButton, styles.quickFixButton]}
            onPress={handleQuickFix}
          >
            <Text style={styles.quickFixButtonText}>
              {conflict.quick_fix_text || 'Quick Fix'}
            </Text>
          </TouchableOpacity>
        )}

        {conflict.valid_slot && (
          <TouchableOpacity
            style={[styles.actionButton, styles.moveButton]}
            onPress={handleMoveToValidSlot}
          >
            <Text style={styles.moveButtonText}>Move to Valid Slot</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionButton, styles.dismissActionButton]}
          onPress={() => onDismiss?.(conflict)}
        >
          <Text style={styles.dismissActionButtonText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginVertical: 4,
    marginHorizontal: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  iconContainer: {
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  severity: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 2,
  },
  dismissButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  description: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  eventDetails: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  ruleDetails: {
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  ruleTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#dc2626',
    marginBottom: 4,
  },
  ruleDescription: {
    fontSize: 12,
    color: '#991b1b',
  },
  suggestionDetails: {
    backgroundColor: '#f0f9ff',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0369a1',
    marginBottom: 4,
  },
  suggestionTime: {
    fontSize: 12,
    color: '#075985',
    marginBottom: 4,
  },
  suggestionReason: {
    fontSize: 12,
    color: '#075985',
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  quickFixButton: {
    backgroundColor: '#10b981',
  },
  quickFixButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  moveButton: {
    backgroundColor: '#3b82f6',
  },
  moveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  dismissActionButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  dismissActionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
});

export default ConflictBubble;
