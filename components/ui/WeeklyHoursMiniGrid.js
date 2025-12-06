import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Clock, Plus } from 'lucide-react';

const DAYS_OF_WEEK = [
  { id: 'MO', name: 'Monday', short: 'Mon' },
  { id: 'TU', name: 'Tuesday', short: 'Tue' },
  { id: 'WE', name: 'Wednesday', short: 'Wed' },
  { id: 'TH', name: 'Thursday', short: 'Thu' },
  { id: 'FR', name: 'Friday', short: 'Fri' },
];

const TIME_SLOTS = [];
for (let hour = 7; hour <= 20; hour++) {
  TIME_SLOTS.push(`${hour.toString().padStart(2, '0')}:00`);
}

/**
 * WeeklyHoursMiniGrid Component
 * Compact weekly schedule grid for modal display
 */
export default function WeeklyHoursMiniGrid({
  blocks = [],
  onBlocksChange,
  onOpenFullEditor,
}) {
  const getBlocksForDay = (dayId) => {
    return blocks.filter(b => b.day === dayId).sort((a, b) => {
      return a.start.localeCompare(b.start);
    });
  };

  const getTimePosition = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = 7 * 60; // 7am
    const endMinutes = 21 * 60; // 9pm
    const totalRange = endMinutes - startMinutes;
    return ((totalMinutes - startMinutes) / totalRange) * 100;
  };

  const getBlockHeight = (start, end) => {
    const startPos = getTimePosition(start);
    const endPos = getTimePosition(end);
    return Math.max(endPos - startPos, 8);
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleDayClick = (dayId) => {
    const dayBlocks = blocks.filter(b => b.day === dayId);
    if (dayBlocks.length > 0) {
      const newBlocks = blocks.filter(b => b.day !== dayId);
      onBlocksChange(newBlocks);
    } else {
      const newBlock = {
        id: `${dayId}-${Date.now()}`,
        kind: 'learn',
        day: dayId,
        start: '09:00',
        end: '15:00',
        source: 'family',
      };
      onBlocksChange([...blocks, newBlock]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Time axis */}
      <View style={styles.timeAxis}>
        <Text style={styles.timeLabel}>7 AM</Text>
        <Text style={styles.timeLabel}>12 PM</Text>
        <Text style={styles.timeLabel}>7 PM</Text>
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {DAYS_OF_WEEK.map((day) => {
          const dayBlocks = getBlocksForDay(day.id);
          return (
            <View key={day.id} style={styles.dayColumn}>
              <TouchableOpacity
                style={styles.dayHeader}
                onPress={() => handleDayClick(day.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.dayLabel}>{day.short}</Text>
              </TouchableOpacity>
              <View style={styles.dayContent}>
                {dayBlocks.map((block) => {
                  const top = getTimePosition(block.start);
                  const height = getBlockHeight(block.start, block.end);
                  return (
                    <View
                      key={block.id}
                      style={[
                        styles.block,
                        {
                          top: `${top}%`,
                          height: `${height}%`,
                        },
                      ]}
                    >
                      <Text style={styles.blockText}>
                        {formatTime(block.start)} - {formatTime(block.end)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      {/* Open full editor button */}
      <TouchableOpacity
        style={styles.fullEditorButton}
        onPress={onOpenFullEditor}
        activeOpacity={0.7}
      >
        <Text style={styles.fullEditorButtonText}>Open full editor →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 260,
    paddingVertical: 16,
  },
  timeAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 60,
    marginBottom: 8,
    paddingLeft: 0,
  },
  timeLabel: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 200,
  },
  dayColumn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 8,
    backgroundColor: '#fafafa',
    overflow: 'hidden',
  },
  dayHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayContent: {
    flex: 1,
    position: 'relative',
    minHeight: 180,
  },
  block: {
    position: 'absolute',
    left: 4,
    right: 4,
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 6,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      cursor: 'pointer',
      ':hover': {
        backgroundColor: '#c7d2fe',
      },
    }),
  },
  blockText: {
    fontSize: 10,
    color: '#4338ca',
    fontWeight: '500',
    textAlign: 'center',
  },
  fullEditorButton: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'opacity 0.2s ease',
      ':hover': {
        opacity: 0.7,
      },
    }),
  },
  fullEditorButtonText: {
    fontSize: 14,
    color: '#7c8cff',
    fontWeight: '500',
  },
});
