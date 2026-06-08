import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Sparkles } from 'lucide-react';
import { familyCardStyle } from '../family/familyDesignTokens';
import { getPlannerCalendarLegendItems } from './plannerListTableUtils';
import { PlannerUpcomingWeekSummary } from './PlannerSummaryCards';

export default function PlannerRightRail({
  weekEventCount = null,
  weekAssignmentCount = null,
  onViewWeek,
  onOpenAskAI,
}) {
  const legendItems = getPlannerCalendarLegendItems();

  return (
    <View style={styles.rail}>
      <PlannerUpcomingWeekSummary
        weekEventCount={weekEventCount}
        weekAssignmentCount={weekAssignmentCount}
        onViewWeek={onViewWeek}
      />

      <View style={styles.card}>
        <View style={styles.betaRow}>
          <Sparkles size={16} color="#7C3AED" />
          <Text style={styles.cardTitle}>AI Planning Assistant</Text>
          <View style={styles.betaPill}>
            <Text style={styles.betaText}>BETA</Text>
          </View>
        </View>
        <Text style={styles.promptHint}>Can we take Friday off?</Text>
        <Text style={styles.promptHint}>Move piano to Thursday?</Text>
        <TouchableOpacity
          style={styles.askRow}
          onPress={onOpenAskAI}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <TextInput
            editable={false}
            pointerEvents="none"
            style={styles.askInput}
            placeholder="Ask a planning question..."
            placeholderTextColor="rgba(15, 23, 42, 0.4)"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Calendar Legend</Text>
        {legendItems.map((item) => (
          <View key={item.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 280,
    flexShrink: 0,
    gap: 16,
    paddingBottom: 16,
    ...(Platform.OS === 'web' && {
      position: 'relative',
      zIndex: 10,
    }),
  },
  card: {
    ...familyCardStyle,
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  betaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  betaPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
  },
  betaText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C3AED',
  },
  promptHint: {
    fontSize: 13,
    color: 'rgba(15, 23, 42, 0.55)',
  },
  askRow: {
    marginTop: 4,
  },
  askInput: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendLabel: {
    fontSize: 13,
    color: '#374151',
  },
});
