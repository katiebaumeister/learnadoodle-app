/**
 * Unified Records Top Bar
 * Two-row system: Context row + Actions/Tabs row
 */
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { X, Shield, GraduationCap, Clock, BookOpen, StickyNote, BookTemplate, Folder, History, FileText } from 'lucide-react';
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


      {/* Row 2: Tabs */}
      <View style={styles.actionsRow}>
        {/* Tabs */}
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabsContainer: {
    flex: 1,
    minWidth: 0,
  },
  tabBarContainer: {
    borderBottomWidth: 0, // TabBar already has border
    backgroundColor: 'transparent', // Inherit from parent
  },
});

