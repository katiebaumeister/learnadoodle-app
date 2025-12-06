/**
 * Home Tile: Reflection Prompt
 * Shows child-specific reflection prompts
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles, ArrowRight } from 'lucide-react';
import { colors } from '../../../theme/colors';

export default function HomeTileReflectionPrompt({ data, onNavigate, selectedChildId, children = [] }) {
  const relevantChild = selectedChildId && data?.byChild?.find(c => c.childId === selectedChildId);
  const prompt = relevantChild?.prompt || data?.byChild?.[0]?.prompt || "What did you learn today?";
  
  const childName = relevantChild && children.find(c => c.id === relevantChild.childId)
    ? (children.find(c => c.id === relevantChild.childId).first_name || children.find(c => c.id === relevantChild.childId).name)
    : (data?.byChild?.[0] && children.find(c => c.id === data.byChild[0].childId)
      ? (children.find(c => c.id === data.byChild[0].childId).first_name || children.find(c => c.id === data.byChild[0].childId).name)
      : null);
  
  const targetChildId = relevantChild?.childId || data?.byChild?.[0]?.childId;
  
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <Sparkles size={16} color={colors.indigo} />
        <Text style={styles.tileTitle}>Reflection</Text>
      </View>
      <Text style={styles.tilePrompt}>{prompt}</Text>
      {onNavigate && targetChildId && (
        <TouchableOpacity
          style={styles.tileButton}
          onPress={() => onNavigate(`/records?tab=notes&child=${targetChildId}&action=new`)}
        >
          <Text style={styles.tileButtonText}>Add reflection</Text>
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
  tilePrompt: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 12,
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

