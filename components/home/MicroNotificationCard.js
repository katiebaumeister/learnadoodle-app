/**
 * Micro Notification Card
 * Compact, dismissible notification cards (2 max visible)
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { X } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function MicroNotificationCard({
  id,
  message,
  onDismiss,
  onPress,
  type = 'perspective', // 'perspective' | 'nudge'
}) {
  const [dismissed, setDismissed] = useState(false);
  
  const storageKey = `micro_notification_${id}_${new Date().toISOString().split('T')[0]}`;
  
  // Check if already dismissed
  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'true') {
        setDismissed(true);
      }
    }
  }, [storageKey]);
  
  const handleDismiss = (e) => {
    e.stopPropagation();
    setDismissed(true);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, 'true');
    }
    onDismiss?.();
  };
  
  if (dismissed) return null;
  
  const typeColors = {
    perspective: { bg: colors.orangeSoft, border: colors.orangeBold },
    nudge: { bg: colors.violetSoft, border: colors.violetBold },
  };
  
  const colors_ = typeColors[type] || typeColors.perspective;
  
  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors_.bg, borderColor: colors_.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.message} numberOfLines={1}>{message}</Text>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={handleDismiss}
      >
        <X size={14} color={colors.text} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flex: 1,
    minHeight: 36,
  },
  message: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  dismissButton: {
    padding: 2,
    flexShrink: 0,
  },
});

