/**
 * Home Tile: Areas of Mastery
 * Shows top-performing subjects for children
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { colors } from '../../../theme/colors';

export default function HomeTileAreasOfMastery({ data, onNavigate, selectedChildId, children = [] }) {
  const relevantChild = selectedChildId && data?.byChild?.find(c => c.childId === selectedChildId);
  const subjects = relevantChild?.subjects || [];
  
  if (!subjects || subjects.length === 0) {
    return (
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <TrendingUp size={16} color={colors.textSecondary} />
          <Text style={styles.tileTitle}>Areas of Mastery</Text>
        </View>
        <Text style={styles.tileEmptyText}>Keep learning to see mastery areas!</Text>
      </View>
    );
  }
  
  const childName = relevantChild && children.find(c => c.id === relevantChild.childId)
    ? (children.find(c => c.id === relevantChild.childId).first_name || children.find(c => c.id === relevantChild.childId).name)
    : null;
  
  const subjectsText = subjects.slice(0, 2).join(' & ');
  const displayText = childName
    ? `${childName} is shining in ${subjectsText}`
    : `Strong areas: ${subjectsText}`;
  
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <TrendingUp size={16} color={colors.green} />
        <Text style={styles.tileTitle}>Areas of Mastery</Text>
      </View>
      <Text style={styles.tileText}>{displayText}</Text>
      {onNavigate && (
        <TouchableOpacity
          style={styles.tileButton}
          onPress={() => onNavigate(`/intelligence?tab=analytics&child=${selectedChildId || 'all'}`)}
        >
          <Text style={styles.tileButtonText}>Open analytics</Text>
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

