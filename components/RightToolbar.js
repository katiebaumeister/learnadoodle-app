import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { 
  CheckSquare, 
  ListTodo, 
  Calendar, 
  Target, 
  Search, 
  CheckCircle2, 
  RefreshCw, 
  HelpCircle,
  SlidersHorizontal,
  Moon,
  Sparkles,
  TrendingUp,
  Package,
  RotateCcw,
  FileText,
  BarChart3,
  Activity,
  Link
} from 'lucide-react';
import { TOOL_META } from '../lib/toolTypes';
import { checkFeatureFlags } from '../lib/services/yearClient';
import AddFromLinkModal from './planner/AddFromLinkModal';

export default function RightToolbar({
  onTasks,
  onBacklog,
  onCalendarIntegration,
  onWeeklyObjectives,
  onSearch,
  onCompleted,
  onRebalance,
  onWhatIfAnalysis,
  onScheduleRules,
  onBlackouts,
  onPlanYear,
  onHeatmap,
  onPackWeek,
  onCatchUp,
  onSummarizeProgress,
  onAnalytics,
  activeTool = null,
  onSettings,
  onAITools,
  onHealth,
  children = [],
  selectedChildren = null,
  onChildFilterChange,
  familyId,
}) {
  const [hoveredTool, setHoveredTool] = useState(null);
  const [yearPlansEnabled, setYearPlansEnabled] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [showAddFromLinkModal, setShowAddFromLinkModal] = useState(false);
  
  useEffect(() => {
    checkFeatureFlags().then(flags => {
      setYearPlansEnabled(flags.yearPlans);
      setHeatmapEnabled(flags.heatmap);
    }).catch(err => {
      console.error('[RightToolbar] Error checking feature flags:', err);
      setYearPlansEnabled(false);
      setHeatmapEnabled(false);
    });
  }, []);

  // Group A: Core, Everyday Planner Actions (always visible)
  const coreTools = [
    { 
      key: 'tasks', 
      icon: CheckSquare, 
      label: 'Tasks',
      onPress: onTasks,
      color: '#6366f1'
    },
    { 
      key: 'backlog', 
      icon: ListTodo, 
      label: 'Backlog',
      onPress: onBacklog,
      color: '#8b5cf6'
    },
    { 
      key: 'completed', 
      icon: CheckCircle2, 
      label: 'Completed',
      onPress: onCompleted,
      color: '#14b8a6'
    },
    { 
      key: 'rebalance', 
      icon: RefreshCw, 
      label: 'Rebalance',
      onPress: onRebalance,
      color: '#f59e0b'
    },
    { 
      key: 'add-from-link', 
      icon: Link, 
      label: 'Add from Link',
      onPress: () => setShowAddFromLinkModal(true),
      color: '#3b82f6'
    },
  ];

  // Group B: Settings
  const settingsTool = {
    key: 'settings',
    icon: SlidersHorizontal,
    label: 'Settings',
    onPress: onSettings,
    color: '#0ea5e9'
  };

  // Group C: AI Tools removed - now only Pack Week and Catch Up remain (navigate to Intelligence)
  // Heavy AI tools (Plan Year, Heatmap, What-If, Summarize Progress) removed from toolbar
  // They are now only accessible via Intelligence Hub
  const hasAITools = onPackWeek || onCatchUp;
  const aiToolsTool = null; // No longer showing collapsed AI Tools menu

  const renderToolButton = (tool, index, isLastInGroup = false) => {
    const Icon = tool.icon;
    const isActive = activeTool === tool.key;
    
    return (
      <TouchableOpacity
        key={tool.key}
        style={[
          styles.toolButton,
          isActive && styles.toolButtonActive,
        ]}
        onPress={tool.onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={tool.label}
      >
        <Icon 
          size={18} 
          color={isActive ? '#475569' : 'rgba(15,23,42,0.6)'} 
        />
        <Text style={[styles.toolLabel, isActive && styles.toolLabelActive]}>
          {tool.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.toolbar}>
      {/* Group A: Core Actions */}
      {coreTools.map((tool, index) => 
        renderToolButton(tool, index, index === coreTools.length - 1)
      )}
      
      {/* Divider after Group A */}
      <View style={styles.divider} />
      
      
      {/* Group C: AI Tools (only if available) */}
      {aiToolsTool && renderToolButton(aiToolsTool, coreTools.length + 1, true)}

      {/* Add from Link Modal */}
      <AddFromLinkModal
        visible={showAddFromLinkModal}
        onClose={() => setShowAddFromLinkModal(false)}
        familyId={familyId}
        children={children}
        onCreated={() => {
          setShowAddFromLinkModal(false);
          // Optionally refresh planner data
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'column',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 8,
    width: '100%',
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  toolButtonActive: {
    backgroundColor: 'rgba(71, 85, 105, 0.12)',
  },
  toolLabel: {
    fontSize: 13,
    color: 'rgba(15,23,42,0.7)',
    fontWeight: '500',
  },
  toolLabelActive: {
    color: '#475569',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.24)',
    alignSelf: 'stretch',
    marginVertical: 8,
  },
  childFilterList: {
    marginLeft: 34, // Align with text (icon width + gap)
    marginTop: 4,
    marginBottom: 8,
    gap: 4,
  },
  childFilterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: 'rgba(71, 85, 105, 0.1)',
    borderColor: '#475569',
  },
  childFilterLabel: {
    fontSize: 13,
    color: 'rgba(15,23,42,0.7)',
    fontWeight: '400',
  },
  childFilterLabelActive: {
    color: 'rgba(15,23,42,0.9)',
    fontWeight: '500',
  },
});

