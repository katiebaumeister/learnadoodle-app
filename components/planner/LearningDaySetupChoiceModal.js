import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import { CalendarDays, CalendarPlus } from 'lucide-react';
import CreateModalShell from '../create/shared/CreateModalShell';
import { createModalStyles as styles, FG, MUTED } from '../create/shared/createModalStyles';

function ChoiceCard({
  icon: Icon,
  label,
  subtitle,
  onPress,
  primary = false,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[choiceStyles.card, primary ? choiceStyles.cardPrimary : choiceStyles.cardSecondary]}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <View style={[choiceStyles.iconWrap, primary ? choiceStyles.iconWrapPrimary : choiceStyles.iconWrapSecondary]}>
        <Icon size={18} color={primary ? '#2563EB' : FG} strokeWidth={2.1} />
      </View>
      <View style={choiceStyles.textWrap}>
        <Text style={[choiceStyles.label, primary && choiceStyles.labelPrimary]}>{label}</Text>
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
  if (!visible) return null;

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
      >
        <View style={choiceStyles.list}>
          <ChoiceCard
            icon={CalendarPlus}
            label="One-off learning event"
            subtitle="Add one session on any date, outside the recurring schedule"
            onPress={onOneOffLearningEvent}
            primary
          />
          <ChoiceCard
            icon={CalendarDays}
            label="Add/Edit subject schedule"
            subtitle="Set recurring days, times, and date range for this subject"
            onPress={onEditSubjectSchedule}
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
  cardPrimary: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  cardSecondary: {
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
  iconWrapPrimary: {
    backgroundColor: '#DBEAFE',
  },
  iconWrapSecondary: {
    backgroundColor: '#F3F4F6',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  labelPrimary: {
    color: '#1D4ED8',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
};
