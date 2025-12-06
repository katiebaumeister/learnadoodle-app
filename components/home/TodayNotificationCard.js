/**
 * Today Notification Card
 * Dismissible notification cards for Home screen
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { X, ArrowRight } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function TodayNotificationCard({
  id,
  title,
  body,
  ctaLabel,
  onCTA,
  onDismiss,
  type = 'info', // 'info' | 'warning' | 'nudge' | 'compliance'
}) {
  const [dismissed, setDismissed] = useState(false);
  
  const storageKey = `home_notification_${id}_${new Date().toISOString().split('T')[0]}`;
  
  // Check if already dismissed
  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'true') {
        setDismissed(true);
      }
    }
  }, [storageKey]);
  
  const handleDismiss = () => {
    setDismissed(true);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, 'true');
    }
    onDismiss?.();
  };
  
  if (dismissed) return null;
  
  const typeColors = {
    info: { bg: colors.blueSoft, border: colors.blueBold, text: colors.text },
    warning: { bg: colors.orangeSoft, border: colors.orangeBold, text: colors.text },
    nudge: { bg: colors.violetSoft, border: colors.violetBold, text: colors.text },
    compliance: { bg: colors.yellowSoft, border: colors.yellowBold, text: colors.text },
  };
  
  const colors_ = typeColors[type] || typeColors.info;
  
  return (
    <View style={[styles.container, { backgroundColor: colors_.bg, borderColor: colors_.border }]}>
      <View style={styles.content}>
        <View style={styles.textContent}>
          <Text style={[styles.title, { color: colors_.text }]}>{title}</Text>
          {body && <Text style={[styles.body, { color: colors_.text }]}>{body}</Text>}
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
        >
          <X size={16} color={colors_.text} />
        </TouchableOpacity>
      </View>
      {ctaLabel && onCTA && (
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={onCTA}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <ArrowRight size={14} color={colors.indigo} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  textContent: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    lineHeight: 16,
  },
  dismissButton: {
    padding: 4,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.indigo,
  },
});

