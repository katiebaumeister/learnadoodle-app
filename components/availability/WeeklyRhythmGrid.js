import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Clock, Plus, X } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

const DAYS_OF_WEEK = [
  { id: 'MO', name: 'Monday', short: 'Mon' },
  { id: 'TU', name: 'Tuesday', short: 'Tue' },
  { id: 'WE', name: 'Wednesday', short: 'Wed' },
  { id: 'TH', name: 'Thursday', short: 'Thu' },
  { id: 'FR', name: 'Friday', short: 'Fri' },
  { id: 'SA', name: 'Saturday', short: 'Sat' },
  { id: 'SU', name: 'Sunday', short: 'Sun' },
];

const TIME_SLOTS = [];
for (let hour = 7; hour <= 20; hour++) {
  TIME_SLOTS.push(`${hour.toString().padStart(2, '0')}:00`);
}

/**
 * Weekly Rhythm Grid Component
 * Visual 7-day calendar grid for setting weekly availability
 */
const WeeklyRhythmGrid = ({
  blocks = [],
  onBlocksChange,
  selectedScope,
  selectedChildId,
}) => {
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [hoveredEmptyDay, setHoveredEmptyDay] = useState(null);

  const handleDayClick = (dayId) => {
    // Toggle day off - remove all blocks for this day
    const dayBlocks = blocks.filter(b => b.day === dayId);
    if (dayBlocks.length > 0) {
      // Remove all blocks for this day
      const newBlocks = blocks.filter(b => b.day !== dayId);
      onBlocksChange(newBlocks);
    } else {
      // Add default block (9am-3pm)
      const newBlock = {
        id: `${dayId}-${Date.now()}`,
        kind: 'learn',
        day: dayId,
        start: '09:00',
        end: '15:00',
        source: selectedScope,
      };
      onBlocksChange([...blocks, newBlock]);
    }
  };

  const handleBlockClick = (block, event) => {
    event.stopPropagation();
    setSelectedBlock(block);
  };

  const handleDeleteBlock = (blockId) => {
    const newBlocks = blocks.filter(b => b.id !== blockId);
    onBlocksChange(newBlocks);
    setSelectedBlock(null);
  };

  const handleTimeChange = (blockId, field, value) => {
    const newBlocks = blocks.map(b => {
      if (b.id === blockId) {
        return { ...b, [field]: value };
      }
      return b;
    });
    onBlocksChange(newBlocks);
  };

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
    return Math.max(endPos - startPos, 5); // Minimum 5% height
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const renderDayColumn = (day) => {
    const dayBlocks = getBlocksForDay(day.id);
    const hasBlocks = dayBlocks.length > 0;
    const isWeekend = day.id === 'SA' || day.id === 'SU';
    const columnIndex = DAYS_OF_WEEK.findIndex(d => d.id === day.id);
    const isAlternateColumn = columnIndex % 2 === 1;

    return (
      <View key={day.id} style={[
        styles.dayColumn,
        isWeekend && styles.dayColumnWeekend,
        !isWeekend && isAlternateColumn && styles.dayColumnAlternate,
      ]}>
        <TouchableOpacity
          style={[styles.dayHeader, isWeekend && styles.dayHeaderWeekend]}
          onPress={() => handleDayClick(day.id)}
        >
          <Text style={[styles.dayHeaderText, isWeekend && styles.dayHeaderTextWeekend]}>
            {day.short}
          </Text>
          {isWeekend && (
            <View style={styles.weekendBadge}>
              <Text style={styles.weekendBadgeText}>OFF</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={[styles.timeColumn, isWeekend && styles.timeColumnWeekend]}>
          {/* Horizontal bands for calendar-like appearance */}
          {!isWeekend && TIME_SLOTS.map((time, index) => {
            if (index % 2 === 0) {
              const top = getTimePosition(time);
              return (
                <View
                  key={`band-${time}`}
                  style={[
                    styles.horizontalBand,
                    { top: `${top}%` }
                  ]}
                />
              );
            }
            return null;
          })}
          
          {isWeekend ? (
            <View style={styles.weekendOffContainer}>
              <Text style={styles.weekendOffText}>OFF</Text>
            </View>
          ) : hasBlocks ? (
            dayBlocks.map(block => {
              const top = getTimePosition(block.start);
              const height = getBlockHeight(block.start, block.end);
              
              return (
                <TouchableOpacity
                  key={block.id}
                  style={[
                    styles.timeBlock,
                    {
                      top: `${top}%`,
                      height: `${height}%`,
                    },
                  ]}
                  onPress={(e) => handleBlockClick(block, e)}
                >
                  <View style={styles.blockContent}>
                    <Text style={styles.blockTime}>
                      {formatTime(block.start)} - {formatTime(block.end)}
                    </Text>
                    {selectedBlock?.id === block.id && (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteBlock(block.id)}
                      >
                        <X size={12} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <TouchableOpacity
              style={[
                styles.emptyDayBlock,
                hoveredEmptyDay === day.id && styles.emptyDayBlockHovered,
              ]}
              onPress={() => handleDayClick(day.id)}
              onPressIn={() => setHoveredEmptyDay(day.id)}
              onPressOut={() => setHoveredEmptyDay(null)}
            >
              <View style={styles.emptyDayContent}>
                <Plus size={18} color="#9ca3af" />
                <Text style={styles.emptyDayText}>Add Learning Hours</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    if (blocks.length > 0) return null;
    
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          Click on a day column to add learning hours.
        </Text>
        <TouchableOpacity
          style={styles.quickStartButton}
          onPress={() => {
            // Pre-populate Mon-Fri 9-3
            const defaultBlocks = ['MO', 'TU', 'WE', 'TH', 'FR'].map(dayId => ({
              id: `${dayId}-${Date.now()}`,
              kind: 'learn',
              day: dayId,
              start: '09:00',
              end: '15:00',
              source: selectedScope,
            }));
            onBlocksChange(defaultBlocks);
          }}
        >
          <Text style={styles.quickStartButtonText}>
            Start with a typical weekday pattern
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      {/* Internal Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.cardTitle}>Learning Hours</Text>
          <Text style={styles.cardSubtitle}>Your usual learning hours each week.</Text>
        </View>
      </View>

      {/* Grid Content */}
      <View style={styles.gridWrapper}>
        {renderEmptyState()}
        
        <View style={styles.gridCanvas}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.gridContainer}>
              {/* Time labels column */}
              <View style={styles.timeLabelsColumn}>
                {TIME_SLOTS.map((time, index) => {
                  if (index % 2 === 0) {
                    return (
                      <View key={time} style={styles.timeLabel}>
                        <Text style={styles.timeLabelText}>
                          {formatTime(time)}
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })}
              </View>

              {/* Day columns */}
              <View style={styles.daysRow}>
                {DAYS_OF_WEEK.map(day => renderDayColumn(day))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Block Editor Modal */}
      {selectedBlock && (
        <View style={styles.blockEditor}>
          <View style={styles.blockEditorContent}>
            <Text style={styles.blockEditorTitle}>Edit Time Block</Text>
            
            <View style={styles.timeInputs}>
              <View style={styles.timeInputGroup}>
                <Text style={styles.timeInputLabel}>Start Time</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="time"
                    value={selectedBlock.start}
                    onChange={(e) => handleTimeChange(selectedBlock.id, 'start', e.target.value)}
                    style={styles.webTimeInput}
                  />
                ) : (
                  <Text style={styles.timeDisplay}>{formatTime(selectedBlock.start)}</Text>
                )}
              </View>
              
              <View style={styles.timeInputGroup}>
                <Text style={styles.timeInputLabel}>End Time</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="time"
                    value={selectedBlock.end}
                    onChange={(e) => handleTimeChange(selectedBlock.id, 'end', e.target.value)}
                    style={styles.webTimeInput}
                  />
                ) : (
                  <Text style={styles.timeDisplay}>{formatTime(selectedBlock.end)}</Text>
                )}
              </View>
            </View>

            <View style={styles.blockEditorActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setSelectedBlock(null)}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButtonLarge}
                onPress={() => handleDeleteBlock(selectedBlock.id)}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    overflow: 'hidden',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  cardHeader: {
    marginBottom: 24,
  },
  cardHeaderContent: {
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.muted,
  },
  gridWrapper: {
    minHeight: 500,
  },
  gridCanvas: {
    backgroundColor: colors.bgSubtle || '#f8f9ff',
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 20,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  gridContainer: {
    flexDirection: 'row',
  },
  timeLabelsColumn: {
    width: 70,
    paddingRight: 16,
    paddingLeft: 20,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 0, 0, 0.05)',
  },
  timeLabel: {
    height: 52,
    justifyContent: 'center',
    paddingTop: 2,
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  timeLabelText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '400',
  },
  daysRow: {
    flexDirection: 'row',
    flex: 1,
  },
  dayColumn: {
    width: 110,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 0, 0, 0.05)',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  dayColumnAlternate: {
    backgroundColor: 'transparent',
  },
  dayColumnWeekend: {
    backgroundColor: '#fcfcfc',
  },
  dayHeader: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.04)',
    alignItems: 'center',
    backgroundColor: 'transparent',
    minHeight: 48,
  },
  dayHeaderWeekend: {
    backgroundColor: '#fcfcfc',
  },
  dayHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dayHeaderTextWeekend: {
    color: '#6b7280',
  },
  weekendBadge: {
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
  },
  weekendBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b91c1c',
    textTransform: 'uppercase',
  },
  timeColumn: {
    position: 'relative',
    minHeight: 700,
  },
  timeColumnWeekend: {
    backgroundColor: '#fcfcfc',
  },
  horizontalBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 52,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.03)',
  },
  weekendOffContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekendOffText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  emptyDayBlock: {
    position: 'absolute',
    top: '25%',
    left: 8,
    right: 8,
    minHeight: 70,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0, 0, 0, 0.09)',
    borderRadius: 12,
    backgroundColor: 'rgba(249, 250, 251, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyDayBlockHovered: {
    backgroundColor: 'rgba(249, 250, 251, 0.8)',
    borderColor: 'rgba(0, 0, 0, 0.15)',
  },
  emptyDayContent: {
    alignItems: 'center',
    gap: 8,
  },
  emptyDayText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '400',
  },
  timeBlock: {
    position: 'absolute',
    left: 8,
    right: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderRadius: 8,
    padding: 4,
    paddingHorizontal: 6,
    minHeight: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  blockContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blockTime: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4f46e5',
  },
  deleteButton: {
    padding: 2,
  },
  emptyState: {
    padding: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  quickStartButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    ...shadows.sm,
  },
  quickStartButtonText: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: '600',
  },
  blockEditor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  blockEditorContent: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusMd,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    ...shadows.lg,
  },
  blockEditorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  timeInputs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  timeInputGroup: {
    flex: 1,
  },
  timeInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  webTimeInput: {
    width: '100%',
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radiusMd,
    fontSize: 14,
    backgroundColor: colors.card,
  },
  timeDisplay: {
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radiusMd,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  blockEditorActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.panel || '#f6f8ff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  deleteButtonLarge: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.redBold || '#ef4444',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default WeeklyRhythmGrid;

