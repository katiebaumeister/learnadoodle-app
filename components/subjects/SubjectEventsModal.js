import React from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, Trash2, X } from 'lucide-react';

function fallbackFormatEventDateTime(ts) {
  const d = new Date(ts || '');
  if (Number.isNaN(d.getTime())) return 'Date not set';
  const dateLabel = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateLabel} · ${timeLabel}`;
}

function fallbackFormatAggregateDate(startTs) {
  const dateKey = String(startTs || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return 'Date not set';
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Date not set';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SubjectEventsModal({
  visible = false,
  onClose,
  data = {},
  formatEventDateTime = fallbackFormatEventDateTime,
  formatAggregateDate = fallbackFormatAggregateDate,
  markingAttendanceEventId = null,
  deletingAllEvents = false,
  onDeleteAllEvents,
  onMarkAllPastEventsAttended,
  onOpenEventDetails,
  onMarkEventAttended,
  onMarkEventUnattended,
}) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const isClassDayAggregateModal = data?.isClassDayAggregate === true;
  const hasPendingPastEvents = events.some((eventItem) => {
    if (eventItem?.isDayAggregate) return false;
    const startMs = Number(eventItem?.startMs || 0);
    const isPastEvent = startMs > 0 && startMs < Date.now();
    const isAttended = eventItem?.hasAttendancePresent === true
      || String(eventItem?.status || '').toLowerCase() === 'done'
      || String(eventItem?.instructional_status || '').toUpperCase() === 'MANUAL_COUNTS';
    return isPastEvent && !isAttended;
  });
  const isBulkMarking = markingAttendanceEventId === '__bulk_mark_all_past_attended__';
  const hasAnyEvents = !isClassDayAggregateModal && events.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.subjectEventsOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.subjectEventsModal} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.subjectEventsHeader}>
            <View style={styles.subjectEventsHeaderTextWrap}>
              <Text style={styles.subjectEventsTitle}>
                {isClassDayAggregateModal
                  ? `${data?.subjectName || "Students'"} Learning Days`
                  : `${data?.subjectName || 'Subject'} events`}
              </Text>
            </View>
            <View style={styles.subjectEventsHeaderActions}>
              <TouchableOpacity onPress={onClose} style={styles.subjectEventsCloseButton}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={styles.subjectEventsList} contentContainerStyle={styles.subjectEventsListContent}>
            {events.length === 0 ? (
              <Text style={styles.subjectEventsEmptyText}>No instructional events are scheduled yet.</Text>
            ) : (
              events.map((eventItem) => {
                const isPastEvent = Number(eventItem?.startMs || 0) > 0 && Number(eventItem.startMs) < Date.now();
                const isAttended = eventItem?.hasAttendancePresent === true
                  || String(eventItem?.status || '').toLowerCase() === 'done'
                  || String(eventItem?.instructional_status || '').toUpperCase() === 'MANUAL_COUNTS';
                return (
                  <View key={eventItem.id} style={styles.subjectEventRow}>
                    <View style={styles.subjectEventRowTop}>
                      <Text style={styles.subjectEventRowTitle}>
                        {eventItem?.isDayAggregate ? 'Class day' : (eventItem.title || 'Event')}
                      </Text>
                      <View style={styles.subjectEventRowMetaRight}>
                        {Number(eventItem?.startMs || 0) > 0 ? (
                          <View style={[styles.subjectEventRowStatusChips, styles.subjectEventRowStatusChipsRight]}>
                            <View
                              style={[
                                styles.subjectEventRowStatusChip,
                                (isPastEvent && isAttended) && styles.subjectEventRowStatusChipAttended,
                                (isPastEvent && !isAttended) && styles.subjectEventRowStatusChipUnattended,
                                !isPastEvent && styles.subjectEventRowStatusChipUpcoming,
                              ]}
                            >
                              <View
                                style={[
                                  styles.subjectEventRowStatusChipDot,
                                  (isPastEvent && isAttended) && styles.subjectEventRowStatusChipDotAttended,
                                  (isPastEvent && !isAttended) && styles.subjectEventRowStatusChipDotUnattended,
                                  !isPastEvent && styles.subjectEventRowStatusChipDotUpcoming,
                                ]}
                              />
                              <Text
                                style={[
                                  styles.subjectEventRowStatusChipText,
                                  isAttended ? styles.subjectEventRowStatusChipTextAttended : null,
                                  !isPastEvent ? styles.subjectEventRowStatusChipTextUpcoming : null,
                                ]}
                              >
                                {isPastEvent ? (isAttended ? 'Attended' : 'Unattended') : 'Upcoming'}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.subjectEventRowDate}>
                      {eventItem?.isDayAggregate
                        ? formatAggregateDate(eventItem?.startTs)
                        : formatEventDateTime(eventItem?.startTs)}
                    </Text>
                    {eventItem?.isDayAggregate ? (
                      <Text style={styles.subjectEventRowUnit}>
                        {`${Number(eventItem?.dayEventCount || 0)} instructional item${Number(eventItem?.dayEventCount || 0) === 1 ? '' : 's'}${Number(eventItem?.attendedEventCount || 0) > 0 ? ` • ${Number(eventItem?.attendedEventCount || 0)} attended` : ''}`}
                      </Text>
                    ) : null}
                    {eventItem.unitName && !eventItem?.isDayAggregate ? (
                      <Text style={styles.subjectEventRowUnit}>Unit: {eventItem.unitName}</Text>
                    ) : null}
                    {!eventItem?.isDayAggregate ? (
                      <View style={styles.subjectEventRowActions}>
                        {typeof onOpenEventDetails === 'function' ? (
                          <TouchableOpacity
                            onPress={() => onOpenEventDetails(eventItem)}
                            activeOpacity={0.8}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={styles.subjectEventRowLinkText}>Open event details</Text>
                          </TouchableOpacity>
                        ) : null}
                        {isPastEvent && !isAttended && typeof onMarkEventAttended === 'function' ? (
                          <TouchableOpacity
                            onPress={() => onMarkEventAttended(eventItem)}
                            activeOpacity={0.8}
                            disabled={markingAttendanceEventId === eventItem.id}
                            {...(Platform.OS === 'web' && { cursor: markingAttendanceEventId === eventItem.id ? 'default' : 'pointer' })}
                          >
                            <Text style={styles.subjectEventRowLinkText}>
                              {markingAttendanceEventId === eventItem.id ? 'Marking...' : 'Mark attended'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {isPastEvent && isAttended && typeof onMarkEventUnattended === 'function' ? (
                          <TouchableOpacity
                            onPress={() => onMarkEventUnattended(eventItem)}
                            activeOpacity={0.8}
                            disabled={markingAttendanceEventId === eventItem.id}
                            {...(Platform.OS === 'web' && { cursor: markingAttendanceEventId === eventItem.id ? 'default' : 'pointer' })}
                          >
                            <Text style={styles.subjectEventRowLinkText}>
                              {markingAttendanceEventId === eventItem.id ? 'Marking...' : 'Mark unattended'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={styles.subjectEventsFooter}>
            <View style={styles.subjectEventsFooterButtonsRow}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.subjectEventsFooterCancelButton}
                activeOpacity={0.85}
              >
                <Text style={styles.subjectEventsFooterCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDeleteAllEvents}
                style={[
                  styles.subjectEventsFooterDeleteButton,
                  (!hasAnyEvents || deletingAllEvents || typeof onDeleteAllEvents !== 'function') && styles.subjectEventsFooterDeleteButtonDisabled,
                ]}
                activeOpacity={0.85}
                disabled={!hasAnyEvents || deletingAllEvents || typeof onDeleteAllEvents !== 'function'}
              >
                <Trash2 size={18} color={!hasAnyEvents || deletingAllEvents || typeof onDeleteAllEvents !== 'function' ? '#94A3B8' : '#FFFFFF'} strokeWidth={2} />
                <Text
                  style={[
                    styles.subjectEventsFooterDeleteButtonText,
                    (!hasAnyEvents || deletingAllEvents || typeof onDeleteAllEvents !== 'function') && styles.subjectEventsFooterDeleteButtonTextDisabled,
                  ]}
                >
                  {deletingAllEvents ? 'Deleting...' : 'Delete all events'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onMarkAllPastEventsAttended}
                style={[
                  styles.subjectEventsFooterActionButton,
                  (!hasPendingPastEvents || isBulkMarking || deletingAllEvents || typeof onMarkAllPastEventsAttended !== 'function') && styles.subjectEventsFooterActionButtonDisabled,
                ]}
                activeOpacity={0.85}
                disabled={!hasPendingPastEvents || isBulkMarking || deletingAllEvents || typeof onMarkAllPastEventsAttended !== 'function'}
              >
                <CheckCircle2 size={18} color={!hasPendingPastEvents || isBulkMarking || deletingAllEvents || typeof onMarkAllPastEventsAttended !== 'function' ? '#94A3B8' : '#FFFFFF'} strokeWidth={2} />
                <Text
                  style={[
                    styles.subjectEventsFooterActionButtonText,
                    (!hasPendingPastEvents || isBulkMarking || deletingAllEvents || typeof onMarkAllPastEventsAttended !== 'function') && styles.subjectEventsFooterActionButtonTextDisabled,
                  ]}
                >
                  {isBulkMarking ? 'Marking...' : 'Mark all as attended'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  subjectEventsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  subjectEventsModal: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '84%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  subjectEventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  subjectEventsHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subjectEventsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectEventsTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectEventsFooter: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  subjectEventsFooterButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  subjectEventsFooterCancelButton: {
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectEventsFooterCancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsFooterActionButton: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9ECFFB',
    backgroundColor: '#9ECFFB',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectEventsFooterActionButtonDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
    opacity: 0.58,
  },
  subjectEventsFooterActionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsFooterActionButtonTextDisabled: {
    color: '#94A3B8',
  },
  subjectEventsFooterDeleteButton: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectEventsFooterDeleteButtonDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
    opacity: 0.58,
  },
  subjectEventsFooterDeleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsFooterDeleteButtonTextDisabled: {
    color: '#94A3B8',
  },
  subjectEventsList: {
    flex: 1,
  },
  subjectEventsListContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  subjectEventsEmptyText: {
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  subjectEventRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  subjectEventRowMetaRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  subjectEventRowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: '#172033',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowDate: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowStatusChips: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  subjectEventRowStatusChipsRight: {
    marginTop: 0,
    justifyContent: 'flex-end',
  },
  subjectEventRowStatusChip: {
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectEventRowStatusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowStatusChipTextAttended: {
    color: '#475569',
  },
  subjectEventRowStatusChipTextUpcoming: {
    color: '#64748B',
  },
  subjectEventRowStatusChipDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  subjectEventRowStatusChipDotAttended: {
    backgroundColor: '#6BB3E8',
  },
  subjectEventRowStatusChipDotUnattended: {
    backgroundColor: '#F2A0A3',
  },
  subjectEventRowStatusChipDotUpcoming: {
    backgroundColor: '#CFE2FA',
  },
  subjectEventRowStatusChipUpcoming: {
    backgroundColor: '#F8FAFC',
  },
  subjectEventRowStatusChipAttended: {
    backgroundColor: '#F8FAFC',
  },
  subjectEventRowStatusChipUnattended: {
    backgroundColor: '#F8FAFC',
  },
  subjectEventRowUnit: {
    marginTop: 4,
    fontSize: 12,
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowActions: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  subjectEventRowLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
