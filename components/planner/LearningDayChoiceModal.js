import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Calendar, CalendarDays, BookOpen, X } from 'lucide-react';
import { eventHasLinkedLesson } from '../../lib/subjectLessonLinking';
import {
  formatLearningDayDateLabel,
  formatLearningDayTimeLabel,
  isGeneratedFromSubjectSchedule,
  resolveLearningDaySubjectName,
} from '../../lib/planner/learningDayModalNavigation';

function ActionRow({
  icon: Icon,
  label,
  subtitle,
  onPress,
  primary = false,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.actionRow, primary ? styles.actionRowPrimary : styles.actionRowSecondary]}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
    >
      <View style={[styles.actionIconWrap, primary ? styles.actionIconPrimary : styles.actionIconSecondary]}>
        <Icon size={18} color={primary ? '#1D4ED8' : '#475569'} />
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text>
        {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function LearningDayChoiceModal({
  visible,
  event,
  subjects = [],
  onClose,
  onEditSchedule,
  onEditLearningDay,
  onViewClasswork,
}) {
  if (!visible || !event) return null;

  const subjectName = resolveLearningDaySubjectName(event, subjects);
  const dateLabel = formatLearningDayDateLabel(event);
  const timeLabel = formatLearningDayTimeLabel(event);
  const linked = eventHasLinkedLesson(event);
  const showSchedule = isGeneratedFromSubjectSchedule(event);
  const sessionLine = [dateLabel, timeLabel].filter(Boolean).join(' · ');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e?.stopPropagation?.()}
          style={styles.card}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{subjectName}</Text>
              <Text style={styles.subtitle}>{sessionLine || 'Learning day'}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.prompt}>
            {linked
              ? 'This session has a lesson linked. What would you like to do?'
              : 'This is a scheduled class session. Edit the recurring pattern or plan this day.'}
          </Text>

          <View style={styles.actions}>
            {linked ? (
              <ActionRow
                icon={BookOpen}
                label="View in Learning Schedule"
                subtitle="Open the lesson in your curriculum tree"
                onPress={onViewClasswork}
                primary
              />
            ) : (
              <ActionRow
                icon={CalendarDays}
                label="Edit this learning day"
                subtitle="Choose a lesson or plan work for this session only"
                onPress={onEditLearningDay}
                primary
              />
            )}
            {linked ? (
              <ActionRow
                icon={CalendarDays}
                label="Edit this learning day"
                subtitle="Change lesson or session details"
                onPress={onEditLearningDay}
              />
            ) : null}
            {showSchedule ? (
              <ActionRow
                icon={Calendar}
                label="Edit subject schedule"
                subtitle="Changes apply to all future sessions from this pattern"
                onPress={onEditSchedule}
              />
            ) : null}
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={styles.cancelBtn}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    padding: 18,
    ...(Platform.OS === 'web' ? { boxShadow: '0 14px 32px rgba(15, 23, 42, 0.14)' } : {}),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#64748B',
  },
  closeBtn: {
    padding: 4,
  },
  prompt: {
    marginTop: 14,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  actionRowPrimary: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  actionRowSecondary: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: {
    backgroundColor: '#DBEAFE',
  },
  actionIconSecondary: {
    backgroundColor: '#E2E8F0',
  },
  actionTextWrap: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionLabelPrimary: {
    color: '#1D4ED8',
  },
  actionSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  cancelBtn: {
    marginTop: 14,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
