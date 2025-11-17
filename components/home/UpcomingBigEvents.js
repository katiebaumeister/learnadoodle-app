import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ExternalLink, Plus } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function UpcomingBigEvents({ events = [], onAddToCalendar, onAddTravelBlock }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ExternalLink size={16} color={colors.text} />
          <Text style={styles.title}>Upcoming big events</Text>
        </View>
        <Text style={styles.subtitle}>Next 2 weeks</Text>
      </View>

      <View style={styles.eventsList}>
        {events.length > 0 ? (
          <>
            {events.slice(0, 1).map((event) => (
              <View key={event.id} style={styles.eventItem}>
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventMeta}>
                    {event.when_formatted}
                    {event.where ? ` · ${event.where}` : ''}
                  </Text>
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onAddTravelBlock?.(event)}
                  >
                    <Plus size={12} color={colors.accent} />
                    <Text style={styles.actionButtonText}>Add travel/prep block</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onAddToCalendar?.(event)}
                  >
                    <Text style={styles.actionButtonText}>Subscribe</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {events.length > 1 && (
              <Text style={styles.moreEvents}>
                +{events.length - 1} more events this week
              </Text>
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No big events scheduled</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 231, 209, 0.25)', // orangeSoft with 25% opacity
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: -16,
    marginTop: -16,
    borderTopLeftRadius: colors.radiusLg,
    borderTopRightRadius: colors.radiusLg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  eventsList: {
    gap: 8,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radiusMd,
    padding: 12,
    backgroundColor: colors.bgSubtle,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '500',
  },
  moreEvents: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  emptyState: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },
});

