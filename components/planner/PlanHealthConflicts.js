import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { AlertTriangle } from 'lucide-react';
import {
  loadDismissedConflicts,
  normalizeConflictEventId,
  removeDismissedConflictByEventId,
  upsertDismissedConflict,
} from '../../lib/plannerDismissedConflicts';

function readActiveConflict() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const active = window.__ldActiveConflictBanner;
  if (!active?.visible || !active?.eventId) return null;
  return active;
}

export default function PlanHealthConflicts({ onOpenCalendar }) {
  const [dismissedConflicts, setDismissedConflicts] = useState(() => loadDismissedConflicts());
  const [activeConflict, setActiveConflict] = useState(() => readActiveConflict());

  const refreshDismissed = useCallback(() => {
    setDismissedConflicts(loadDismissedConflicts());
  }, []);

  const refreshActive = useCallback(() => {
    setActiveConflict(readActiveConflict());
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    refreshDismissed();
    refreshActive();

    const handleDismissed = (event) => {
      const detail = event?.detail || {};
      if (!detail?.eventId) return;
      setDismissedConflicts(upsertDismissedConflict(detail));
      refreshActive();
    };

    const handleResolved = (event) => {
      const resolvedId = event?.detail?.eventId || '';
      if (!resolvedId) return;
      setDismissedConflicts(removeDismissedConflictByEventId(resolvedId));
      refreshActive();
    };

    const handleActive = () => {
      refreshActive();
    };

    window.addEventListener('plannerDragConflictDismissed', handleDismissed);
    window.addEventListener('plannerDragConflictResolved', handleResolved);
    window.addEventListener('eventRescheduled', handleResolved);
    window.addEventListener('plannerDragConflictActive', handleActive);
    window.addEventListener('clearConflictBanner', refreshActive);

    return () => {
      window.removeEventListener('plannerDragConflictDismissed', handleDismissed);
      window.removeEventListener('plannerDragConflictResolved', handleResolved);
      window.removeEventListener('eventRescheduled', handleResolved);
      window.removeEventListener('plannerDragConflictActive', handleActive);
      window.removeEventListener('clearConflictBanner', refreshActive);
    };
  }, [refreshActive, refreshDismissed]);

  const reopenConflict = useCallback((item) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !item?.eventId) return;
    window.dispatchEvent(
      new CustomEvent('plannerDragConflictReopen', {
        detail: {
          eventId: item.eventId,
          conflictCount: item.conflictCount || 0,
          eventTitle: item.eventTitle || 'Event',
          conflictMessage: item.conflictMessage || null,
          conflictEvent: item.conflictEvent || null,
          movedEvent: item.movedEvent || null,
          timestamp: Date.now(),
        },
      }),
    );
    onOpenCalendar?.();
  }, [onOpenCalendar]);

  const hasActive = !!activeConflict;
  const hasDismissed = dismissedConflicts.length > 0;
  if (!hasActive && !hasDismissed) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conflicts</Text>
        <View style={styles.divider} />
        <Text style={styles.emptyText}>No schedule conflicts right now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Conflicts</Text>
      <View style={styles.divider} />

      {hasActive ? (
        <View style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <AlertTriangle size={16} color="#B45309" />
            <Text style={styles.activeLabel}>Active conflict</Text>
          </View>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {activeConflict.eventTitle || 'Event'}
          </Text>
          <Text style={styles.itemMessage} numberOfLines={2}>
            {activeConflict.conflictMessage || `Conflicts: ${activeConflict.conflictCount || 1}`}
          </Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => reopenConflict({
              eventId: activeConflict.eventId,
              conflictCount: activeConflict.conflictCount,
              eventTitle: activeConflict.eventTitle,
              conflictMessage: activeConflict.conflictMessage,
              conflictEvent: activeConflict.conflictEvent,
              movedEvent: activeConflict.movedEvent,
            })}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.actionButtonText}>Review on calendar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {hasDismissed ? (
        <View style={hasActive ? styles.dismissedBlock : null}>
          {hasActive ? (
            <Text style={styles.subheading}>
              Dismissed ({dismissedConflicts.length})
            </Text>
          ) : null}
          {dismissedConflicts.map((item) => (
            <TouchableOpacity
              key={`${normalizeConflictEventId(item.eventId)}-${item.timestamp}`}
              style={styles.dismissedRow}
              onPress={() => reopenConflict(item)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.eventTitle || 'Event'}
              </Text>
              <Text style={styles.itemMessage} numberOfLines={2}>
                {item.conflictMessage || `Conflicts: ${item.conflictCount || 1}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 32,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
    marginTop: 8,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(15,23,42,0.62)',
    lineHeight: 18,
  },
  activeCard: {
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    padding: 12,
    marginBottom: 12,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  activeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dismissedBlock: {
    marginTop: 4,
  },
  subheading: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.62)',
    marginBottom: 8,
  },
  dismissedRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemMessage: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 16,
  },
  actionButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(107,179,232,0.12)',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
});
