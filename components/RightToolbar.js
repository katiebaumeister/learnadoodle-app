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
  BarChart3
} from 'lucide-react';
import { TOOL_META } from '../lib/toolTypes';
import { checkFeatureFlags } from '../lib/services/yearClient';

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
}) {
  const [hoveredTool, setHoveredTool] = useState(null);
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
      key: 'search', 
      icon: Search, 
      label: 'Search',
      onPress: onSearch,
      color: '#64748b'
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
  ];

  // Group B: Settings (collapsed)
  const settingsTool = {
    key: 'settings',
    icon: SlidersHorizontal,
    label: 'Settings',
    onPress: onSettings,
    color: '#0ea5e9'
  };

  // Group C: AI Tools (collapsed, shown only when available)
  const hasAITools = onPlanYear || onHeatmap || onPackWeek || onCatchUp || onSummarizeProgress || onAnalytics || onWhatIfAnalysis;
  const aiToolsTool = hasAITools ? {
    key: 'ai_tools',
    icon: Sparkles,
    label: 'AI Tools',
    onPress: onAITools,
    color: '#8b5cf6'
  } : null;

  const renderToolButton = (tool, index, isLastInGroup = false) => {
    const Icon = tool.icon;
    const isActive = activeTool === tool.key;
    const isHovered = hoveredTool === tool.key;
    const toolMeta = TOOL_META[tool.key] || { label: tool.label, desc: '' };
    
    return (
      <View key={tool.key} style={styles.toolButtonWrapper}>
        {isHovered && Platform.OS === 'web' && (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipLabel}>{toolMeta.label}</Text>
            {toolMeta.desc && (
              <Text style={styles.tooltipDesc}>{toolMeta.desc}</Text>
            )}
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.toolButton,
            isActive && styles.toolButtonActive,
            isLastInGroup && styles.lastButtonInGroup,
          ]}
          onPress={tool.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={tool.label}
          {...(Platform.OS === 'web' && {
            onMouseEnter: () => setHoveredTool(tool.key),
            onMouseLeave: () => setHoveredTool(null),
          })}
        >
          <View style={[
            styles.iconWrapper,
            isActive && styles.iconWrapperActive,
            isHovered && !isActive && styles.iconWrapperHovered,
          ]}>
            <Icon 
              size={20} 
              color={
                isActive 
                  ? '#ffffff' 
                  : isHovered 
                    ? tool.color 
                    : 'rgba(15,23,42,0.6)'
              } 
            />
          </View>
        </TouchableOpacity>
      </View>
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
      
      {/* Group B: Settings */}
      {renderToolButton(settingsTool, coreTools.length, false)}
      
      {/* Group C: AI Tools (only if available) */}
      {aiToolsTool && renderToolButton(aiToolsTool, coreTools.length + 1, true)}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    paddingVertical: 16,
  },
  toolButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  toolButtonActive: {
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  lastButtonInGroup: {
    marginBottom: 4,
  },
  divider: {
    width: 24,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.1)',
    marginVertical: 8,
    marginHorizontal: 'auto',
  },
  iconWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    transition: Platform.OS === 'web' ? 'all 0.2s ease' : undefined,
  },
  iconWrapperActive: {
    backgroundColor: '#6366f1',
  },
  iconWrapperHovered: {
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  toolButtonWrapper: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  tooltip: {
    position: 'absolute',
    right: '100%',
    marginRight: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 140,
    maxWidth: 200,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    }),
  },
  tooltipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 1,
  },
  tooltipDesc: {
    fontSize: 10,
    color: '#6b7280',
    lineHeight: 12,
  },
});

