/**
 * Assignment activity items for subject bulletin stream.
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { ClipboardList } from 'lucide-react';
import { formatBulletinTimestamp } from '../../lib/services/bulletinClient';
import useAssignmentActivity from './useAssignmentActivity';
import AssignmentActivityStreamItem from './AssignmentActivityStreamItem';

export default function AssignmentActivityFeed({
  familyId,
  subjectId = null,
  limit = 20,
  hideHeading = false,
  onItemPress = null,
  streamLayout = false,
  familyChildren = [],
  profileMap = new Map(),
}) {
  const { items, loading } = useAssignmentActivity(familyId, subjectId, limit, true);

  if (loading) {
    return (
      <View style={streamLayout ? styles.streamLoadingWrap : styles.loadingWrap}>
        <ActivityIndicator size="small" color="#94A3B8" />
      </View>
    );
  }

  if (items.length === 0) return null;

  if (streamLayout) {
    const chronological = [...items].reverse();
    return (
      <>
        {chronological.map((item) => (
          <AssignmentActivityStreamItem
            key={item.id}
            item={item}
            children={familyChildren}
            profileMap={profileMap}
            onPress={onItemPress}
          />
        ))}
      </>
    );
  }

  return (
    <View style={styles.wrap}>
      {!hideHeading ? <Text style={styles.heading}>Assignment activity</Text> : null}
      {items.map((item) => {
        const clickable = Boolean(onItemPress && item.assignmentId);
        const RowWrap = clickable ? TouchableOpacity : View;
        return (
          <RowWrap
            key={item.id}
            style={[styles.row, clickable && styles.rowClickable]}
            onPress={clickable ? () => onItemPress(item) : undefined}
            accessibilityRole={clickable ? 'button' : undefined}
            {...(clickable && Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.iconWrap}>
              <ClipboardList size={14} color="#64748B" />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.summary}>{item.summary}</Text>
              <Text style={styles.when}>{formatBulletinTimestamp(item.createdAt)}</Text>
            </View>
          </RowWrap>
        );
      })}
    </View>
  );
}

export { useAssignmentActivity };

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    gap: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  loadingWrap: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  streamLoadingWrap: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  rowClickable: {
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.12s ease',
    }),
  },
  iconWrap: {
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
    fontWeight: '500',
  },
  when: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
