/**
 * Home Top Bar
 * Date selector, child chips, and quick actions
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Plus, Sparkles, X, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function HomeTopBar({
  selectedDate,
  onDateChange,
  children = [],
  selectedChildren,
  onChildrenChange,
  onAddLearning,
  onAskAI,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Validate and normalize selectedDate
  let selected;
  if (selectedDate instanceof Date && !isNaN(selectedDate.getTime())) {
    selected = new Date(selectedDate);
  } else {
    selected = new Date(today);
  }
  selected.setHours(0, 0, 0, 0);
  
  const isToday = selected.getTime() === today.getTime();
  const isYesterday = selected.getTime() === today.getTime() - 86400000;
  
  const formatDateLabel = () => {
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return selected.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };
  
  const handlePreviousDay = () => {
    const prev = new Date(selected);
    prev.setDate(prev.getDate() - 1);
    prev.setHours(0, 0, 0, 0);
    onDateChange(prev);
  };
  
  const handleNextDay = () => {
    const next = new Date(selected);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    onDateChange(next);
  };
  
  const handleChildToggle = (childId) => {
    if (selectedChildren === 'all') {
      onChildrenChange([childId]);
    } else if (Array.isArray(selectedChildren)) {
      if (selectedChildren.includes(childId)) {
        const newSelected = selectedChildren.filter(id => id !== childId);
        onChildrenChange(newSelected.length === 0 ? 'all' : newSelected);
      } else {
        onChildrenChange([...selectedChildren, childId]);
      }
    }
  };
  
  return (
    <View style={styles.container}>
      {/* Date Selector */}
      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>My daily insights – {formatDateLabel()}</Text>
        <View style={styles.dateControls}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={handlePreviousDay}
          >
            <ChevronLeft size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => onDateChange(today)}
          >
            <Calendar size={14} color={colors.textSecondary} />
            <Text style={styles.todayText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={handleNextDay}
            disabled={isToday}
          >
            <ChevronRight size={16} color={isToday ? colors.textSecondary : colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Child Chips */}
      <View style={styles.chipsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <TouchableOpacity
            style={[
              styles.chip,
              selectedChildren === 'all' && styles.chipActive
            ]}
            onPress={() => onChildrenChange('all')}
          >
            <Text style={[
              styles.chipText,
              selectedChildren === 'all' && styles.chipTextActive
            ]}>
              All
            </Text>
          </TouchableOpacity>
          {children.map(child => {
            const isSelected = selectedChildren === 'all' ||
              (Array.isArray(selectedChildren) && selectedChildren.includes(child.id));
            return (
              <TouchableOpacity
                key={child.id}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => handleChildToggle(child.id)}
              >
                <Text style={[
                  styles.chipText,
                  isSelected && styles.chipTextActive
                ]}>
                  {child.first_name || child.name}
                </Text>
                {isSelected && selectedChildren !== 'all' && (
                  <X size={12} color={colors.white} style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      
      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onAddLearning}
        >
          <Plus size={14} color={colors.indigo} />
          <Text style={styles.actionText}>Add learning</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onAskAI}
        >
          <Sparkles size={14} color={colors.indigo} />
          <Text style={styles.actionText}>Ask AI about today</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 6,
    gap: 4,
  },
  todayText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipsRow: {
    marginBottom: 8,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  chipText: {
    fontSize: 13,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.white,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    color: colors.indigo,
    fontWeight: '500',
  },
});

