import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { 
  Calendar, 
  Target, 
  Search, 
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
  CalendarPlus,
  Pencil,
  ClipboardList,
  Download,
  Filter
} from 'lucide-react';
import { TOOL_META } from '../lib/toolTypes';
import { checkFeatureFlags } from '../lib/services/yearClient';

export default function RightToolbar({
  onTasks,
  onBacklog,
  onCalendarIntegration,
  onWeeklyObjectives,
  onSearch,
  onRebalance,
  onBuildPlan,
  onEditPlan,
  onAttendance,
  onExport,
  onFilters,
  filtersButtonRef,
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
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [yearPlansEnabled, setYearPlansEnabled] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  
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
    ...(onBuildPlan ? [{ key: 'build-plan', icon: CalendarPlus, label: 'Build plan', onPress: onBuildPlan, color: '#0d9488' }] : []),
    ...(onEditPlan ? [{ key: 'edit-plan', icon: Pencil, label: 'Edit plan', onPress: onEditPlan, color: '#6366f1' }] : []),
    ...(onAttendance ? [{ key: 'attendance', icon: ClipboardList, label: 'Attendance', onPress: onAttendance, color: '#059669' }] : []),
    { 
      key: 'rebalance', 
      icon: RefreshCw, 
      label: 'Rebalance',
      onPress: onRebalance,
      color: '#f59e0b'
    },
    ...(onFilters ? [{ key: 'filters', icon: Filter, label: 'Filters', onPress: onFilters, color: '#64748b', _ref: filtersButtonRef }] : []),
    ...(onExport ? [{ key: 'export', icon: Download, label: 'Export', onPress: onExport, color: '#64748b' }] : []),
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

  const handleToolHover = (tool, isEnter, event) => {
    if (Platform.OS !== 'web') return;
    if (isEnter) {
      setHoveredTool((prev) => (prev === tool.key ? prev : tool.key));
      const node = event?.currentTarget || event?.target;
      if (node && typeof node.getBoundingClientRect === 'function') {
        const rect = node.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.bottom;
        setTooltipPos((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
      }
    } else {
      setHoveredTool((prev) => (prev == null ? prev : null));
    }
  };

  const renderToolButton = (tool, index, isLastInGroup = false) => {
    const Icon = tool.icon;
    const isActive = activeTool === tool.key;
    
    return (
      <TouchableOpacity
        key={tool.key}
        ref={tool._ref}
        style={[
          styles.toolButton,
          isActive && styles.toolButtonActive,
        ]}
        onPress={tool.onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={tool.label}
        {...(Platform.OS === 'web' && {
          onMouseEnter: (e) => handleToolHover(tool, true, e),
          onMouseLeave: (e) => handleToolHover(tool, false, e),
        })}
      >
        <Icon
          size={20}
          color={isActive ? 'rgba(99, 102, 241, 1)' : 'rgba(15,23,42,0.6)'}
        />
      </TouchableOpacity>
    );
  };

  const hoveredToolLabel = coreTools.find(t => t.key === hoveredTool)?.label || (aiToolsTool?.key === hoveredTool ? aiToolsTool?.label : '');

  return (
    <View style={styles.toolbar}>
      {/* Group A: Core Actions */}
      {coreTools.map((tool, index) => 
        renderToolButton(tool, index, index === coreTools.length - 1)
      )}
      
      {/* Group C: AI Tools (only if available) */}
      {aiToolsTool && renderToolButton(aiToolsTool, coreTools.length + 1, true)}

      {/* Tooltip on hover (web only) - render via portal to avoid clipping */}
      {Platform.OS === 'web' && hoveredTool && hoveredToolLabel && (() => {
        let ReactDOM;
        try { ReactDOM = require('react-dom'); } catch (e) { return null; }
        const tooltipEl = (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                position: 'fixed',
                left: tooltipPos.x,
                top: tooltipPos.y,
                transform: [{ translateX: '-50%' }],
                marginTop: -4,
              },
            ]}
          >
            <Text style={styles.tooltipText}>{hoveredToolLabel}</Text>
          </View>
        );
        return ReactDOM.createPortal ? ReactDOM.createPortal(tooltipEl, document.body) : tooltipEl;
      })()}

    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'column',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 4,
    width: '100%',
    alignItems: 'center',
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  toolButtonActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.5)',
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
  tooltip: {
    backgroundColor: '#1F2937',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 10000,
    ...(Platform.OS === 'web' && { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }),
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
});

