import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { CalendarDays, ChevronRight } from 'lucide-react';
import AppModalShell from '../ui/AppModalShell';
import { createModalStyles as sharedStyles } from '../create/shared/createModalStyles';
import { LEARNADOODLE_LIGHT_BLUE } from '../../theme/comingSoonModalTheme';
import { useToast } from '../Toast';
import { getUnlinkedUpcomingEvents, linkLessonToEvent } from '../../lib/subjectLessonLinking';

const MODAL_MAX_WIDTH = 480;
const WEB_DIALOG_Z_INDEX = 2147483647;
const LEAGUE_FONT = '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SLOT_BG = '#EAF3FF';
const SLOT_BORDER = 'rgba(107, 179, 232, 0.35)';

function ModalBody({
  lesson,
  unitTitle,
  saving,
  slots,
  onSelectSlot,
}) {
  if (saving) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={LEARNADOODLE_LIGHT_BLUE} />
        <Text style={styles.loadingText}>Scheduling lesson…</Text>
      </View>
    );
  }

  if (slots.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No open slots</Text>
        <Text style={styles.emptyText}>
          Configure your subject schedule in School Year Settings, or add learning days on the planner first.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.bodyStack}>
      <View style={styles.lessonMeta}>
        <Text style={styles.lessonTitle}>{lesson?.title || 'Lesson'}</Text>
        {unitTitle ? <Text style={styles.unitTitle}>{unitTitle}</Text> : null}
        <Text style={styles.hint}>Choose a planner slot for this lesson.</Text>
      </View>
      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {slots.map(({ event, dateLabel }) => (
          <TouchableOpacity
            key={event.id}
            style={styles.slotOption}
            onPress={() => onSelectSlot({ event, dateLabel })}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={`Schedule on ${dateLabel}`}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.slotIconWrap}>
              <CalendarDays size={18} color="#6BB3E8" strokeWidth={2.25} />
            </View>
            <View style={styles.slotTextWrap}>
              <Text style={styles.slotDate}>{dateLabel}</Text>
              <Text style={styles.slotMeta} numberOfLines={1}>
                {event.title || 'Learning day'}
              </Text>
            </View>
            <ChevronRight size={18} color="#94A3B8" strokeWidth={2.25} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function ModalContent({
  subjectName,
  lesson,
  unitTitle,
  saving,
  slots,
  onSelectSlot,
  onClose,
}) {
  const title = subjectName ? `Available ${subjectName} slots` : 'Available slots';

  return (
    <AppModalShell
      title={title}
      onClose={saving ? undefined : onClose}
      shellStyle={[sharedStyles.compactShell, styles.shell]}
      titleRowStyle={sharedStyles.compactTitleRow}
      contentContainerStyle={sharedStyles.contentContainer}
      bodyStyle={sharedStyles.shellBody}
      disableShellScroll
      maxWidth={MODAL_MAX_WIDTH}
    >
      <ModalBody
        lesson={lesson}
        unitTitle={unitTitle}
        saving={saving}
        slots={slots}
        onSelectSlot={onSelectSlot}
      />
    </AppModalShell>
  );
}

export default function ScheduleLessonModal({
  visible,
  onClose,
  lesson,
  unitTitle,
  subjectName = '',
  familyId,
  subjectId,
  events = [],
  onScheduled,
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const slots = useMemo(
    () => getUnlinkedUpcomingEvents(events, { limit: 20 }),
    [events],
  );

  const handleSelect = async (slot) => {
    if (!lesson?.lessonId || !slot?.event?.id) return;
    setSaving(true);
    try {
      await linkLessonToEvent({
        eventId: slot.event.id,
        familyId,
        lessonId: lesson.lessonId,
        unitTitle: unitTitle || '',
        lessonTitle: lesson.title || '',
      });
      toast.push('Lesson scheduled', 'success');
      onScheduled?.();
    } catch (err) {
      toast.push(err?.message || 'Could not schedule lesson', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  const content = (
    <View style={[styles.overlay, Platform.OS === 'web' && styles.overlayWebPortal]}>
      <Pressable
        style={styles.backdrop}
        onPress={saving ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
        {...(Platform.OS === 'web' && { cursor: 'default' })}
      />
      <View style={styles.modalWrap}>
        <ModalContent
          subjectName={subjectName}
          lesson={lesson}
          unitTitle={unitTitle}
          saving={saving}
          slots={slots}
          onSelectSlot={handleSelect}
          onClose={onClose}
        />
      </View>
    </View>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body) {
    try {
      const ReactDOM = require('react-dom');
      if (ReactDOM.createPortal) {
        return ReactDOM.createPortal(content, document.body);
      }
    } catch (_) {}
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 1000000,
    }),
  },
  overlayWebPortal: {
    zIndex: WEB_DIALOG_Z_INDEX,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  modalWrap: {
    width: '100%',
    maxWidth: MODAL_MAX_WIDTH,
    zIndex: 1,
  },
  shell: {
    maxWidth: MODAL_MAX_WIDTH,
    minHeight: 0,
    height: 'auto',
    ...(Platform.OS === 'web' && {
      maxHeight: '88vh',
      boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)',
    }),
  },
  bodyStack: {
    gap: 12,
  },
  lessonMeta: {
    gap: 4,
  },
  lessonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  unitTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    marginTop: 4,
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  listScroll: {
    maxHeight: Platform.OS === 'web' ? 360 : 320,
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  slotOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SLOT_BORDER,
    backgroundColor: SLOT_BG,
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.15s ease, border-color 0.15s ease',
      cursor: 'pointer',
    }),
  },
  slotIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(107, 179, 232, 0.18)',
    flexShrink: 0,
  },
  slotTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  slotDate: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  slotMeta: {
    fontSize: 13,
    color: '#64748B',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: '#475569',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  emptyWrap: {
    paddingVertical: 12,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
});
