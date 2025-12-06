/**
 * Unified Records Top Bar
 * Two-row system: Context row + Actions/Tabs row
 */
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { Upload, FileText, Download, X, Calendar, Shield, GraduationCap, Clock, BookOpen, StickyNote, BookTemplate, Folder, History } from 'lucide-react';
import { colors } from '../../theme/colors';
import TabBar from '../ui/TabBar';

const TABS = [
  { id: 'compliance', label: 'Compliance', icon: Shield },
  { id: 'transcripts', label: 'Transcripts & Credits', icon: GraduationCap },
  { id: 'portfolio', label: 'Portfolio & Evidence', icon: FileText },
  { id: 'binder', label: 'Digital Binder', icon: Folder },
  { id: 'attendance', label: 'Attendance & Logs', icon: Clock },
  { id: 'courses', label: 'Courses & Syllabi', icon: BookOpen },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'timeline', label: 'Year Timeline', icon: History },
  { id: 'templates', label: 'Templates', icon: BookTemplate },
];

export default function UnifiedRecordsTopBar({
  children = [],
  selectedChildren,
  onChildrenChange,
  timeframe,
  onTimeframeChange,
  dateRange,
  onDateRangeChange,
  activeTab,
  onTabChange,
  onUploadEvidence,
  onAddNote,
  onExportTranscript,
  onExportCompliancePacket,
  complianceStatus,
}) {
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Handle child toggle
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

  // Calculate compliance tasks remaining
  const complianceTasksRemaining = useMemo(() => {
    if (!complianceStatus?.checklist) return 0;
    return complianceStatus.checklist.filter(
      item => item.status === 'pending' || item.status === 'in_progress'
    ).length;
  }, [complianceStatus]);

  return (
    <View style={styles.container}>
      {/* Row 1: Context */}
      <View style={styles.contextRow}>
        {/* Child Selector Pills */}
        <View style={styles.childSelector}>
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
        <View style={styles.timeframeSelector}>
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

        {/* State Indicator */}
        {complianceTasksRemaining > 0 && (
          <View style={styles.stateIndicator}>
            <Shield size={14} color={colors.orange} />
            <Text style={styles.stateIndicatorText}>
              {complianceTasksRemaining} compliance task{complianceTasksRemaining !== 1 ? 's' : ''} remaining
            </Text>
          </View>
        )}
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

      {/* Row 2: Actions + Tabs */}
      <View style={styles.actionsRow}>
        {/* Tabs (Left) */}
        <View style={styles.tabsContainer}>
          <TabBar
            tabs={TABS.map(tab => ({
              id: tab.id,
              label: tab.label,
              icon: tab.icon,
            }))}
            activeTab={activeTab}
            onTabChange={onTabChange}
            containerStyle={styles.tabBarContainer}
          />
        </View>

        {/* Action Buttons (Right) */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.actionButtons}
          contentContainerStyle={styles.actionButtonsContent}
        >
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onAddNote}
          >
            <StickyNote size={16} color={colors.indigo} />
            <Text style={styles.actionButtonText}>Add note</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onUploadEvidence}
          >
            <Upload size={16} color={colors.indigo} />
            <Text style={styles.actionButtonText}>Upload evidence</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onExportTranscript}
          >
            <FileText size={16} color={colors.indigo} />
            <Text style={styles.actionButtonText}>Export transcript</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onExportCompliancePacket}
          >
            <Download size={16} color={colors.indigo} />
            <Text style={styles.actionButtonText}>Export compliance packet</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 16,
    flexWrap: 'wrap',
  },
  childSelector: {
    flex: 1,
    minWidth: 200,
  },
  timeframeSelector: {
    flex: 1,
    minWidth: 200,
  },
  chipScroll: {
    flex: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.panel,
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: colors.indigo,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.white,
  },
  stateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.panel,
  },
  stateIndicatorText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.text,
    marginRight: 8,
  },
  dateInput: {
    padding: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 12,
  },
  closeDatePicker: {
    padding: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 16,
  },
  tabsContainer: {
    flex: 1,
    minWidth: 0,
  },
  tabBarContainer: {
    borderBottomWidth: 0, // TabBar already has border
    backgroundColor: 'transparent', // Inherit from parent
  },
  actionButtons: {
    flexShrink: 0,
    maxWidth: 600,
  },
  actionButtonsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionButtonText: {
    fontSize: 13,
    color: colors.indigo,
    fontWeight: '600',
  },
});

