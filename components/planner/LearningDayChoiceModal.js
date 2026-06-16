import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { eventHasLinkedLesson } from '../../lib/subjectLessonLinking';
import {
  formatLearningDayDateLabel,
  formatLearningDayTimeLabel,
  isGeneratedFromSubjectSchedule,
  resolveLearningDaySubjectName,
} from '../../lib/planner/learningDayModalNavigation';

const LEAGUE_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

function ChoiceButton({ label, onPress, variant = 'single' }) {
  const isSeries = variant === 'series';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.choiceBtn,
        isSeries ? styles.choiceBtnSeries : styles.choiceBtnSingle,
      ]}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
    >
      <Text style={[styles.choiceBtnText, isSeries ? styles.choiceBtnTextSeries : styles.choiceBtnTextSingle]}>
        {label}
      </Text>
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
          <Text style={styles.title}>{subjectName}</Text>
          {sessionLine ? <Text style={styles.subtitle}>{sessionLine}</Text> : null}

          <Text style={styles.prompt}>
            {linked
              ? 'This session has a lesson linked. Choose how you want to edit it.'
              : 'This is a scheduled class session. Choose whether to edit only this day or the recurring schedule.'}
          </Text>

          <View style={styles.actions}>
            {linked ? (
              <ChoiceButton
                label="View in Learning Schedule"
                onPress={onViewClasswork}
                variant="single"
              />
            ) : null}

            {showSchedule ? (
              <View style={styles.choiceRow}>
                <ChoiceButton
                  label="Edit this learning day"
                  onPress={onEditLearningDay}
                  variant="single"
                />
                <ChoiceButton
                  label="Edit subject schedule"
                  onPress={onEditSchedule}
                  variant="series"
                />
              </View>
            ) : (
              <ChoiceButton
                label="Edit this learning day"
                onPress={onEditLearningDay}
                variant="single"
              />
            )}
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={styles.cancelBtn}
            {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
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
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    ...(Platform.OS === 'web' ? { boxShadow: '0 14px 32px rgba(15, 23, 42, 0.14)' } : {}),
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    ...LEAGUE_FONT,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  prompt: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  choiceBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  choiceBtnSingle: {
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
  },
  choiceBtnSeries: {
    borderColor: '#BFDBFE',
    backgroundColor: '#DBEAFE',
  },
  choiceBtnText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    ...LEAGUE_FONT,
  },
  choiceBtnTextSingle: {
    color: '#1D4ED8',
  },
  choiceBtnTextSeries: {
    color: '#1E40AF',
  },
  cancelBtn: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    ...LEAGUE_FONT,
  },
});
