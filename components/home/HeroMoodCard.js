/**
 * Hero Mood Card
 * Co-Star style emotional anchor - single line mood-setting card
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { X } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function HeroMoodCard({ 
  message = "Today is a good day for slow learning and noticing small wins.",
  onDismiss 
}) {
  const [dismissed, setDismissed] = useState(false);
  
  const storageKey = `hero_mood_${new Date().toISOString().split('T')[0]}`;
  
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
  
  if (dismissed || !message) return null;
  
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={handleDismiss}
      >
        <X size={12} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F7F2FF', // Very soft lilac
    borderRadius: colors.radiusMd,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    lineHeight: 22,
  },
  dismissButton: {
    padding: 2,
    marginLeft: 12,
    flexShrink: 0,
    opacity: 0.5,
  },
});

