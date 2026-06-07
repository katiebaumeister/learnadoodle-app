import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function ModalAdvancedSection({
  title = 'Advanced',
  children,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Text style={styles.title}>{expanded ? '▲' : '▼'} {title}</Text>
        {expanded ? (
          <ChevronUp size={16} color="#94A3B8" />
        ) : (
          <ChevronDown size={16} color="#94A3B8" />
        )}
      </TouchableOpacity>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  body: {
    gap: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
});
