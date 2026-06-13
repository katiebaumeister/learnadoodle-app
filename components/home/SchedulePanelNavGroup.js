import React from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function SchedulePanelNavGroup({
  onPrevDay,
  onNextDay,
  styles,
}) {
  return (
    <View style={styles.dayNavButtonGroup}>
      <TouchableOpacity
        style={styles.dayNavButton}
        onPress={onPrevDay}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <ChevronLeft size={16} color="#64748b" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dayNavButton}
        onPress={onNextDay}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <ChevronRight size={16} color="#64748b" />
      </TouchableOpacity>
    </View>
  );
}
