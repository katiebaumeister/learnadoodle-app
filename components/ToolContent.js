import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, Alert } from 'react-native';
import { X, Search as SearchIcon } from 'lucide-react';
import { colors, shadows } from '../theme/colors';
import { fetchChildren, fetchTasks } from '../lib/toolData';
import { proposeReschedule } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import { TOOL_KEYS } from '../lib/toolTypes';
import PlannerHealthPanel from '../app/components/schedule/PlannerHealthPanel';
import ChipsBar from './ChipsBar';
import TaskList from './TaskList';
import TasksPane from './TasksPane';
import BacklogPane from './BacklogPane';
import BacklogBoard from './backlog/BacklogBoard';
import RebalancePane from './RebalancePane';
import AIModal from './AIModal';
import PackWeekModal from './ai/PackWeekModal';
import SuperpowerModal from './ai/SuperpowerModal';
import EventSearch from './EventSearch';
import { useToast } from './Toast';
import GoogleCalendarConnect from './GoogleCalendarConnect';
import ScheduleRulesView from './ScheduleRulesView';
import BlackoutPanel from './planner/BlackoutPanel';
import CurriculumHeatmap from './year/CurriculumHeatmap';
import WeeklyOverviewEmailModal from './email/WeeklyOverviewEmailModal';
import ParentCoachingModule from './parent/ParentCoachingModule';
import CourseOverviewPage from './course/CourseOverviewPage';
import SyllabusScanner from './syllabus/SyllabusScanner';
import MultiYearPlanningWizard from './year/MultiYearPlanningWizard';

/**
 * Add an AI suggestion to the calendar as an event
 */
async function addSuggestionToCalendar(suggestion, familyId) {
  try {
    // Parse dates from suggestion
    const startTs = suggestion.proposedStart 
      ? new Date(suggestion.proposedStart).toISOString()
      : new Date().toISOString();
    
    // Calculate end time (default to 30 minutes if not provided)
    let endTs;
    if (suggestion.proposedEnd) {
      endTs = new Date(suggestion.proposedEnd).toISOString();
    } else {
      const start = new Date(startTs);
      endTs = new Date(start.getTime() + 30 * 60 * 1000).toISOString(); // 30 min default
    }

    // Extract child_id from suggestion if available
    // Suggestions might have childId or child_id field
    const childId = suggestion.childId || suggestion.child_id || null;

    const eventData = {
      family_id: familyId,
      child_id: childId,
      title: suggestion.title || 'AI Suggested Event',
      description: suggestion.notes || null,
      start_ts: startTs,
      end_ts: endTs,
      status: 'scheduled',
      source: 'ai',
      ai_generated: true,
      ai_reasoning: suggestion.notes || null,
    };

    const { data, error } = await supabase
      .from('events')
      .insert([eventData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export default function ToolContent({
  toolKey,
  familyId,
  children: childrenProp = [],
  onClose,
  onOpenKanban,
  onScheduleRules,
  onBlackouts,
  onCalendarIntegration,
  onWeeklyObjectives,
  onPlanYear,
  onHeatmap,
  onPackWeek,
  onCatchUp,
  onSummarizeProgress,
  onAnalytics,
  onWhatIfAnalysis,
}) {
  const [children, setChildren] = useState(childrenProp);
  const [activeChildIds, setActiveChildIds] = useState([]);
  const [activeLabels, setActiveLabels] = useState([]);
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState([]);
  const [timeframe, setTimeframe] = useState('7d');
  const [objectives, setObjectives] = useState([]);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiModalKey, setAiModalKey] = useState(null);
  const [showPackWeekModal, setShowPackWeekModal] = useState(false);
  const [settingsSubtab, setSettingsSubtab] = useState('schedule_rules');
  const [aiToolsSubtab, setAiToolsSubtab] = useState('plan-year');
  const [showSuperpowerModal, setShowSuperpowerModal] = useState(false);
  const [selectedSuperpower, setSelectedSuperpower] = useState(null);
  const [backlogView, setBacklogView] = useState('list'); // 'list' or 'board'
  const toast = useToast();

  // Redirect blackouts tab to availability (blackouts are now part of Availability)
  useEffect(() => {
    if (toolKey === TOOL_KEYS.SETTINGS && settingsSubtab === 'blackouts') {
      setSettingsSubtab('schedule_rules');
    }
  }, [toolKey, settingsSubtab]);

  // Set default AI Tools subtab when toolKey changes to AI_TOOLS
  useEffect(() => {
    if (toolKey === TOOL_KEYS.AI_TOOLS) {
      if (onPlanYear) {
        setAiToolsSubtab('plan-year');
      } else if (onHeatmap) {
        setAiToolsSubtab('heatmap');
      } else if (onPackWeek) {
        setAiToolsSubtab('pack-week');
      } else if (onCatchUp) {
        setAiToolsSubtab('catch-up');
      } else if (onSummarizeProgress) {
        setAiToolsSubtab('summarize-progress');
      } else if (onWhatIfAnalysis) {
        setAiToolsSubtab('whatif');
      } else if (onAnalytics) {
        setAiToolsSubtab('analytics');
      }
    }
  }, [toolKey, onPlanYear, onHeatmap, onPackWeek, onCatchUp, onSummarizeProgress, onWhatIfAnalysis, onAnalytics]);

  // Fetch children on mount if not provided
  useEffect(() => {
    if (childrenProp.length === 0) {
      fetchChildren().then((data) => {
        setChildren(data);
      });
    }
  }, [childrenProp]);

  const effectiveChildren = children.length > 0 ? children : childrenProp;

  const refresh = useCallback(async () => {
    if (!toolKey) return;

    let scope = 'tasksTodayToWeekEnd';
    let from = null;
    let to = null;

    switch (toolKey) {
      case TOOL_KEYS.TASKS:
        scope = 'tasksTodayToWeekEnd';
        const today = new Date();
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
        from = today.toISOString().split('T')[0];
        to = endOfWeek.toISOString().split('T')[0];
        break;
      case TOOL_KEYS.BACKLOG:
        scope = 'backlog';
        break;
      case TOOL_KEYS.COMPLETED:
        scope = 'completed';
        const now = new Date();
        const daysAgo = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : null;
        if (daysAgo) {
          from = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        }
        break;
      case TOOL_KEYS.SEARCH:
        scope = 'search';
        break;
      default:
        return;
    }

    const results = await fetchTasks({
      scope,
      from,
      to,
      children: activeChildIds.length > 0 ? activeChildIds : undefined,
      labels: activeLabels.length > 0 ? activeLabels : undefined,
      query: toolKey === TOOL_KEYS.SEARCH ? query : undefined,
    });

    setTasks(results || []);
  }, [toolKey, activeChildIds, activeLabels, timeframe, query]);

  // Debounced search for Search tool
  useEffect(() => {
    if (toolKey !== TOOL_KEYS.SEARCH || !query.trim()) {
      return;
    }
    const timeoutId = setTimeout(() => {
      refresh();
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [query, toolKey, refresh]);

  // Refresh tasks when filters or timeframe change
  useEffect(() => {
    if (toolKey && toolKey !== TOOL_KEYS.CALENDAR && toolKey !== TOOL_KEYS.WEEKLY_OBJECTIVES && toolKey !== TOOL_KEYS.SEARCH && toolKey !== TOOL_KEYS.HEALTH) {
      refresh();
    }
  }, [toolKey, activeChildIds, activeLabels, timeframe, refresh]);

  const toggleChild = useCallback((childId) => {
    setActiveChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  }, []);

  const toggleLabel = useCallback((label) => {
    setActiveLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  }, []);

  const handleAIAccept = useCallback(async (suggestion) => {
    if (!familyId) {
      toast.push('Family ID not found', 'error');
      return;
    }

    try {
      const result = await addSuggestionToCalendar(suggestion, familyId);
      if (result.error) {
        throw result.error;
      }
      toast.push('Added to calendar', 'success');
      
      // Refresh tasks if we're on a task view
      if (toolKey === TOOL_KEYS.TASKS || toolKey === TOOL_KEYS.BACKLOG) {
        refresh();
      }
    } catch (error) {
      toast.push('Failed to add to calendar', 'error');
    }
  }, [familyId, toast, toolKey, refresh]);

  const runRebalance = useCallback(async () => {
    if (!familyId) return [];
    
    // Use selected children or all children if none selected
    const childIdsToUse = activeChildIds.length > 0 
      ? activeChildIds 
      : effectiveChildren.map(c => c.id).filter(Boolean);
    
    if (childIdsToUse.length === 0) {
      throw new Error('No children available for scheduling');
    }
    
    try {
      const result = await proposeReschedule({
        familyId,
        weekStart: new Date(),
        childIds: childIdsToUse,
        horizonWeeks: 2,
        reason: 'rebalance',
      });
      
      if (result.error) {
        throw result.error;
      }

      // Transform persisted changes directly (more reliable than matching with proposal)
      const persistedChanges = result.data?.changes || [];
      const suggestions = [];
      
      persistedChanges.forEach((change, idx) => {
        const payload = change.payload || {};
        const changeType = change.change_type;
        
        if (changeType === 'add') {
          suggestions.push({
            id: change.id || `rebalance-add-${idx}`,
            title: payload.title || 'Rescheduled Event',
            proposedStart: payload.start,
            proposedEnd: payload.end,
            notes: `Add: ${payload.title || 'New event'}`,
            childId: payload.child_id,
            changeType: 'add',
            changeId: change.id,
          });
        } else if (changeType === 'move') {
          suggestions.push({
            id: change.id || `rebalance-move-${idx}`,
            title: payload.reason || 'Rescheduled Event',
            proposedStart: payload.to_start,
            proposedEnd: payload.to_end,
            notes: `Move: ${payload.reason || 'AI rebalanced schedule'}`,
            eventId: payload.event_id || change.event_id,
            fromStart: payload.from_start,
            fromEnd: payload.from_end,
            changeType: 'move',
            changeId: change.id,
          });
        } else if (changeType === 'delete') {
          suggestions.push({
            id: change.id || `rebalance-delete-${idx}`,
            title: payload.reason || 'Delete Event',
            proposedStart: null,
            proposedEnd: null,
            notes: `Delete: ${payload.reason || 'Remove event'}`,
            eventId: payload.event_id || change.event_id,
            changeType: 'delete',
            changeId: change.id,
          });
        }
      });
      
      return suggestions;
    } catch (err) {
      throw new Error('Failed to rebalance schedule');
    }
  }, [familyId, activeChildIds, effectiveChildren]);

  // Pack week now handled by PackWeekModal component

  const runWhatIf = useCallback(async () => {
    if (!familyId) return [];
    
    // Use selected children or all children if none selected
    const childIdsToUse = activeChildIds.length > 0 
      ? activeChildIds 
      : effectiveChildren.map(c => c.id).filter(Boolean);
    
    if (childIdsToUse.length === 0) {
      return [];
    }
    
    try {
      // What-if analysis: simulate different scenarios
      // For now, we'll use proposeReschedule with a what-if reason
      const result = await proposeReschedule({
        familyId,
        weekStart: new Date(),
        childIds: childIdsToUse,
        horizonWeeks: 2,
        reason: 'what_if',
      });
      
      if (result.error) {
        throw result.error;
      }

      // Transform persisted changes directly (more reliable than matching with proposal)
      const persistedChanges = result.data?.changes || [];
      const suggestions = [];
      
      persistedChanges.forEach((change, idx) => {
        const payload = change.payload || {};
        const changeType = change.change_type;
        
        if (changeType === 'add') {
          suggestions.push({
            id: change.id || `whatif-add-${idx}`,
            title: payload.title || 'What-if Event',
            proposedStart: payload.start,
            proposedEnd: payload.end,
            notes: `What-if: ${payload.title || 'New scenario'}`,
            childId: payload.child_id,
            changeType: 'add',
            changeId: change.id,
          });
        } else if (changeType === 'move') {
          suggestions.push({
            id: change.id || `whatif-move-${idx}`,
            title: payload.reason || 'What-if Move',
            proposedStart: payload.to_start,
            proposedEnd: payload.to_end,
            notes: `What-if: ${payload.reason || 'Alternative schedule'}`,
            eventId: payload.event_id || change.event_id,
            fromStart: payload.from_start,
            fromEnd: payload.from_end,
            changeType: 'move',
            changeId: change.id,
          });
        } else if (changeType === 'delete') {
          suggestions.push({
            id: change.id || `whatif-delete-${idx}`,
            title: payload.reason || 'What-if Delete',
            proposedStart: null,
            proposedEnd: null,
            notes: `What-if: ${payload.reason || 'Remove event'}`,
            eventId: payload.event_id || change.event_id,
            changeType: 'delete',
            changeId: change.id,
          });
        }
      });
      
      return suggestions;
    } catch (err) {
      // Return empty array instead of throwing for what-if (it's exploratory)
      return [];
    }
  }, [familyId, activeChildIds, effectiveChildren]);

  const renderHeader = (title, rightContent) => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerRight}>
        {rightContent}
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <X size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Handle Esc key
  useEffect(() => {
    if (!toolKey || Platform.OS !== 'web') return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [toolKey, onClose]);

  if (!toolKey) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Select a tool on the left...</Text>
      </View>
    );
  }

  switch (toolKey) {
    case TOOL_KEYS.TASKS:
      return (
        <TasksPane
          tasks={tasks}
          children={effectiveChildren}
          activeChildIds={activeChildIds}
          onToggleChild={toggleChild}
          activeLabels={activeLabels}
          onToggleLabel={toggleLabel}
          onClose={onClose}
          onOpenKanban={onOpenKanban}
          onAddTask={() => {
            // TODO: Open add task modal
}}
          onSearchTasks={() => {
            // TODO: Focus search or open search pane
}}
          onEditTask={(task) => {
            // TODO: Open edit task modal
}}
          onViewTask={(task) => {
            // TODO: Open task details
}}
          onMarkComplete={(task) => {
            // TODO: Mark task as complete

            refresh();
          }}
        />
      );

    case TOOL_KEYS.SEARCH:
      return (
        <EventSearch
          familyId={familyId}
          children={children}
          onEventSelect={(event) => {
          }}
          onClose={onClose}
        />
      );

    case TOOL_KEYS.BACKLOG:
      if (backlogView === 'board') {
        return (
          <BacklogBoard
            tasks={tasks}
            children={effectiveChildren}
            activeChildIds={activeChildIds}
            onToggleChild={toggleChild}
            activeLabels={activeLabels}
            onToggleLabel={toggleLabel}
            onClose={onClose}
            onAddTask={(text, columnId) => {
              // TODO: Add task to backlog with column
              toast.push('Task added to backlog', 'success');
              refresh();
            }}
            onEditTask={(task) => {
              // TODO: Open edit task modal
}}
            onMoveTask={(task, fromColumn, toColumn) => {
              // TODO: Move task between columns

              refresh();
            }}
            onUpdateTaskStatus={(task, newStatus) => {
              // TODO: Update task status

              refresh();
            }}
            onDeleteTask={(task) => {
              // TODO: Delete task

              refresh();
            }}
          />
        );
      }
      
      return (
        <BacklogPane
          tasks={tasks}
          children={effectiveChildren}
          activeChildIds={activeChildIds}
          onToggleChild={toggleChild}
          activeLabels={activeLabels}
          onToggleLabel={toggleLabel}
          onClose={onClose}
          onOpenKanban={() => setBacklogView('board')}
          onAddTask={(text) => {
            // TODO: Add task to backlog
            toast.push('Task added to backlog', 'success');
            refresh();
          }}
          onEditTask={(task) => {
            // TODO: Open edit task modal
}}
          onMoveToSchedule={(task) => {
            // TODO: Move task to schedule

            refresh();
          }}
          onMarkReady={(task) => {
            // TODO: Mark task as ready

            refresh();
          }}
          onDeleteTask={(task) => {
            // TODO: Delete task

            refresh();
          }}
        />
      );

    case TOOL_KEYS.COMPLETED:
      return (
        <View style={styles.container}>
          {renderHeader(
            'Completed',
            <View style={styles.timeframeSelector}>
              <TouchableOpacity
                onPress={() => setTimeframe('7d')}
                style={[styles.timeframeButton, timeframe === '7d' && styles.timeframeButtonActive]}
              >
                <Text style={[styles.timeframeButtonText, timeframe === '7d' && styles.timeframeButtonTextActive]}>
                  7d
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTimeframe('30d')}
                style={[styles.timeframeButton, timeframe === '30d' && styles.timeframeButtonActive]}
              >
                <Text style={[styles.timeframeButtonText, timeframe === '30d' && styles.timeframeButtonTextActive]}>
                  30d
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTimeframe('90d')}
                style={[styles.timeframeButton, timeframe === '90d' && styles.timeframeButtonActive]}
              >
                <Text style={[styles.timeframeButtonText, timeframe === '90d' && styles.timeframeButtonTextActive]}>
                  90d
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTimeframe('all')}
                style={[styles.timeframeButton, timeframe === 'all' && styles.timeframeButtonActive]}
              >
                <Text style={[styles.timeframeButtonText, timeframe === 'all' && styles.timeframeButtonTextActive]}>
                  All
                </Text>
              </TouchableOpacity>
            </View>
          )}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <ChipsBar
              childrenList={children}
              activeChildIds={activeChildIds}
              onToggleChild={toggleChild}
              activeLabels={activeLabels}
              onToggleLabel={toggleLabel}
            />
            <TaskList tasks={tasks} emptyText="No completed tasks" isCompleted={true} />
          </ScrollView>
        </View>
      );

    case TOOL_KEYS.WEEKLY_OBJECTIVES:
      return (
        <View style={styles.container}>
          {renderHeader(
            'Weekly Objectives',
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => {
                if (Platform.OS === 'web') {
                  const newObjective = window.prompt('Enter a new weekly objective:');
                  if (newObjective && newObjective.trim()) {
                    setObjectives((prev) => [...prev, newObjective.trim()]);
                    toast.push('Objective added', 'success');
                  }
                } else {
                  Alert.prompt(
                    'New Objective',
                    'Enter a new weekly objective:',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Add',
                        onPress: (text) => {
                          if (text && text.trim()) {
                            setObjectives((prev) => [...prev, text.trim()]);
                            toast.push('Objective added', 'success');
                          }
                        },
                      },
                    ],
                    'plain-text'
                  );
                }
              }}
            >
              <Text style={styles.headerButtonText}>+ Add</Text>
            </TouchableOpacity>
          )}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <View style={styles.objectivesList}>
              {objectives.map((obj, idx) => (
                <View key={idx} style={styles.objectiveItem}>
                  <Text style={styles.objectiveText}>{obj}</Text>
                  <TouchableOpacity
                    style={styles.objectiveDelete}
                    onPress={() => {
                      setObjectives((prev) => prev.filter((_, i) => i !== idx));
                      toast.push('Objective removed', 'info');
                    }}
                  >
                    <X size={16} color="#6b7280" />
                  </TouchableOpacity>
                </View>
              ))}
              {objectives.length === 0 && (
                <Text style={styles.emptyText}>No objectives set. Click "+ Add" to create one.</Text>
              )}
            </View>
          </ScrollView>
        </View>
      );

    case TOOL_KEYS.CALENDAR:
      return (
        <View style={styles.container}>
          {renderHeader('Calendar Integration')}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <View style={styles.integrationStack}>
              <GoogleCalendarConnect
                familyId={familyId}
                onConnected={() => {
                  toast.push('Google Calendar ready. Run a sync to push upcoming events.', 'success');
                }}
              />
              <View style={styles.integrationCard}>
                <Text style={styles.integrationTitle}>Apple Calendar</Text>
                <Text style={styles.integrationDescription}>
                  Subscribe to your Learnadoodle planner via ICS. Copy the link below into Apple Calendar.
                </Text>
                <TouchableOpacity style={styles.disabledButton} disabled>
                  <Text style={styles.disabledButtonText}>Copy ICS Link</Text>
                </TouchableOpacity>
                <Text style={styles.helperText}>
                  ICS subscriptions are coming soon. For now, you can manually download your schedule from the Planner.
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      );

    case TOOL_KEYS.SCHEDULE_RULES:
      return (
        <View style={styles.panelWrapper}>
          <ScheduleRulesView familyId={familyId} children={effectiveChildren} />
        </View>
      );

    case TOOL_KEYS.BLACKOUTS:
      return (
        <View style={styles.panelWrapper}>
          <BlackoutPanel familyId={familyId} children={effectiveChildren} />
        </View>
      );

    case TOOL_KEYS.REBALANCE:
      return (
        <RebalancePane
          familyId={familyId}
          children={effectiveChildren}
          activeChildIds={activeChildIds}
          onClose={onClose}
          runRebalance={runRebalance}
          onAcceptSuggestion={handleAIAccept}
          onAcceptAll={async (suggestions) => {
            // Accept all suggestions
            for (const suggestion of suggestions || []) {
              try {
                await handleAIAccept(suggestion);
              } catch (err) {
              }
            }
          }}
        />
      );

    case TOOL_KEYS.PACK_THIS_WEEK:
      return (
        <View style={styles.container}>
          {renderHeader('Pack This Week')}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.description}>
              AI will help you pack your week efficiently by suggesting optimal task scheduling.
            </Text>
            <TouchableOpacity
              style={styles.aiButton}
              onPress={() => setShowPackWeekModal(true)}
            >
              <Text style={styles.aiButtonText}>Pack This Week</Text>
            </TouchableOpacity>
            <PackWeekModal
              visible={showPackWeekModal}
              familyId={familyId}
              children={effectiveChildren}
              onClose={() => setShowPackWeekModal(false)}
            />
          </ScrollView>
        </View>
      );

    case TOOL_KEYS.WHAT_IF:
      return (
        <View style={styles.container}>
          {renderHeader('What-if Analysis')}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.description}>
              Analyze different scheduling scenarios to see how changes would affect your calendar.
            </Text>
            <TouchableOpacity
              style={styles.aiButton}
              onPress={() => {
                setAiModalKey(TOOL_KEYS.WHAT_IF);
                setShowAIModal(true);
              }}
            >
              <Text style={styles.aiButtonText}>Run What-if Analysis</Text>
            </TouchableOpacity>
            <AIModal
              title="What-if Analysis"
              open={showAIModal && aiModalKey === TOOL_KEYS.WHAT_IF}
              onClose={() => {
                setShowAIModal(false);
                setAiModalKey(null);
              }}
              run={runWhatIf}
              onAccept={handleAIAccept}
            />
          </ScrollView>
        </View>
      );

    case TOOL_KEYS.HEATMAP:
      // Default to current year range, or last 12 weeks
      const today = new Date();
      const defaultStart = new Date(today.getFullYear(), 0, 1); // Jan 1 of current year
      const defaultEnd = new Date(today.getFullYear(), 11, 31); // Dec 31 of current year
      
      return (
        <View style={styles.container}>
          {renderHeader('Curriculum Heatmap')}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <CurriculumHeatmap
              familyId={familyId}
              startDate={defaultStart.toISOString().split('T')[0]}
              endDate={defaultEnd.toISOString().split('T')[0]}
              onClose={onClose}
            />
          </ScrollView>
        </View>
      );

    case TOOL_KEYS.SETTINGS:

      // Determine header title based on active subtab
      const getSettingsHeaderTitle = () => {
        switch (settingsSubtab) {
          case 'schedule_rules':
            return 'Availability';
          case 'calendar':
            return 'Calendar Integrations';
          case 'objectives':
            return 'Weekly Objectives';
          case 'email':
            return 'Email Preferences';
          case 'coaching':
            return 'Parent Coaching';
          default:
            return 'Settings';
        }
      };
      
      return (
        <View style={styles.container}>
          {renderHeader(
            getSettingsHeaderTitle(),
            settingsSubtab === 'objectives' && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    const newObjective = window.prompt('Enter a new weekly objective:');
                    if (newObjective && newObjective.trim()) {
                      setObjectives((prev) => [...prev, newObjective.trim()]);
                      toast.push('Objective added', 'success');
                    }
                  } else {
                    Alert.prompt(
                      'New Objective',
                      'Enter a new weekly objective:',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Add',
                          onPress: (text) => {
                            if (text && text.trim()) {
                              setObjectives((prev) => [...prev, text.trim()]);
                              toast.push('Objective added', 'success');
                            }
                          },
                        },
                      ],
                      'plain-text'
                    );
                  }
                }}
              >
                <Text style={styles.headerButtonText}>+ Add</Text>
              </TouchableOpacity>
            )
          )}
          <View style={styles.subtabContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subtabRow}
            >
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'schedule_rules' && styles.subtabActive]}
                onPress={() => {
                  setSettingsSubtab('schedule_rules');
                }}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'schedule_rules' && styles.subtabTextActive]}>
                  Availability
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'calendar' && styles.subtabActive]}
                onPress={() => {
                  setSettingsSubtab('calendar');
                }}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'calendar' && styles.subtabTextActive]}>
                  Calendar Integrations
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'objectives' && styles.subtabActive]}
                onPress={() => {
                  setSettingsSubtab('objectives');
                }}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'objectives' && styles.subtabTextActive]}>
                  Weekly Objectives
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'email' && styles.subtabActive]}
                onPress={() => {
                  setSettingsSubtab('email');
                }}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'email' && styles.subtabTextActive]}>
                  Email
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'coaching' && styles.subtabActive]}
                onPress={() => {
                  setSettingsSubtab('coaching');
                }}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'coaching' && styles.subtabTextActive]}>
                  Coaching
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <View style={styles.settingsContent}>
            {settingsSubtab === 'schedule_rules' && (
              <ScheduleRulesView familyId={familyId} children={effectiveChildren} />
            )}
            {settingsSubtab === 'email' && (
              <WeeklyOverviewEmailModal
                visible={true}
                onClose={onClose}
                familyId={familyId}
                childIds={activeChildIds}
                weekStart={new Date().toISOString().split('T')[0]}
                children={effectiveChildren}
              />
            )}
            {settingsSubtab === 'coaching' && (
              <ParentCoachingModule
                familyId={familyId}
                childId={activeChildIds.length === 1 ? activeChildIds[0] : null}
              />
            )}
            {settingsSubtab === 'objectives' && (
              <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                <View style={styles.objectivesList}>
                  {objectives.map((obj, idx) => (
                    <View key={idx} style={styles.objectiveItem}>
                      <Text style={styles.objectiveText}>{obj}</Text>
                      <TouchableOpacity
                        style={styles.objectiveDelete}
                        onPress={() => {
                          setObjectives((prev) => prev.filter((_, i) => i !== idx));
                          toast.push('Objective removed', 'info');
                        }}
                      >
                        <X size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {objectives.length === 0 && (
                    <Text style={styles.emptyText}>No objectives set. Click "+ Add" to create one.</Text>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      );
    
    case TOOL_KEYS.HEALTH:
      return (
        <View style={styles.container}>
          <PlannerHealthPanel
            childId={activeChildIds.length === 1 ? activeChildIds[0] : undefined}
            familyId={familyId}
            onRefresh={() => {
              // Refresh can be handled by the panel itself
            }}
          />
        </View>
      );
    
    case TOOL_KEYS.AI_TOOLS:
      // Define the 3 superpowers with their modes
      const superpowers = [
        {
          id: 'fix-my-week',
          title: 'Fix My Week',
          description: 'Things got messy. Help me tidy and catch up.',
          modes: [
            {
              id: 'rebalance',
              title: 'Rebalance',
              description: 'Spread work more evenly so no day feels overloaded.',
              tagline: 'Good when week feels uneven',
              requires: () => true,
            },
            {
              id: 'catch-up',
              title: 'Catch Up',
              description: 'Find missed or overdue work and suggest a realistic catch-up plan.',
              tagline: 'Good when you\'ve missed days',
              requires: () => onCatchUp !== undefined,
            },
            {
              id: 'pack-week',
              title: 'Pack This Week',
              description: 'Fill open time this week with useful learning tasks from your backlog.',
              tagline: 'Make the most of the time you do have',
              requires: () => onPackWeek !== undefined,
            },
          ],
        },
        {
          id: 'plan-ahead',
          title: 'Plan Ahead',
          description: 'Help me think beyond just this week.',
          modes: [
            {
              id: 'plan-year',
              title: 'Plan the Year',
              description: 'Lay out a high-level plan for the whole year or term.',
              tagline: 'A bird\'s-eye view of the year, made practical',
              requires: () => onPlanYear !== undefined,
            },
            {
              id: 'what-if',
              title: 'What-If Scenarios',
              description: 'Test changes—like a new co-op day or a long trip—without touching your real calendar.',
              tagline: 'Try ideas safely before committing',
              requires: () => onWhatIfAnalysis !== undefined,
            },
          ],
        },
        {
          id: 'understand-progress',
          title: 'Understand Our Progress',
          description: 'Are we on track? What\'s working? What needs a tweak?',
          modes: [
            {
              id: 'summarize-progress',
              title: 'Progress Snapshot',
              description: 'A plain-language overview of what each child has been working on and how it\'s going.',
              tagline: 'From raw logs to a story you can actually read',
              requires: () => onSummarizeProgress !== undefined,
            },
            {
              id: 'analytics',
              title: 'Learning Analytics',
              description: 'Charts and numbers for hours, streaks, and subject balance.',
              tagline: 'See patterns over weeks and months',
              requires: () => onAnalytics !== undefined,
            },
            {
              id: 'heatmap',
              title: 'Curriculum Heatmap',
              description: 'Where has our effort gone this term?',
              tagline: 'Visualize subject coverage over time',
              requires: () => onHeatmap !== undefined,
            },
          ],
        },
      ];

      return (
        <View style={styles.container}>
          {renderHeader('AI Tools')}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.superpowerIntro}>
              Choose a superpower to get started:
            </Text>
            <View style={styles.superpowersContainer}>
              {superpowers.map((superpower) => (
                <TouchableOpacity
                  key={superpower.id}
                  style={styles.superpowerCard}
                  onPress={() => {
                    setSelectedSuperpower(superpower);
                    setShowSuperpowerModal(true);
                  }}
                >
                  <View style={styles.superpowerCardContent}>
                    <Text style={styles.superpowerTitle}>{superpower.title}</Text>
                    <Text style={styles.superpowerDescription}>{superpower.description}</Text>
                    <View style={styles.modesPreview}>
                      {superpower.modes.filter(m => m.requires()).slice(0, 3).map((mode, idx) => (
                        <View key={mode.id} style={styles.modePreviewBadge}>
                          <Text style={styles.modePreviewText}>{mode.title}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Superpower Modal */}
          {selectedSuperpower && (
            <SuperpowerModal
              visible={showSuperpowerModal}
              onClose={() => {
                setShowSuperpowerModal(false);
                setSelectedSuperpower(null);
              }}
              superpower={selectedSuperpower}
              familyId={familyId}
              children={effectiveChildren}
              activeChildIds={activeChildIds}
              onPlanYear={onPlanYear}
              onHeatmap={onHeatmap}
              onCatchUp={onCatchUp}
              onSummarizeProgress={onSummarizeProgress}
              onAnalytics={onAnalytics}
              runRebalance={runRebalance}
              runWhatIf={runWhatIf}
              handleAIAccept={handleAIAccept}
            />
          )}
        </View>
      );

    default:
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Unknown tool</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(229, 231, 235, 0.6)', // border-gray-200/60
  },
  panelWrapper: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(229, 231, 235, 0.6)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4, // Aligned with calendar top
    paddingBottom: 8,
    paddingHorizontal: 24, // px-6 (24px)
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(243, 244, 246, 0.7)', // border-gray-100/70
    backgroundColor: '#FAFAFA',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }),
  },
  headerTitle: {
    fontSize: 18, // text-[18px]
    fontWeight: '600', // font-semibold
    color: '#111827',
    letterSpacing: -0.5, // tracking-tight
    marginBottom: 4, // 4px margin-bottom
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 16, // px-4
    paddingVertical: 8,
    borderRadius: 12, // rounded-xl
    height: 36, // h-[36px]
    backgroundColor: '#7c8cff', // Pastel primary button
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#6c7bf3', // hover state
      },
    }),
  },
  headerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 12, // text-xs
    textTransform: 'uppercase',
    letterSpacing: 1, // tracking-wider
    color: 'rgba(107, 114, 128, 0.8)', // text-gray-500/80
    marginTop: 16, // mt-4
    marginBottom: 8, // mb-2
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      textDecorationColor: 'rgba(107, 114, 128, 0.2)',
    }),
  },
  standardCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12, // rounded-xl
    padding: 16, // p-4
    marginBottom: 16, // mb-4
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)', // shadow-[0_1px_2px_rgba(0,0,0,0.04)]
    }),
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24, // px-6 (24px) - unified
    paddingTop: 4, // pt-4 (16px) - aligned with header
    paddingBottom: 32, // pb-8 (32px)
  },
  settingsContent: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FAFAFA', // Unified background
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  timeframeSelector: {
    flexDirection: 'row',
    gap: 4,
  },
  timeframeButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999, // rounded-full
    backgroundColor: '#f3f4f6',
    borderWidth: 0,
  },
  timeframeButtonActive: {
    backgroundColor: '#e6eaff', // Soft pastel periwinkle
    borderWidth: 1,
    borderColor: '#7c8cff',
  },
  timeframeButtonText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
  },
  timeframeButtonTextActive: {
    color: '#4f46e5', // text-indigo-600
    fontWeight: '600',
  },
  objectivesList: {
    gap: 8,
  },
  objectiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  objectiveText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  objectiveDelete: {
    padding: 4,
    marginLeft: 8,
  },
  integrationStack: {
    gap: 16,
  },
  disabledButton: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    opacity: 0.6,
  },
  disabledButtonText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  integrationCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    gap: 12,
  },
  integrationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  integrationDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  aiButton: {
    backgroundColor: '#7c8cff', // Pastel primary button
    borderRadius: 12, // rounded-xl
    paddingVertical: 8,
    paddingHorizontal: 16,
    height: 36, // h-[36px]
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#6c7bf3', // hover state
      },
    }),
  },
  aiButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  subtabContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 99,
    }),
    ...shadows.sm,
  },
  subtabRow: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 0,
    minHeight: 48,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexWrap: 'nowrap',
    }),
  },
  subtab: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      whiteSpace: 'nowrap',
    }),
  },
  subtabActive: {
    borderBottomColor: colors.accent,
    backgroundColor: 'transparent',
  },
  subtabText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      whiteSpace: 'nowrap',
    }),
  },
  subtabTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  aiToolContent: {
    paddingVertical: 8,
  },
  superpowerIntro: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  superpowersContainer: {
    gap: 20,
  },
  superpowerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  superpowerCardContent: {
    padding: 24,
  },
  superpowerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  superpowerDescription: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 22,
  },
  modesPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modePreviewBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  modePreviewText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1e40af',
  },
  stepsContainer: {
    marginTop: 16,
    marginBottom: 20,
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  stepText: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  kanbanButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6', // Pale pastel
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
    }),
  },
  kanbanButtonText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  quickAddContainer: {
    marginBottom: 6, // Tightened spacing (reduced by 6px)
  },
  quickAddInput: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  emptyStateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16, // Reduced padding
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    }),
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  dragZone: {
    padding: 12, // Shrunk by 20% (from 16 to 12)
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    width: '80%', // Shrunk by 20%
    alignItems: 'center',
  },
  dragZoneText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  infoText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

