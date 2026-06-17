/**
 * @deprecated Chatbot setup checklist — replaced by SetupGuideCard on Home.
 * Do not wire into SearchModal or WebLayout.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronRight } from 'lucide-react';
import {
  DOODLE_SETUP_STEPS,
  loadSetupProgress,
  toggleSetupStep,
  getSetupCompletedCount,
  isSetupGuideComplete,
} from '../../lib/doodleSetupGuide';

export default function DoodleSetupGuidePanel({ userId, onNavigate, onGoToChat, showCompletedChecklist = false }) {
  const [progressTick, setProgressTick] = useState(0);
  const progress = useMemo(() => loadSetupProgress(userId), [userId, progressTick]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => setProgressTick((t) => t + 1);
    window.addEventListener('doodleSetupProgressChanged', handler);
    return () => window.removeEventListener('doodleSetupProgressChanged', handler);
  }, []);

  const total = DOODLE_SETUP_STEPS.length;
  const done = getSetupCompletedCount(userId);
  const complete = userId && isSetupGuideComplete(userId);
  const pct = total ? Math.round((done / total) * 100) : 0;

  if (complete && !showCompletedChecklist) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Setup guide</Text>
      <Text style={styles.subtitle}>
        {showCompletedChecklist
          ? 'Here’s your checklist again — tap a step to jump there, or use Undo to adjust.'
          : 'Visit each area once — we check them off when you land there.'}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.list}>
        {DOODLE_SETUP_STEPS.map((step) => {
          const checked = !!progress[step.id];
          return (
            <View key={step.id} style={styles.row}>
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() => onNavigate?.(step.navigateTarget)}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <View style={[styles.dot, checked && styles.dotDone]} />
                <Text style={[styles.rowLabel, checked && styles.rowLabelDone]} numberOfLines={2}>
                  {step.label}
                </Text>
                <ChevronRight size={16} color={checked ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
              {checked ? (
                <TouchableOpacity
                  style={styles.undoBtn}
                  onPress={() => toggleSetupStep(userId, step.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.undoText}>Undo</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
      <TouchableOpacity
        style={styles.goChatBtn}
        onPress={onGoToChat}
        activeOpacity={0.8}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Text style={styles.goChatText}>Go to chat</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
    fontFamily: Platform.OS === 'web' ? 'system-ui, -apple-system, Segoe UI, sans-serif' : undefined,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
    lineHeight: 16,
  },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#7c3aed',
  },
  list: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#cbd5e1',
    marginRight: 10,
  },
  dotDone: {
    backgroundColor: '#22c55e',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 20,
  },
  rowLabelDone: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  undoBtn: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  undoText: {
    fontSize: 12,
    color: '#a78bfa',
    fontWeight: '600',
  },
  goChatBtn: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  goChatText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
});
