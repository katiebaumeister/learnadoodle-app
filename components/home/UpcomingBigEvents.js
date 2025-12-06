import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ExternalLink } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function UpcomingBigEvents({ events = [], onViewPlanner }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onViewPlanner ? (
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={onViewPlanner}
            activeOpacity={0.7}
          >
            <ExternalLink size={14} color={colors.text} />
            <Text style={styles.title}>Upcoming big events</Text>
          </TouchableOpacity>
        ) : (
        <View style={styles.headerLeft}>
          <ExternalLink size={14} color={colors.text} />
          <Text style={styles.title}>Upcoming big events</Text>
        </View>
        )}
        <Text style={styles.subtitle}>Next 2 weeks</Text>
      </View>

      <View style={styles.eventsList}>
        {events.length > 0 ? (
          <>
            {events.slice(0, 1).map((event) => {
              const EventWrapper = onViewPlanner ? TouchableOpacity : View;
              const wrapperProps = onViewPlanner
                ? { onPress: onViewPlanner, activeOpacity: 0.8 }
                : {};

              return (
                <EventWrapper
                  key={event.id}
                  style={styles.eventItem}
                  {...wrapperProps}
                >
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventMeta}>
                    {event.when_formatted}
                    {event.where ? ` · ${event.where}` : ''}
                  </Text>
                </View>
                </EventWrapper>
              );
            })}
            {events.length > 1 && (
              <TouchableOpacity
                onPress={onViewPlanner}
                disabled={!onViewPlanner}
                activeOpacity={0.7}
              >
              <Text style={styles.moreEvents}>
                +{events.length - 1} more events this week
              </Text>
              </TouchableOpacity>
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
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  eventsList: {
    gap: 6,
  },
  eventItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radiusMd,
    padding: 8,
    backgroundColor: colors.bgSubtle,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  eventMeta: {
    fontSize: 11,
    color: colors.muted,
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

