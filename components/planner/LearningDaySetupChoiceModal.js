import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import { CalendarDays, CalendarPlus, Check } from 'lucide-react';
import CreateModalShell from '../create/shared/CreateModalShell';
import { createModalStyles as styles, FG, MUTED } from '../create/shared/createModalStyles';
import { MODAL_ACCENT, MODAL_ACCENT_TEXT } from '../ui/modalButtonStyles';

function ChoiceCard({
  icon: Icon,
  label,
  subtitle,
  onPress,
  selected = false,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[choiceStyles.card, selected ? choiceStyles.cardSelected : choiceStyles.cardDefault]}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <View style={[choiceStyles.iconWrap, selected ? choiceStyles.iconWrapSelected : choiceStyles.iconWrapDefault]}>
        <Icon size={18} color={selected ? MODAL_ACCENT_TEXT : FG} strokeWidth={2.1} />
      </View>
      <View style={choiceStyles.textWrap}>
        <Text style={[choiceStyles.label, selected && choiceStyles.labelSelected]}>{label}</Text>
        {subtitle ? <Text style={choiceStyles.subtitle}>{subtitle}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function LearningDaySetupChoiceModal({
  visible,
  subjectName = 'Subject',
  onClose,
  onOneOffLearningEvent,
  onEditSubjectSchedule,
}) {
  const [selectedChoice, setSelectedChoice] = useState('one_off');

  useEffect(() => {
    if (visible) setSelectedChoice('one_off');
  }, [visible]);

  if (!visible) return null;

  const handleContinue = () => {
    if (selectedChoice === 'one_off') {
      onOneOffLearningEvent?.();
    } else {
      onEditSubjectSchedule?.();
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <CreateModalShell
        title={subjectName}
        onClose={onClose}
        maxWidth={460}
        shellStyle={[styles.compactShell, localStyles.choiceModalShell]}
        titleRowStyle={styles.compactTitleRow}
        bodyStyle={[styles.shellBody, localStyles.choiceModalBody]}
        footerStyle={localStyles.choiceModalFooter}
        footer={
          <View style={localStyles.footer}>
            <TouchableOpacity
              onPress={onClose}
              style={localStyles.cancelButton}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={localStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleContinue}
              style={localStyles.continueButton}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={localStyles.continueButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={choiceStyles.list}>
          <ChoiceCard
            icon={CalendarPlus}
            label="One-off learning event"
            subtitle="Add one session on any date, outside the recurring schedule"
            onPress={() => setSelectedChoice('one_off')}
            selected={selectedChoice === 'one_off'}
          />
          <ChoiceCard
            icon={CalendarDays}
            label="Add/Edit subject schedule"
            subtitle="Set recurring days, times, and date range for this subject"
            onPress={() => setSelectedChoice('schedule')}
            selected={selectedChoice === 'schedule'}
          />
        </View>
      </CreateModalShell>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  choiceModalShell: {
    minHeight: 0,
  },
  choiceModalBody: {
    paddingBottom: 4,
  },
  choiceModalFooter: {
    paddingTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  cancelButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  continueButton: {
    minHeight: 50,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: MODAL_ACCENT,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

const choiceStyles = {
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'border-color 0.15s ease, background-color 0.15s ease',
    }),
  },
  cardSelected: {
    borderColor: MODAL_ACCENT,
    backgroundColor: '#F0F9FF',
  },
  cardDefault: {
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapSelected: {
    backgroundColor: '#E0F2FE',
  },
  iconWrapDefault: {
    backgroundColor: '#F3F4F6',
  },
  textWrap: {
    flex: 1,
    paddingTop: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  labelSelected: {
    color: MODAL_ACCENT_TEXT,
  },
  subtitle: {
    fontSize: 12,
    color: MUTED,
    lineHeight: 16,
  },
};
