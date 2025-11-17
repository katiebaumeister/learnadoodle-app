'use client';

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import { CheckCircle } from 'lucide-react';

export type EmptyPanelProps = {
  zeroReason?: string;
  onAction?: (action: 'scan6' | 'topoff' | 'tune') => void;
};

const EmptyPanel: React.FC<EmptyPanelProps> = ({ zeroReason, onAction }) => {
  const handleAction = (action: 'scan6' | 'topoff' | 'tune') => {
    onAction?.(action);
  };

  const openLink = (path: string) => {
    if (typeof window !== 'undefined') {
      window.location.href = path;
    } else {
      Linking.openURL(path);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <CheckCircle size={40} color="#22c55e" />
      </View>
      <Text style={styles.title}>Everything’s already balanced.</Text>
      <Text style={styles.subtitle}>
        {zeroReason || 'No conflicts or deficits in the selected window.'}
      </Text>

      {zeroReason && (
        <View style={styles.reasonChip}>
          <Text style={styles.reasonLabel}>Reason</Text>
          <Text style={styles.reasonText}>{zeroReason}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => handleAction('scan6')}>
          <Text style={styles.secondaryText}>Scan next 6 weeks</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => handleAction('topoff')}>
          <Text style={styles.secondaryText}>Top-off from Backlog</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => handleAction('tune')}>
          <Text style={styles.secondaryText}>Tune planner</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.helperBlock}>
        <Text style={styles.helperTitle}>What can I do?</Text>
        <View style={styles.helperActions}>
          <TouchableOpacity style={styles.helperButton} onPress={() => openLink('/planner/backlog')}>
            <Text style={styles.helperText}>View Backlog</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.helperButton} onPress={() => openLink('/settings/subjects')}>
            <Text style={styles.helperText}>Set Targets</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    fontFamily: Platform.OS === 'web' ? 'Outfit' : undefined,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 20,
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
  },
  reasonText: {
    fontSize: 12,
    color: '#475569',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryText: {
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
  helperBlock: {
    width: '100%',
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    gap: 8,
  },
  helperTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
  helperActions: {
    flexDirection: 'row',
    gap: 8,
  },
  helperButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
  },
  helperText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
});

export default EmptyPanel;
