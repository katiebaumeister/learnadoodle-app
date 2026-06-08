import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Sparkles } from 'lucide-react';
import PlanHealthBanner from './PlanHealthBanner';
import { familyCardStyle } from '../family/familyDesignTokens';

const LEGEND = [
  { label: 'Academic', color: '#059669' },
  { label: 'Science', color: '#EC4899' },
  { label: 'Activities', color: '#2563EB' },
  { label: 'Writing', color: '#7C3AED' },
  { label: 'History', color: '#EA580C' },
  { label: 'Other', color: '#94A3B8' },
];

function readConflictSummary() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const active = window.__ldActiveConflictBanner;
  if (!active?.visible) return null;
  return active.eventTitle || active.conflictMessage || '1 conflict';
}

export default function PlannerRightRail({
  familyId,
  preloadedPlanHealth,
  onFixGap,
  onOpenAskAI,
}) {
  const [conflictSummary, setConflictSummary] = useState(() => readConflictSummary());

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const refresh = () => setConflictSummary(readConflictSummary());
    window.addEventListener('plannerDragConflictActive', refresh);
    window.addEventListener('plannerDragConflictResolved', refresh);
    window.addEventListener('clearConflictBanner', refresh);
    return () => {
      window.removeEventListener('plannerDragConflictActive', refresh);
      window.removeEventListener('plannerDragConflictResolved', refresh);
      window.removeEventListener('clearConflictBanner', refresh);
    };
  }, []);

  return (
    <View style={styles.rail}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Family Health</Text>
        <PlanHealthBanner familyId={familyId} visible initialHealth={preloadedPlanHealth} />
        {conflictSummary ? (
          <View style={styles.alertBox}>
            <Text style={styles.alertText}>{conflictSummary}</Text>
            <TouchableOpacity onPress={onFixGap} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={styles.alertAction}>Fix Gap</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

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
        {LEGEND.map((item) => (
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
  alertBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    gap: 6,
  },
  alertText: {
    fontSize: 13,
    color: '#0F172A',
    lineHeight: 18,
  },
  alertAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
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
