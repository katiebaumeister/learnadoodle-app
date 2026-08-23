import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import { CalendarDays, CalendarPlus, Check, X } from 'lucide-react';

function ChoiceCard({
  icon: Icon,
  label,
  subtitle,
  onPress,
  selected = false,
  isLast = false,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.item,
        isLast && styles.itemLast,
        selected && styles.itemSelected,
      ]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
        <Icon size={18} color={selected ? '#6BB3E8' : '#1F2937'} strokeWidth={2.1} />
      </View>
      <View style={styles.itemTextWrap}>
        <Text style={[styles.itemText, selected && styles.itemTextSelected]}>{label}</Text>
        {subtitle ? <Text style={styles.itemSubtitle}>{subtitle}</Text> : null}
      </View>
      {selected ? (
        <Check size={16} color="#6BB3E8" strokeWidth={2.5} />
      ) : null}
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
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{subjectName}</Text>
              <Text style={styles.subtitle}>How would you like to add learning for this subject?</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.list}>
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
              isLast
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.cancelBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleContinue}
              style={styles.primaryBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue"
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.primaryText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 32,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  list: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  item: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  itemSelected: {
    backgroundColor: '#F0F9FF',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    flexShrink: 0,
  },
  iconWrapSelected: {
    backgroundColor: '#E0F2FE',
  },
  itemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  itemText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemTextSelected: {
    color: '#1F2937',
  },
  itemSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '400',
    color: '#94A3B8',
    lineHeight: 20,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#9ECFFB',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
