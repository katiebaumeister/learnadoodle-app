/**
 * Records Top Bar
 * Child filter chips, timeframe selector, and quick actions
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { Upload, FileText, Download, X, Calendar } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function RecordsTopBar({
  children = [],
  selectedChildren,
  onChildrenChange,
  timeframe,
  onTimeframeChange,
  dateRange,
  onDateRangeChange,
  onUploadEvidence,
  onAddNote,
  onExportTranscript,
}) {
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Handle child toggle (same logic as IntelligenceHub)
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

  // Calculate date range for timeframe options
  const getDateRangeForTimeframe = (tf) => {
    const today = new Date();
    const start = new Date(today);
    
    switch (tf) {
      case 'thisYear':
        start.setMonth(0);
        start.setDate(1);
        return { start, end: today };
      case 'last90Days':
        start.setDate(start.getDate() - 90);
        return { start, end: today };
      case 'custom':
        return dateRange || { start, end: today };
      default:
        return { start, end: today };
    }
  };

  const handleTimeframeSelect = (tf) => {
    if (tf === 'custom') {
      setShowCustomDatePicker(true);
    } else {
      const range = getDateRangeForTimeframe(tf);
      onTimeframeChange(tf);
      onDateRangeChange(range);
    }
  };

  return (
    <View style={styles.container}>
      {/* Child Filter Chips */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Children:</Text>
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

      {/* Timeframe Selector */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Timeframe:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {[
            { value: 'thisYear', label: 'This Year' },
            { value: 'last90Days', label: 'Last 90 Days' },
            { value: 'custom', label: 'Custom' },
          ].map(option => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                timeframe === option.value && styles.chipActive
              ]}
              onPress={() => handleTimeframeSelect(option.value)}
            >
              <Text style={[
                styles.chipText,
                timeframe === option.value && styles.chipTextActive
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Custom Date Picker (shown when Custom is selected) */}
      {showCustomDatePicker && Platform.OS === 'web' && (
        <View style={styles.datePickerRow}>
          <View style={styles.dateInputGroup}>
            <Text style={styles.dateLabel}>Start:</Text>
            <input
              type="date"
              value={dateRange?.start ? dateRange.start.toISOString().split('T')[0] : ''}
              onChange={(e) => {
                const start = new Date(e.target.value);
                onDateRangeChange({ ...dateRange, start });
              }}
              style={styles.dateInput}
            />
          </View>
          <View style={styles.dateInputGroup}>
            <Text style={styles.dateLabel}>End:</Text>
            <input
              type="date"
              value={dateRange?.end ? dateRange.end.toISOString().split('T')[0] : ''}
              onChange={(e) => {
                const end = new Date(e.target.value);
                onDateRangeChange({ ...dateRange, end });
              }}
              style={styles.dateInput}
            />
          </View>
          <TouchableOpacity
            style={styles.closeDatePicker}
            onPress={() => setShowCustomDatePicker(false)}
          >
            <X size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={onUploadEvidence}
        >
          <Upload size={16} color={colors.indigo} />
          <Text style={styles.quickActionText}>Upload evidence</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={onAddNote}
        >
          <FileText size={16} color={colors.indigo} />
          <Text style={styles.quickActionText}>Add note</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={onExportTranscript}
        >
          <Download size={16} color={colors.indigo} />
          <Text style={styles.quickActionText}>Export transcript</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginRight: 12,
    minWidth: 80,
  },
  chipScroll: {
    flex: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: colors.indigo,
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.white,
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
  },
  dateInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  dateLabel: {
    fontSize: 13,
    color: colors.text,
    marginRight: 8,
  },
  dateInput: {
    padding: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 13,
  },
  closeDatePicker: {
    padding: 4,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.panel,
  },
  quickActionText: {
    fontSize: 13,
    color: colors.indigo,
    fontWeight: '500',
  },
});

