'use client';

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CheckCircle } from 'lucide-react';

export type AppliedPanelProps = {
  appliedCount: number;
  labels: string[];
  onViewAll?: () => void;
};

const AppliedPanel: React.FC<AppliedPanelProps> = ({ appliedCount, labels, onViewAll }) => {
  const preview = labels.slice(0, 5);
  const remaining = Math.max(appliedCount - preview.length, 0);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <CheckCircle size={28} color="#22c55e" />
      </View>
      <Text style={styles.title}>Applied {appliedCount} change{appliedCount === 1 ? '' : 's'}</Text>
      <View style={styles.list}>
        {preview.map(label => (
          <Text key={label} style={styles.listItem}>• {label}</Text>
        ))}
        {remaining > 0 && (
          <Text style={styles.listItem}>• and {remaining} more…</Text>
        )}
      </View>
      <TouchableOpacity style={styles.viewLink} onPress={onViewAll}>
        <Text style={styles.viewLinkText}>View all in Activity</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#d1fae5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065f46',
    fontFamily: Platform.OS === 'web' ? 'Outfit' : undefined,
  },
  list: {
    gap: 6,
  },
  listItem: {
    fontSize: 13,
    color: '#0f172a',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
  viewLink: {
    marginTop: 4,
  },
  viewLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
});

export default AppliedPanel;
