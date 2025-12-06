/**
 * Home Tile: Missing Logs
 * Shows count of missing attendance logs for the week
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock, ArrowRight } from 'lucide-react';
import { colors } from '../../../theme/colors';

export default function HomeTileMissingLogs({ data, onNavigate, selectedChildId, children = [] }) {
  if (!data || data.totalMissingLogs === 0) {
    return (
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <Clock size={16} color={colors.textSecondary} />
          <Text style={styles.tileTitle}>Missing Logs</Text>
        </View>
        <Text style={styles.tileEmptyText}>All caught up! No missing logs this week.</Text>
      </View>
    );
  }
  
  const relevantChild = selectedChildId && data.byChild.find(c => c.childId === selectedChildId);
  const displayText = relevantChild
    ? `${relevantChild.missingCount} missing log${relevantChild.missingCount !== 1 ? 's' : ''} this week`
    : `${data.totalMissingLogs} missing log${data.totalMissingLogs !== 1 ? 's' : ''} this week`;
  
  const childName = relevantChild && children.find(c => c.id === relevantChild.childId)
    ? (children.find(c => c.id === relevantChild.childId).first_name || children.find(c => c.id === relevantChild.childId).name)
    : null;
  
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <Clock size={16} color={colors.orange} />
        <Text style={styles.tileTitle}>Missing Logs</Text>
      </View>
      <Text style={styles.tileText}>
        {childName ? `${childName} has ${displayText}` : `You're missing ${displayText}.`}
      </Text>
      {onNavigate && (
        <TouchableOpacity
          style={styles.tileButton}
          onPress={() => onNavigate(`/records?tab=attendance&child=${selectedChildId || 'all'}`)}
        >
          <Text style={styles.tileButtonText}>Open Attendance & Logs</Text>
          <ArrowRight size={14} color={colors.indigo} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tileText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 12,
  },
  tileEmptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  tileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  tileButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.indigo,
  },
});

