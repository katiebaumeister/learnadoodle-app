import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { X, ChevronRight, Plus, ChevronDown, CheckCircle } from 'lucide-react';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import Dropdown from '../ui/Dropdown';
import { parseChildIds } from '../../lib/services/subjectsClient';

function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const startYear = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

/** Match Learning page: missing school_year is treated as 2025/26. */
function subjectSchoolYearLabel(subject) {
  return String(subject?.school_year || '').trim() || '2025/26';
}

function normalizeSchoolYear(value) {
  const raw = String(value || '').trim();
  return raw || getCurrentSchoolYear();
}

function buildSubjectPickerOptions(subjects, children, schoolYearFilter) {
  const childNameById = {};
  (children || []).forEach((child) => {
    const id = String(child?.id || '').trim();
    if (!id) return;
    childNameById[id] = child?.first_name || child?.name || child?.full_name || 'Student';
  });

  const yearFilter = schoolYearFilter ? normalizeSchoolYear(schoolYearFilter) : null;

  return (subjects || [])
    .map((subject) => {
      const id = String(subject?.id || '').trim();
      if (!id) return null;
      const subjectYear = subjectSchoolYearLabel(subject);
      if (yearFilter && subjectYear !== yearFilter) return null;
      const candidateChildIds = []
        .concat(
          Array.isArray(subject?.assignedChildren) ? subject.assignedChildren : [],
          Array.isArray(subject?.assigned_children) ? subject.assigned_children : [],
          Array.isArray(subject?.child_ids) ? subject.child_ids : [],
          Array.isArray(subject?.childIds) ? subject.childIds : [],
          subject?.child_id ? parseChildIds(subject.child_id) : [],
        )
        .map((childId) => String(childId || '').trim())
        .filter(Boolean);
      const childIds = Array.from(new Set(candidateChildIds));
      const studentLabel = childIds
        .map((childId) => childNameById[childId] || null)
        .filter(Boolean)
        .join(', ');
      return {
        id,
        subject,
        name: String(subject?.name || '').trim() || 'Subject',
        schoolYear: subjectYear,
        childIds,
        studentLabel,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildYearOptions(subjects, preferredYear) {
  const years = new Set();
  const current = getCurrentSchoolYear();
  years.add(current);
  if (preferredYear) years.add(normalizeSchoolYear(preferredYear));
  (subjects || []).forEach((subject) => {
    years.add(subjectSchoolYearLabel(subject));
  });
  return [...years].sort((a, b) => String(b).localeCompare(String(a)));
}

export default function SubjectPickerModal({
  visible,
  onClose,
  subjects = [],
  children = [],
  title = 'Choose a subject',
  subtitle = 'Pick the subject you want to update.',
  emptyMessage = 'No subjects yet.',
  onSelect,
  onCreateNew = null,
  createNewLabel = 'Create new subject',
  /** When true, show a school-year filter defaulted to the current year (Learning-page parity). */
  showYearFilter = true,
  initialSchoolYear = null,
}) {
  const yearTriggerRef = useRef(null);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [selectedSchoolYear, setSelectedSchoolYear] = useState(
    () => normalizeSchoolYear(initialSchoolYear || getCurrentSchoolYear()),
  );

  useEffect(() => {
    if (!visible) {
      setShowYearDropdown(false);
      return;
    }
    setSelectedSchoolYear(normalizeSchoolYear(initialSchoolYear || getCurrentSchoolYear()));
  }, [visible, initialSchoolYear]);

  const yearOptions = useMemo(
    () => buildYearOptions(subjects, selectedSchoolYear),
    [subjects, selectedSchoolYear],
  );

  const options = useMemo(
    () => buildSubjectPickerOptions(
      subjects,
      children,
      showYearFilter ? selectedSchoolYear : null,
    ),
    [subjects, children, showYearFilter, selectedSchoolYear],
  );

  const handleSelect = (option) => {
    onSelect?.(option?.subject || null);
  };

  const emptyText = showYearFilter
    ? (options.length === 0
      ? `No subjects for ${selectedSchoolYear}. Switch years or create a new subject.`
      : emptyMessage)
    : emptyMessage;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
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

          {showYearFilter ? (
            <View style={styles.yearRow}>
              <Text style={styles.yearLabel}>School year</Text>
              <TouchableOpacity
                ref={yearTriggerRef}
                style={styles.yearTrigger}
                onPress={() => setShowYearDropdown((open) => !open)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Select school year"
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={styles.yearTriggerText}>{selectedSchoolYear}</Text>
                <ChevronDown size={16} color="#6b7280" />
              </TouchableOpacity>
              <Dropdown
                visible={showYearDropdown}
                onClose={() => setShowYearDropdown(false)}
                triggerRef={yearTriggerRef}
                width={180}
                maxHeight={240}
              >
                {yearOptions.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={styles.yearOption}
                    onPress={() => {
                      setSelectedSchoolYear(year);
                      setShowYearDropdown(false);
                    }}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <Text
                      style={[
                        styles.yearOptionText,
                        year === selectedSchoolYear && styles.yearOptionTextSelected,
                      ]}
                    >
                      {year}
                    </Text>
                    {year === selectedSchoolYear ? (
                      <CheckCircle size={16} color="#6BB3E8" />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </Dropdown>
            </View>
          ) : null}

          {options.length > 0 ? (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator
            >
              {options.map((option, index) => (
                <TouchableOpacity
                  key={`subject-picker-${option.id}`}
                  style={[
                    styles.item,
                    index === options.length - 1 && styles.itemLast,
                  ]}
                  onPress={() => handleSelect(option)}
                  activeOpacity={0.75}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <View style={styles.itemTextWrap}>
                    <Text style={styles.itemText}>{option.name}</Text>
                    {option.studentLabel ? (
                      <View style={styles.studentsRow}>
                        <ChildAvatarCluster
                          childIds={option.childIds}
                          familyChildren={children}
                          size={28}
                          overlap={-8}
                        />
                        <Text style={styles.studentsText}>{option.studentLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <ChevronRight size={16} color="#6b7280" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            {typeof onCreateNew === 'function' ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={onCreateNew}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={createNewLabel}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.primaryText}>{createNewLabel}</Text>
              </TouchableOpacity>
            ) : null}
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
  yearRow: {
    marginTop: 4,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  yearLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  yearTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearTriggerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearOption: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  yearOptionTextSelected: {
    color: '#1F2937',
  },
  listScroll: {
    marginTop: 14,
    maxHeight: 320,
  },
  list: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  item: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemLast: {
    borderBottomWidth: 0,
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
  studentsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  studentsText: {
    flex: 1,
    minWidth: 0,
    fontWeight: '400',
    fontSize: 14,
    color: '#94A3B8',
  },
  emptyWrap: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
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
