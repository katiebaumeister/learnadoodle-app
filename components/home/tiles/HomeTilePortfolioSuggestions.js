/**
 * Home Tile: Portfolio Suggestions
 * Shows count of untagged or ungrouped evidence
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FileText, ArrowRight } from 'lucide-react';
import { colors } from '../../../theme/colors';

export default function HomeTilePortfolioSuggestions({ data, onNavigate, selectedChildId, children = [] }) {
  if (!data || data.totalUngrouped === 0) {
    return (
      <View style={styles.tile}>
        <View style={styles.tileHeader}>
          <FileText size={16} color={colors.textSecondary} />
          <Text style={styles.tileTitle}>Portfolio</Text>
        </View>
        <Text style={styles.tileEmptyText}>All artifacts are organized!</Text>
      </View>
    );
  }
  
  const relevantChild = selectedChildId && data.byChild.find(c => c.childId === selectedChildId);
  const displayText = relevantChild
    ? `${relevantChild.count} new artifact${relevantChild.count !== 1 ? 's' : ''} need${relevantChild.count === 1 ? 's' : ''} tagging`
    : `${data.totalUngrouped} artifact${data.totalUngrouped !== 1 ? 's' : ''} aren't tagged yet`;
  
  const childName = relevantChild && children.find(c => c.id === relevantChild.childId)
    ? (children.find(c => c.id === relevantChild.childId).first_name || children.find(c => c.id === relevantChild.childId).name)
    : null;
  
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <FileText size={16} color={colors.indigo} />
        <Text style={styles.tileTitle}>Portfolio</Text>
      </View>
      <Text style={styles.tileText}>
        {childName ? `${childName} has ${displayText}` : displayText}
      </Text>
      {onNavigate && (
        <TouchableOpacity
          style={styles.tileButton}
          onPress={() => onNavigate(`/records?tab=portfolio&child=${selectedChildId || 'all'}`)}
        >
          <Text style={styles.tileButtonText}>Review portfolio</Text>
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

