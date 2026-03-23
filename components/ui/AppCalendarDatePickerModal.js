import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Match TaskCreateModal mini calendar (tan selected day, month/year nav). */
const FG = '#111827';
const SUB = '#6b7280';
const ACCENT = '#d4a256';

const modalCardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: 16,
  width: Platform.OS === 'web' ? 320 : '90%',
  maxWidth: 320,
  ...(Platform.OS === 'web'
    ? { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }
    : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
      }),
};

export function formatLocalYyyyMmDd(d) {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalYyyyMmDd(s) {
  if (s == null || typeof s !== 'string') return null;
  const t = s.trim().slice(0, 10);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    return null;
  }
  return d;
}

/**
 * @param {boolean} visible
 * @param {() => void} onClose
 * @param {Date | null} selectedDate — highlighted day; null = none
 * @param {(d: Date) => void} onSelectDate — called with local calendar date, then caller closes
 */
export function AppCalendarDatePickerModal({ visible, onClose, selectedDate, onSelectDate }) {
  const selectedKey =
    selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate.getTime() : null;

  const [viewMonth, setViewMonth] = useState(() => {
    const b = selectedKey != null ? new Date(selectedKey) : new Date();
    return new Date(b.getFullYear(), b.getMonth(), 1);
  });

  useEffect(() => {
    if (!visible) return;
    const b = selectedKey != null ? new Date(selectedKey) : new Date();
    setViewMonth(new Date(b.getFullYear(), b.getMonth(), 1));
  }, [visible, selectedKey]);

  const titleFont = Platform.OS === 'web'
    ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
    : {};

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={modalCardStyle}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                const newMonth = new Date(viewMonth);
                newMonth.setMonth(newMonth.getMonth() - 1);
                setViewMonth(newMonth);
              }}
              style={{ padding: 4 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <ChevronLeft size={20} color={FG} />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: FG,
                ...titleFont,
              }}
            >
              {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity
              onPress={() => {
                const newMonth = new Date(viewMonth);
                newMonth.setMonth(newMonth.getMonth() + 1);
                setViewMonth(newMonth);
              }}
              style={{ padding: 4 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <ChevronRight size={20} color={FG} />
            </TouchableOpacity>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                const newMonth = new Date(viewMonth);
                newMonth.setFullYear(newMonth.getFullYear() - 1);
                setViewMonth(newMonth);
              }}
              style={{ padding: 4 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 12, color: SUB, ...titleFont }}>← Year</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const t = new Date();
                setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1));
                onSelectDate(t);
                onClose();
              }}
              style={{ padding: 4 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: SUB,
                  textDecorationLine: 'underline',
                  ...titleFont,
                }}
              >
                Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const newMonth = new Date(viewMonth);
                newMonth.setFullYear(newMonth.getFullYear() + 1);
                setViewMonth(newMonth);
              }}
              style={{ padding: 4 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 12, color: SUB, ...titleFont }}>Year →</Text>
            </TouchableOpacity>
          </View>

          <View>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: SUB, fontWeight: '500' }}>{day}</Text>
                </View>
              ))}
            </View>

            {(() => {
              const year = viewMonth.getFullYear();
              const month = viewMonth.getMonth();
              const firstDay = new Date(year, month, 1);
              const startDate = new Date(firstDay);
              startDate.setDate(startDate.getDate() - startDate.getDay());

              const days = [];
              const currentDate = new Date(startDate);
              for (let i = 0; i < 42; i++) {
                days.push(new Date(currentDate));
                currentDate.setDate(currentDate.getDate() + 1);
              }

              const selectedStr =
                selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate.toDateString() : null;
              const todayStr = new Date().toDateString();

              return (
                <View>
                  {[0, 1, 2, 3, 4, 5].map((week) => (
                    <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                      {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                        const isCurrentMonth = day.getMonth() === month;
                        const isSelected = selectedStr != null && day.toDateString() === selectedStr;
                        const isToday = day.toDateString() === todayStr;

                        return (
                          <TouchableOpacity
                            key={idx}
                            onPress={() => {
                              onSelectDate(day);
                              onClose();
                            }}
                            style={{
                              flex: 1,
                              aspectRatio: 1,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 6,
                              backgroundColor: isSelected ? ACCENT : 'transparent',
                              borderWidth: isToday ? 2 : 0,
                              borderColor: isToday ? ACCENT : 'transparent',
                            }}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: isSelected ? '#FFFFFF' : isCurrentMonth ? FG : SUB,
                                fontWeight: isSelected || isToday ? '600' : '400',
                              }}
                            >
                              {day.getDate()}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })()}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * Tappable field that stores YYYY-MM-DD (local) and opens the app-style calendar.
 */
export function PlannerPreferenceDateField({
  value,
  onChange,
  placeholder = 'Select date',
  style,
  width,
  borderColor = '#E2E8F0',
  textColor = 'rgba(15,23,42,0.9)',
  mutedColor = 'rgba(15,23,42,0.45)',
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => parseLocalYyyyMmDd(value), [value]);
  const label =
    selectedDate && !isNaN(selectedDate.getTime())
      ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

  const baseField = {
    borderWidth: 1,
    borderColor,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 32,
    justifyContent: 'center',
    ...(width != null ? { width } : { minWidth: 108 }),
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  };

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={[baseField, style]} activeOpacity={0.85}>
        <Text style={{ fontSize: 12, color: label ? textColor : mutedColor }} numberOfLines={1}>
          {label || placeholder}
        </Text>
      </TouchableOpacity>
      <AppCalendarDatePickerModal
        visible={open}
        onClose={() => setOpen(false)}
        selectedDate={selectedDate}
        onSelectDate={(d) => {
          onChange(formatLocalYyyyMmDd(d));
          setOpen(false);
        }}
      />
    </>
  );
}
