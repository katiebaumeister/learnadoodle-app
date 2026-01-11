import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Heart, CheckCircle, Clock } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getReassuranceMessage } from '../../lib/apiClient';

/**
 * Emotional Reassurance Hook Component
 * Shows supportive micro-messages when parents mark things late, skip items, etc.
 * Usage: <ReassuranceHook childId={childId} context="late_completion" />
 */
export default function ReassuranceHook({ childId, context = 'general', onDismiss }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (childId && context) {
      loadMessage();
    }
  }, [childId, context]);

  const loadMessage = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const { data: result, error } = await getReassuranceMessage(childId, context);
      if (error) throw error;
      setData(result);
    } catch (error) {
      // Don't show error toast - this is a background feature
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    if (onDismiss) onDismiss();
  };

  if (!visible || !data || loading) {
    return null;
  }

  const toneIcons = {
    reassuring: Heart,
    supportive: CheckCircle,
    encouraging: Clock,
  };

  const IconComponent = toneIcons[data.tone] || Heart;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <IconComponent size={16} color={colors.accent} />
        <Text style={styles.message}>{data.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  message: {
    fontSize: 13,
    color: '#92400e',
    flex: 1,
    lineHeight: 18,
  },
});

