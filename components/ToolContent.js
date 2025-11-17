import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, Alert } from 'react-native';
import { X, Search as SearchIcon } from 'lucide-react';
import { fetchChildren, fetchTasks } from '../lib/toolData';
import { proposeReschedule } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import { TOOL_KEYS } from '../lib/toolTypes';
import ChipsBar from './ChipsBar';
import TaskList from './TaskList';
import AIModal from './AIModal';
import PackWeekModal from './ai/PackWeekModal';
import EventSearch from './EventSearch';
import { useToast } from './Toast';
import GoogleCalendarConnect from './GoogleCalendarConnect';
import ScheduleRulesView from './ScheduleRulesView';
import BlackoutPanel from './planner/BlackoutPanel';
import CurriculumHeatmap from './year/CurriculumHeatmap';

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
      console.error('Error adding suggestion to calendar:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in addSuggestionToCalendar:', error);
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
  const toast = useToast();

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
    if (toolKey && toolKey !== TOOL_KEYS.CALENDAR && toolKey !== TOOL_KEYS.WEEKLY_OBJECTIVES && toolKey !== TOOL_KEYS.SEARCH) {
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
      console.error('Error accepting suggestion:', error);
      toast.push('Failed to add to calendar', 'error');
    }
  }, [familyId, toast, toolKey, refresh]);

  const runRebalance = useCallback(async () => {
    if (!familyId) return [];
    try {
      const result = await proposeReschedule({
        familyId,
        weekStart: new Date(),
        childIds: activeChildIds.length > 0 ? activeChildIds : undefined,
        horizonWeeks: 2,
        reason: 'rebalance',
      });
      
      if (result.error) {
        throw result.error;
      }

      // Transform API response to suggestion format
      // The API might return suggestions in different formats
      const suggestions = result.data?.suggestions || result.data?.changes || [];
      
      return suggestions.map((s, idx) => ({
        id: s.id || `rebalance-${idx}`,
        title: s.title || s.event_title || 'Rescheduled Event',
        proposedStart: s.proposed_start || s.start_ts || s.proposedStart,
        proposedEnd: s.proposed_end || s.end_ts || s.proposedEnd,
        notes: s.reason || s.notes || s.ai_reasoning || 'AI rebalanced schedule',
        childId: s.child_id || s.childId,
      }));
    } catch (err) {
      console.error('Rebalance error:', err);
      throw new Error('Failed to rebalance schedule');
    }
  }, [familyId, activeChildIds]);

  // Pack week now handled by PackWeekModal component

  const runWhatIf = useCallback(async () => {
    if (!familyId) return [];
    try {
      // What-if analysis: simulate different scenarios
      // For now, we'll use proposeReschedule with a what-if reason
      const result = await proposeReschedule({
        familyId,
        weekStart: new Date(),
        childIds: activeChildIds.length > 0 ? activeChildIds : undefined,
        horizonWeeks: 2,
        reason: 'what_if',
      });
      
      if (result.error) {
        throw result.error;
      }

      const suggestions = result.data?.suggestions || result.data?.changes || [];
      
      return suggestions.map((s, idx) => ({
        id: s.id || `whatif-${idx}`,
        title: s.title || s.event_title || 'What-if Scenario',
        proposedStart: s.proposed_start || s.start_ts || s.proposedStart,
        proposedEnd: s.proposed_end || s.end_ts || s.proposedEnd,
        notes: s.reason || s.notes || s.ai_reasoning || 'What-if analysis scenario',
        childId: s.child_id || s.childId,
      }));
    } catch (err) {
      console.error('What-if error:', err);
      // Return empty array instead of throwing for what-if (it's exploratory)
      return [];
    }
  }, [familyId, activeChildIds]);

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
        <View style={styles.container}>
          {renderHeader(
            'Tasks',
            onOpenKanban && (
              <TouchableOpacity onPress={onOpenKanban} style={styles.headerButton}>
                <Text style={styles.headerButtonText}>Open Kanban</Text>
              </TouchableOpacity>
            )
          )}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <ChipsBar
              childrenList={children}
              activeChildIds={activeChildIds}
              onToggleChild={toggleChild}
              activeLabels={activeLabels}
              onToggleLabel={toggleLabel}
            />
            <TaskList tasks={tasks} emptyText="No tasks for this week" />
          </ScrollView>
        </View>
      );

    case TOOL_KEYS.SEARCH:
      return (
        <EventSearch
          familyId={familyId}
          children={children}
          onEventSelect={(event) => {
            console.log('Event selected:', event);
          }}
          onClose={onClose}
        />
      );

    case TOOL_KEYS.BACKLOG:
      return (
        <View style={styles.container}>
          {renderHeader('Backlog')}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <ChipsBar
              childrenList={children}
              activeChildIds={activeChildIds}
              onToggleChild={toggleChild}
              activeLabels={activeLabels}
              onToggleLabel={toggleLabel}
            />
            <TaskList tasks={tasks} emptyText="Add tasks you want to work on later." />
          </ScrollView>
        </View>
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
            <TaskList tasks={tasks} emptyText="No completed tasks" />
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
        <View style={styles.container}>
          {renderHeader('Rebalance Schedule')}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.description}>
              AI will analyze your schedule and suggest optimizations to balance workload across time.
            </Text>
            <TouchableOpacity
              style={styles.aiButton}
              onPress={() => {
                setAiModalKey(TOOL_KEYS.REBALANCE);
                setShowAIModal(true);
              }}
            >
              <Text style={styles.aiButtonText}>Run Rebalance</Text>
            </TouchableOpacity>
            <AIModal
              title="Rebalance Schedule"
              open={showAIModal && aiModalKey === TOOL_KEYS.REBALANCE}
              onClose={() => {
                setShowAIModal(false);
                setAiModalKey(null);
              }}
              run={runRebalance}
              onAccept={handleAIAccept}
            />
          </ScrollView>
        </View>
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
      console.log('[ToolContent] Rendering Settings panel, subtab:', settingsSubtab);
      console.log('[ToolContent] Settings props - familyId:', familyId, 'children:', effectiveChildren?.length);
      
      // Determine header title based on active subtab
      const getSettingsHeaderTitle = () => {
        switch (settingsSubtab) {
          case 'schedule_rules':
            return 'Schedule Rules';
          case 'blackouts':
            return 'Blackouts';
          case 'calendar':
            return 'Calendar Integrations';
          case 'objectives':
            return 'Weekly Objectives';
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
                  console.log('[ToolContent] Settings tab clicked: schedule_rules');
                  setSettingsSubtab('schedule_rules');
                }}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'schedule_rules' && styles.subtabTextActive]}>
                  Schedule Rules
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'blackouts' && styles.subtabActive]}
                onPress={() => {
                  console.log('[ToolContent] Settings tab clicked: blackouts');
                  setSettingsSubtab('blackouts');
                }}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'blackouts' && styles.subtabTextActive]}>
                  Blackouts
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subtab, settingsSubtab === 'calendar' && styles.subtabActive]}
                onPress={() => {
                  console.log('[ToolContent] Settings tab clicked: calendar');
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
                  console.log('[ToolContent] Settings tab clicked: objectives');
                  setSettingsSubtab('objectives');
                }}
              >
                <Text style={[styles.subtabText, settingsSubtab === 'objectives' && styles.subtabTextActive]}>
                  Weekly Objectives
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <View style={styles.settingsContent}>
            {settingsSubtab === 'schedule_rules' && (
              <>
                {console.log('[ToolContent] Rendering ScheduleRulesView')}
                <ScheduleRulesView 
                  familyId={familyId} 
                  children={effectiveChildren}
                  hideHeader={true}
                />
              </>
            )}
            {settingsSubtab === 'blackouts' && (
              <>
                {console.log('[ToolContent] Rendering BlackoutPanel')}
                <BlackoutPanel familyId={familyId} children={effectiveChildren} />
              </>
            )}
            {settingsSubtab === 'calendar' && (
              <>
                {console.log('[ToolContent] Rendering Calendar Integrations')}
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
              </>
            )}
            {settingsSubtab === 'objectives' && (
              <>
                {console.log('[ToolContent] Rendering Weekly Objectives')}
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
              </>
            )}
          </View>
        </View>
      );

    case TOOL_KEYS.AI_TOOLS:
      return (
        <View style={styles.container}>
          {renderHeader('AI Tools')}
          <View style={styles.subtabContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subtabRow}
            >
              {onPlanYear && (
                <TouchableOpacity
                  style={[styles.subtab, aiToolsSubtab === 'plan-year' && styles.subtabActive]}
                  onPress={() => setAiToolsSubtab('plan-year')}
                >
                  <Text style={[styles.subtabText, aiToolsSubtab === 'plan-year' && styles.subtabTextActive]}>
                    Plan the Year
                  </Text>
                </TouchableOpacity>
              )}
              {onHeatmap && (
                <TouchableOpacity
                  style={[styles.subtab, aiToolsSubtab === 'heatmap' && styles.subtabActive]}
                  onPress={() => setAiToolsSubtab('heatmap')}
                >
                  <Text style={[styles.subtabText, aiToolsSubtab === 'heatmap' && styles.subtabTextActive]}>
                    Heatmap
                  </Text>
                </TouchableOpacity>
              )}
              {onPackWeek && (
                <TouchableOpacity
                  style={[styles.subtab, aiToolsSubtab === 'pack-week' && styles.subtabActive]}
                  onPress={() => setAiToolsSubtab('pack-week')}
                >
                  <Text style={[styles.subtabText, aiToolsSubtab === 'pack-week' && styles.subtabTextActive]}>
                    Pack Week
                  </Text>
                </TouchableOpacity>
              )}
              {onCatchUp && (
                <TouchableOpacity
                  style={[styles.subtab, aiToolsSubtab === 'catch-up' && styles.subtabActive]}
                  onPress={() => setAiToolsSubtab('catch-up')}
                >
                  <Text style={[styles.subtabText, aiToolsSubtab === 'catch-up' && styles.subtabTextActive]}>
                    Catch Up
                  </Text>
                </TouchableOpacity>
              )}
              {onSummarizeProgress && (
                <TouchableOpacity
                  style={[styles.subtab, aiToolsSubtab === 'summarize-progress' && styles.subtabActive]}
                  onPress={() => setAiToolsSubtab('summarize-progress')}
                >
                  <Text style={[styles.subtabText, aiToolsSubtab === 'summarize-progress' && styles.subtabTextActive]}>
                    Summarize Progress
                  </Text>
                </TouchableOpacity>
              )}
              {onWhatIfAnalysis && (
                <TouchableOpacity
                  style={[styles.subtab, aiToolsSubtab === 'whatif' && styles.subtabActive]}
                  onPress={() => setAiToolsSubtab('whatif')}
                >
                  <Text style={[styles.subtabText, aiToolsSubtab === 'whatif' && styles.subtabTextActive]}>
                    What-If Analysis
                  </Text>
                </TouchableOpacity>
              )}
              {onAnalytics && (
                <TouchableOpacity
                  style={[styles.subtab, aiToolsSubtab === 'analytics' && styles.subtabActive]}
                  onPress={() => setAiToolsSubtab('analytics')}
                >
                  <Text style={[styles.subtabText, aiToolsSubtab === 'analytics' && styles.subtabTextActive]}>
                    Analytics
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {aiToolsSubtab === 'plan-year' && onPlanYear && (
              <View style={styles.aiToolContent}>
                <Text style={styles.description}>
                  Plan your entire year with AI-powered curriculum scheduling.
                </Text>
                <TouchableOpacity style={styles.aiButton} onPress={onPlanYear}>
                  <Text style={styles.aiButtonText}>Plan the Year</Text>
                </TouchableOpacity>
              </View>
            )}
            {aiToolsSubtab === 'heatmap' && onHeatmap && (
              <View style={styles.aiToolContent}>
                <CurriculumHeatmap
                  familyId={familyId}
                  startDate={new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]}
                  endDate={new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]}
                  onClose={onClose}
                />
              </View>
            )}
            {aiToolsSubtab === 'pack-week' && onPackWeek && (
              <View style={styles.aiToolContent}>
                <Text style={styles.description}>
                  AI will help you pack your week efficiently by suggesting optimal task scheduling.
                </Text>
                <TouchableOpacity style={styles.aiButton} onPress={() => setShowPackWeekModal(true)}>
                  <Text style={styles.aiButtonText}>Pack This Week</Text>
                </TouchableOpacity>
                <PackWeekModal
                  visible={showPackWeekModal}
                  familyId={familyId}
                  children={effectiveChildren}
                  onClose={() => setShowPackWeekModal(false)}
                />
              </View>
            )}
            {aiToolsSubtab === 'catch-up' && onCatchUp && (
              <View style={styles.aiToolContent}>
                <Text style={styles.description}>
                  AI will help you catch up on missed work and reschedule tasks.
                </Text>
                <TouchableOpacity style={styles.aiButton} onPress={onCatchUp}>
                  <Text style={styles.aiButtonText}>Catch Up</Text>
                </TouchableOpacity>
              </View>
            )}
            {aiToolsSubtab === 'summarize-progress' && onSummarizeProgress && (
              <View style={styles.aiToolContent}>
                <Text style={styles.description}>
                  Get an AI-generated summary of your learning progress.
                </Text>
                <TouchableOpacity style={styles.aiButton} onPress={onSummarizeProgress}>
                  <Text style={styles.aiButtonText}>Summarize Progress</Text>
                </TouchableOpacity>
              </View>
            )}
            {aiToolsSubtab === 'whatif' && onWhatIfAnalysis && (
              <View style={styles.aiToolContent}>
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
              </View>
            )}
            {aiToolsSubtab === 'analytics' && onAnalytics && (
              <View style={styles.aiToolContent}>
                <Text style={styles.description}>
                  View detailed analytics and insights about your learning schedule.
                </Text>
                <TouchableOpacity style={styles.aiButton} onPress={onAnalytics}>
                  <Text style={styles.aiButtonText}>View Analytics</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
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
    backgroundColor: '#ffffff',
  },
  panelWrapper: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: '#ffffff',
    }),
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
  },
  headerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  settingsContent: {
    flex: 1,
    overflow: 'hidden',
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#f3f4f6',
  },
  timeframeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  timeframeButtonText: {
    fontSize: 12,
    color: '#6b7280',
  },
  timeframeButtonTextActive: {
    color: '#ffffff',
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
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  aiButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  subtabContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 99,
    }),
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
    borderBottomColor: '#3b82f6',
    backgroundColor: 'transparent',
  },
  subtabText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      whiteSpace: 'nowrap',
    }),
  },
  subtabTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  aiToolContent: {
    paddingVertical: 8,
  },
});

