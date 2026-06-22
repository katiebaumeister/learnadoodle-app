import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { formatTimeLabel } from '../../../lib/create/eventConflictHelpers';
import ChildAvatarCluster from '../../ui/ChildAvatarCluster';

export default function EventConflictBanner({
  conflict,
  onUseSuggestion,
  onIgnore,
  onDismiss,
  familyChildren = [],
}) {
  if (!conflict || !Array.isArray(conflict.conflicts) || conflict.conflicts.length === 0) {
    return null;
  }

  const first = conflict.conflicts[0];
  const extraCount = conflict.conflicts.length - 1;
  const suggestion = conflict.suggestion;
  const suggestionLabel = suggestion
    ? `${formatTimeLabel(suggestion.start)}–${formatTimeLabel(suggestion.end)}`
    : null;
  const firstChildIds = Array.isArray(first.childIds) ? first.childIds : [];

  return (
    <View style={styles.conflictCard}>
      <View style={styles.conflictHeader}>
        <View style={styles.conflictIcon}>
          <Text style={styles.conflictIconText}>!</Text>
        </View>
        <Text style={styles.conflictTitle}>Scheduling conflict</Text>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss conflict"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.conflictBody}>
        {firstChildIds.length > 0 ? (
          <ChildAvatarCluster
            childIds={firstChildIds}
            familyChildren={familyChildren}
            size={22}
            style={styles.avatarCluster}
          />
        ) : null}
        <Text style={styles.conflictText}>
          This overlaps with <Text style={styles.conflictEmphasis}>{first.title}</Text> from{' '}
          {formatTimeLabel(first.start)}–{formatTimeLabel(first.end)}
          {extraCount > 0 ? ` and ${extraCount} other event${extraCount > 1 ? 's' : ''}` : ''}.
        </Text>
      </View>

      {suggestion ? (
        <View style={styles.suggestionRow}>
          <Text style={styles.suggestionText}>
            Suggested fix: move to <Text style={styles.suggestionEmphasis}>{suggestionLabel}</Text>
          </Text>
          <TouchableOpacity
            style={styles.useTimeButton}
            onPress={() => onUseSuggestion?.(suggestion)}
            accessibilityRole="button"
            accessibilityLabel={`Use suggested time ${suggestionLabel}`}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.useTimeText}>Use time</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.noSlotText}>
          No free slot later today — try a different day or time.
        </Text>
      )}

      <TouchableOpacity
        onPress={onIgnore}
        style={styles.ignoreLinkWrap}
        accessibilityRole="button"
        accessibilityLabel="Ignore conflict and save anyway"
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Text style={styles.ignoreLink}>Ignore and save anyway</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  conflictCard: {
    marginTop: 18,
    marginBottom: 4,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DDE8F5',
    borderLeftWidth: 4,
    borderLeftColor: '#F6C453',
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  conflictIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4CC',
  },
  conflictIconText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B7791F',
    lineHeight: 16,
  },
  conflictTitle: {
    flex: 1,
    fontWeight: '700',
    fontSize: 14,
    color: '#1F2937',
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 16,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  conflictBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  avatarCluster: {
    flexShrink: 0,
  },
  conflictText: {
    flex: 1,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  conflictEmphasis: {
    fontWeight: '700',
    color: '#1F2937',
  },
  suggestionRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5EEF8',
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
  },
  suggestionEmphasis: {
    fontWeight: '700',
    color: '#1F2937',
  },
  useTimeButton: {
    backgroundColor: '#81C1E1',
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  useTimeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  noSlotText: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
  },
  ignoreLinkWrap: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  ignoreLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
});
