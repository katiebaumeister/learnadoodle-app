/**
 * Intelligence Hub
 * Centralized AI-powered tools and analytics combining data + AI insights
 * This is the consolidation hub for all strategic/AI/analytics tools
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { plannerAIChat, getInsights, applyProposedChanges } from '../../lib/apiClient';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { 
  Brain, 
  Calendar, 
  BarChart3, 
  Lightbulb, 
  AlertTriangle, 
  TrendingUp,
  Sparkles,
  MessageSquare,
  Filter,
  X,
  ChevronRight,
  Flame,
  Target,
  Package,
  RotateCcw,
  FileText,
  UserCircle,
  Layers,
  BookOpen,
  Heart,
  Activity,
} from 'lucide-react';
import { colors } from '../../theme/colors';

// Import unified UI components
import PageHeader from '../ui/PageHeader';
import TabBar from '../ui/TabBar';
import AppContainer from '../ui/AppContainer';
import SectionHeader from '../ui/SectionHeader';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';

// Import existing modals and components
import PackWeekModal from '../ai/PackWeekModal';
import CatchUpModal from '../ai/CatchUpModal';
import SummarizeProgressModal from '../ai/SummarizeProgressModal';
import YearPlannerWizard from '../planner/YearPlannerWizard';
import CurriculumHeatmap from '../year/CurriculumHeatmap';

// Import analytics components (from Progress screen)
import SkillGraph from '../analytics/SkillGraph';
import SkillHeatmap from '../analytics/SkillHeatmap';
import MasteryCharts from '../accreditation/MasteryCharts';
import SkillStrengthsWeaknesses from '../analytics/SkillStrengthsWeaknesses';
import BehaviorAnalytics from '../analytics/BehaviorAnalytics';
import TermForecastingDashboard from '../forecasting/TermForecastingDashboard';
import CoachTab from '../ai/CoachTab';
import AdvancedInsightsTab from '../ai/AdvancedInsightsTab';
import TemplateGenerationTab from '../ai/TemplateGenerationTab';
import WorkloadBalancingTab from '../ai/WorkloadBalancingTab';
import ReviewRecommendationsTab from '../ai/ReviewRecommendationsTab';
import WebChildAffirmationTab from '../child/tabs/WebChildAffirmationTab';
import WebChildUpdatesTab from '../child/tabs/WebChildUpdatesTab';
import WebChildGrowthTab from '../child/tabs/WebChildGrowthTab';

export default function IntelligenceHub({ familyId, children = [] }) {
  console.log('[IntelligenceHub] Component initializing, familyId:', familyId);
  
  // State management
  const [activeTab, setActiveTab] = useState('planner'); // 'planner', 'analytics', 'insights', 'forecasting', 'coach', 'advanced-insights', 'templates', 'workload', 'reviews'
  const [selectedChildren, setSelectedChildren] = useState('all'); // string[] | 'all'
  const [timeframe, setTimeframe] = useState('thisWeek'); // 'thisWeek' | 'twoWeeks' | 'thisMonth' | 'custom'
  const [activeTool, setActiveTool] = useState(null); // null | 'planWeek' | 'plan2Weeks' | 'reschedule' | 'packWeek' | 'catchUp' | 'whatIf' | 'summarize' | 'planYear'
  
  // Planner AI chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // Proposed changes from AI tools (for Change Preview)
  const [proposedChanges, setProposedChanges] = useState([]);
  
  // Track if we've initialized from query params to prevent loops
  const initializedFromParamsRef = useRef(false);
  
  console.log('[IntelligenceHub] State variables initialized');
  
  // Read query params on mount and when URL changes
  useEffect(() => {
    console.log('[IntelligenceHub] useEffect: Reading query params');
    try {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    const readQueryParams = () => {
      const params = new URLSearchParams(window.location.search);
      
      // Read tab param (can be 'planner-ai', 'analytics', or 'insights')
      // Note: URL might have ?tab=intelligence&tab=analytics (double tab param)
      // We want the second one if it exists, otherwise the first
      const tabParams = params.getAll('tab');
      const tabParam = tabParams.length > 1 ? tabParams[1] : tabParams[0];
      if (tabParam === 'planner-ai' || tabParam === 'analytics' || tabParam === 'insights') {
        const tabMap = {
          'planner-ai': 'planner',
          'analytics': 'analytics',
          'insights': 'insights',
        };
        const newTab = tabMap[tabParam];
        setActiveTab(prev => prev !== newTab ? newTab : prev);
      }
      
      // Read child param
      const childParam = params.get('child');
      if (childParam) {
        if (childParam === 'all') {
          setSelectedChildren(prev => prev !== 'all' ? 'all' : prev);
        } else {
          // Try to find child by ID or slug
          const child = children.find(c => String(c.id) === childParam || c.first_name?.toLowerCase() === childParam.toLowerCase());
          if (child) {
            setSelectedChildren(prev => {
              const newSelected = [child.id];
              return JSON.stringify(prev) !== JSON.stringify(newSelected) ? newSelected : prev;
            });
          }
        }
      }
      
      // Read timeframe param
      const timeframeParam = params.get('timeframe');
      if (timeframeParam === 'thisWeek' || timeframeParam === 'twoWeeks' || timeframeParam === 'thisMonth' || timeframeParam === 'custom') {
        setTimeframe(prev => prev !== timeframeParam ? timeframeParam : prev);
      }
      
      // Read tool param and set activeTool to open modal
      const toolParam = params.get('tool');
      if (toolParam && ['planWeek', 'plan2Weeks', 'reschedule', 'packWeek', 'catchUp', 'whatIf', 'summarize', 'planYear'].includes(toolParam)) {
        setActiveTool(prev => prev !== toolParam ? toolParam : prev);
      } else {
        // Clear tool if param is removed (but only if we've initialized)
        if (initializedFromParamsRef.current) {
          setActiveTool(prev => prev !== null ? null : prev);
        }
      }
      
      initializedFromParamsRef.current = true;
    };
    
    readQueryParams();
    
    // Listen for URL changes (popstate event)
    const handlePopState = () => {
      readQueryParams();
    };
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
    } catch (error) {
      console.error('[IntelligenceHub] Error in query params useEffect:', error);
    }
  }, [children]); // Only depend on children array
  
  // Clean up tool param from URL when modal closes
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    if (activeTool === null) {
      // Remove tool param from URL
      const params = new URLSearchParams(window.location.search);
      if (params.has('tool')) {
        params.delete('tool');
        const newUrl = params.toString() 
          ? `${window.location.pathname}?${params.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [activeTool]);

  // Resolve date range from timeframe
  const dateRange = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    
    switch (timeframe) {
      case 'thisWeek':
        // Start of this week (Monday)
        const dayOfWeek = start.getDay();
        const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        start.setDate(diff);
        return { start, end: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000) };
      case 'twoWeeks':
        const dayOfWeek2 = start.getDay();
        const diff2 = start.getDate() - dayOfWeek2 + (dayOfWeek2 === 0 ? -6 : 1);
        start.setDate(diff2);
        return { start, end: new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000) };
      case 'thisMonth':
        start.setDate(1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        return { start, end };
      case 'custom':
        // For custom, you'd need a date picker - for now, default to this week
        const dayOfWeek3 = start.getDay();
        const diff3 = start.getDate() - dayOfWeek3 + (dayOfWeek3 === 0 ? -6 : 1);
        start.setDate(diff3);
        return { start, end: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000) };
      default:
        return { start, end: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000) };
    }
  }, [timeframe]);

  // Resolve child IDs from selectedChildren - "All" logic
  const resolvedChildIds = useMemo(() => {
    if (selectedChildren === 'all') {
      return children.map(c => c.id);
    }
    return Array.isArray(selectedChildren) ? selectedChildren : [];
  }, [selectedChildren, children]);

  // Handle child toggle
  const handleChildToggle = (childId) => {
    if (selectedChildren === 'all') {
      setSelectedChildren([childId]);
    } else if (Array.isArray(selectedChildren)) {
      if (selectedChildren.includes(childId)) {
        const filtered = selectedChildren.filter(id => id !== childId);
        setSelectedChildren(filtered.length === 0 ? 'all' : filtered);
      } else {
        setSelectedChildren([...selectedChildren, childId]);
      }
    }
  };

  // Handle quick action click
  const handleQuickAction = (toolId) => {
    // Pre-fill chat input with action
    const actionLabels = {
      'planWeek': 'Plan my week',
      'plan2Weeks': 'Plan next 2 weeks',
      'reschedule': 'Reschedule missed work',
      'packWeek': 'Pack week',
      'catchUp': 'Catch up on missed work',
      'whatIf': 'What-if analysis',
      'summarize': 'Summarize progress',
      'planYear': 'Plan the year',
    };
    
    const label = actionLabels[toolId] || toolId;
    setChatInput(label);
    
    // Set active tool to open modal
    setActiveTool(toolId);
  };

  // Handle modal close - cleanup URL and state
  const handleModalClose = () => {
    setActiveTool(null);
    // Remove tool param from URL
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('tool')) {
        params.delete('tool');
        const newUrl = params.toString() 
          ? `${window.location.pathname}?${params.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  };

  // Handle modal completion - store proposedChanges and close
  const handleModalComplete = ({ proposedChanges }) => {
    if (proposedChanges && proposedChanges.length > 0) {
      setProposedChanges(proposedChanges);
      // Switch to Planner AI tab to show changes in Change Preview
      setActiveTab('planner');
    }
    handleModalClose();
  };

  // Handle chat send - with backend integration
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    
    // Add user message
    const userMessage = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    const currentInput = chatInput;
    setChatInput('');
    setChatLoading(true);
    setChatError(null);
    
    try {
      // Call API
      const { data, error } = await plannerAIChat(
        familyId,
        resolvedChildIds,
        dateRange,
        [...chatMessages, userMessage]
      );
      
      if (error) {
        console.error('[IntelligenceHub] Chat API error:', error);
        setChatError(error.message || 'Failed to get AI response');
        // Add error message to chat
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`
        }]);
        return;
      }
      
      if (data) {
        // Add assistant message
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.assistant_message || data.response || 'I\'ve analyzed your schedule.'
        }]);
        
        // Store proposed changes if present
        if (data.proposed_changes && data.proposed_changes.length > 0) {
          setProposedChanges(data.proposed_changes);
        }
        
        // Store insights if present (could be used for Insights tab)
        // Insights are handled separately via getInsights API
      }
    } catch (err) {
      console.error('[IntelligenceHub] Chat exception:', err);
      setChatError(err.message || 'Failed to send message');
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Quick actions configuration
  const quickActions = [
    { id: 'planWeek', label: 'Plan My Week', icon: Calendar },
    { id: 'plan2Weeks', label: 'Plan Next 2 Weeks', icon: Calendar },
    { id: 'reschedule', label: 'Reschedule Missed Work', icon: RotateCcw },
    { id: 'packWeek', label: 'Pack Week', icon: Package },
    { id: 'catchUp', label: 'Catch Up', icon: TrendingUp },
    { id: 'whatIf', label: 'What-If Analysis', icon: BarChart3 },
    { id: 'summarize', label: 'Summarize Progress', icon: FileText },
    { id: 'planYear', label: 'Plan the Year', icon: Target },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <PageHeader
        title="Intelligence Hub"
        subtitle="AI-powered planning, analytics, and insights"
        icon={Brain}
        iconColor={colors.indigo}
      />

      {/* Shared Filters Section - Above Tabs */}
      <View style={styles.filtersSection}>
        {/* Quick Actions Row */}
        <View style={styles.quickActionsRow}>
          {quickActions.map(action => (
            <TouchableOpacity
              key={action.id}
              style={styles.quickActionButton}
              onPress={() => handleQuickAction(action.id)}
            >
              <action.icon size={16} color={colors.indigo} />
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Children Filter Chips */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Children:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <TouchableOpacity
              style={[
                styles.chip,
                selectedChildren === 'all' && styles.chipActive
              ]}
              onPress={() => setSelectedChildren('all')}
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
              { value: 'thisWeek', label: 'This Week' },
              { value: 'twoWeeks', label: '2 Weeks' },
              { value: 'thisMonth', label: 'This Month' },
              { value: 'custom', label: 'Custom' },
            ].map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.chip,
                  timeframe === option.value && styles.chipActive
                ]}
                onPress={() => setTimeframe(option.value)}
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
      </View>

      {/* Section Tabs */}
      <TabBar
        tabs={[
          { id: 'planner', label: 'Planner AI', icon: Calendar },
          { id: 'affirmations', label: 'Affirmations', icon: Heart },
          { id: 'updates', label: 'Updates', icon: Activity },
          { id: 'growth', label: 'Growth', icon: TrendingUp },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'insights', label: 'Insights', icon: Lightbulb },
          { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
          { id: 'coach', label: 'Coach', icon: UserCircle },
          { id: 'advanced-insights', label: 'Advanced Insights', icon: Layers },
          { id: 'templates', label: 'Templates', icon: BookOpen },
          { id: 'workload', label: 'Workload', icon: BarChart3 },
          { id: 'reviews', label: 'Reviews', icon: RotateCcw },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Content */}
      <AppContainer paddingVertical={20}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'planner' && (
          <PlannerAITab
            chatMessages={chatMessages}
            chatInput={chatInput}
            onChatInputChange={setChatInput}
            onSendMessage={handleSendMessage}
            selectedChildren={selectedChildren}
            timeframe={timeframe}
            proposedChanges={proposedChanges}
            familyId={familyId}
            chatLoading={chatLoading}
            chatError={chatError}
          />
        )}

        {activeTab === 'affirmations' && (
          <AffirmationsTab
            familyId={familyId}
            children={children}
            selectedChildren={resolvedChildIds}
          />
        )}

        {activeTab === 'updates' && (
          <UpdatesTab
            familyId={familyId}
            children={children}
            selectedChildren={resolvedChildIds}
          />
        )}

        {activeTab === 'growth' && (
          <GrowthTab
            familyId={familyId}
            children={children}
            selectedChildren={resolvedChildIds}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            familyId={familyId}
            selectedChildren={resolvedChildIds}
            dateRange={dateRange}
            onPlanYear={() => setActiveTool('planYear')}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsTab
            familyId={familyId}
            selectedChildren={resolvedChildIds}
            dateRange={dateRange}
            onGenerateDigest={() => setActiveTool('summarize')}
            onApplyInsightChanges={(changes) => {
              if (changes && changes.length > 0) {
                setProposedChanges(changes);
              }
            }}
          />
        )}

        {activeTab === 'forecasting' && (
          <TermForecastingDashboard
            familyId={familyId}
            selectedChildIds={resolvedChildIds.length > 0 ? resolvedChildIds : null}
            children={children}
          />
        )}

        {activeTab === 'coach' && (
          <CoachTab
            familyId={familyId}
            children={children}
            userRole="parent"
          />
        )}

        {activeTab === 'advanced-insights' && (
          <AdvancedInsightsTab
            familyId={familyId}
            children={children}
            selectedChildId={resolvedChildIds.length === 1 ? resolvedChildIds[0] : null}
          />
        )}

        {activeTab === 'templates' && (
          <TemplateGenerationTab
            familyId={familyId}
          />
        )}

        {activeTab === 'workload' && (
          <WorkloadBalancingTab
            familyId={familyId}
            children={children}
          />
        )}

        {activeTab === 'reviews' && (
          <ReviewRecommendationsTab
            familyId={familyId}
            children={children}
          />
        )}
      </ScrollView>
      </AppContainer>

      {/* Conditional Modals - Properly Hooked Up with onComplete handlers */}
      <>
      {activeTool === 'packWeek' && (
        <PackWeekModal
          visible={true}
          familyId={familyId}
          children={children.filter(c => resolvedChildIds.includes(c.id))}
          onClose={handleModalClose}
          onComplete={handleModalComplete}
        />
      )}

      {activeTool === 'catchUp' && (
        <CatchUpModal
          visible={true}
          familyId={familyId}
          onClose={handleModalClose}
          onComplete={handleModalComplete}
        />
      )}

      {(activeTool === 'reschedule' || activeTool === 'planWeek' || activeTool === 'plan2Weeks') && (
        <CatchUpModal
          visible={true}
          familyId={familyId}
          onClose={handleModalClose}
          onComplete={handleModalComplete}
        />
      )}

      {activeTool === 'summarize' && (
        <SummarizeProgressModal
          visible={true}
          familyId={familyId}
          onClose={handleModalClose}
          onComplete={handleModalComplete}
        />
      )}

      {activeTool === 'planYear' && (
        <YearPlannerWizard
          familyId={familyId}
          currentYearEnd={dateRange.end}
          onComplete={handleModalComplete}
          onCancel={handleModalClose}
        />
      )}

      {/* Note: What-If Analysis modal would go here when component is available */}
      </>
    </View>
  );
}

// Planner AI Tab Component
function PlannerAITab({
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendMessage,
  selectedChildren,
  timeframe,
  proposedChanges = [],
  familyId,
  chatLoading = false,
  chatError = null,
}) {
  return (
    <View style={styles.tabContent}>
      {/* Two-column layout: Chat (2/3) | Change Preview (1/3) */}
      <View style={styles.plannerGrid}>
        {/* Left 2/3 - Planner AI Chat */}
        <View style={styles.chatColumn}>
          <Card variant="default" padding="base" style={styles.chatSection}>
            <SectionHeader
              title="Planner AI"
              icon={Sparkles}
              iconColor={colors.indigo}
            />
            <View style={styles.chatContainer}>
              {chatMessages.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="Start a conversation to plan your week"
                  description='Try: "Plan my week" or "Reschedule missed work"'
                  size="default"
                />
              ) : (
                <ScrollView style={styles.chatMessages}>
                  {chatMessages.map((msg, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.chatMessage,
                        msg.role === 'user' ? styles.chatMessageUser : styles.chatMessageAssistant
                      ]}
                    >
                      <Text style={styles.chatMessageText}>{msg.content}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              
              {chatError && (
                <View style={styles.chatError}>
                  <AlertTriangle size={14} color={colors.red} />
                  <Text style={styles.chatErrorText}>{chatError}</Text>
                </View>
              )}
              <View style={styles.chatInputContainer}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Ask the planner AI..."
                  value={chatInput}
                  onChangeText={onChatInputChange}
                  onSubmitEditing={onSendMessage}
                  multiline
                  editable={!chatLoading}
                />
                <TouchableOpacity
                  style={[styles.chatSendButton, chatLoading && styles.chatSendButtonDisabled]}
                  onPress={onSendMessage}
                  disabled={chatLoading}
                >
                  {chatLoading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <MessageSquare size={18} color={colors.white} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        </View>

        {/* Right 1/3 - Change Preview */}
        <View style={styles.previewColumn}>
          <ChangePreviewPanel 
            changes={proposedChanges} 
            onApplyChanges={(changes) => {
              // Changes are cleared in ChangePreviewPanel after successful apply
              setProposedChanges([]);
            }}
            familyId={familyId}
          />
        </View>
      </View>
    </View>
  );
}

// Change Preview Panel Component
function ChangePreviewPanel({ changes = [], onApplyChanges, familyId }) {
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);

  const handleApply = async () => {
    if (!onApplyChanges || !familyId || changes.length === 0 || applying) return;
    
    setApplying(true);
    setApplyError(null);
    
    try {
      const { data, error } = await applyProposedChanges(familyId, changes);
      
      if (error) {
        console.error('[ChangePreviewPanel] Apply error:', error);
        setApplyError(error.message || 'Failed to apply changes');
        return;
      }
      
      if (data) {
        // Success - call parent handler to clear changes and show success
        onApplyChanges(changes);
        
        // Show success message (could use toast system)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          // Dispatch event for toast system or use alert as fallback
          window.dispatchEvent(new CustomEvent('showToast', {
            detail: { 
              message: `Successfully applied ${data.applied || changes.length} changes`,
              type: 'success'
            }
          }));
          
          // Refresh calendar cache
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
      }
    } catch (err) {
      console.error('[ChangePreviewPanel] Apply exception:', err);
      setApplyError(err.message || 'Failed to apply changes');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card variant="default" padding="base" style={styles.previewSection}>
      <SectionHeader
        title="Change Preview"
        icon={ChevronRight}
        iconColor={colors.indigo}
      />
      {changes.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Changes will appear here as you plan"
          description="When you use planning tools, proposed changes to your schedule will show here"
          size="small"
        />
      ) : (
        <>
          <ScrollView style={styles.changesList}>
            {changes.map((change, idx) => (
              <View key={idx} style={styles.changeItem}>
                <View style={styles.changeHeader}>
                  <Text style={styles.changeKind}>{change.kind || 'Change'}</Text>
                  {change.label && (
                    <Text style={styles.changeLabel}>{change.label}</Text>
                  )}
                </View>
                {change.before && change.after && (
                  <View style={styles.changeDiff}>
                    <Text style={styles.changeBefore}>{change.before}</Text>
                    <ChevronRight size={12} color={colors.textSecondary} />
                    <Text style={styles.changeAfter}>{change.after}</Text>
                  </View>
                )}
                {change.when && (
                  <Text style={styles.changeMeta}>{change.when}</Text>
                )}
              </View>
            ))}
          </ScrollView>
          {onApplyChanges && (
            <>
              {applyError && (
                <View style={styles.applyError}>
                  <AlertTriangle size={14} color={colors.red} />
                  <Text style={styles.applyErrorText}>{applyError}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.applyButton, applying && styles.applyButtonDisabled]}
                onPress={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <>
                    <ActivityIndicator size="small" color={colors.white} />
                    <Text style={styles.applyButtonText}>Applying...</Text>
                  </>
                ) : (
                  <Text style={styles.applyButtonText}>Apply Changes</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </Card>
  );
}

// Analytics Tab Component
function AnalyticsTab({
  familyId,
  selectedChildren,
  dateRange,
  onPlanYear,
}) {
  // For now, use first child ID for components that need single childId
  // In future, these components should support multiple children
  const primaryChildId = selectedChildren.length > 0 ? selectedChildren[0] : null;

  return (
    <View style={styles.tabContent}>
      <View style={styles.analyticsGrid}>
        {/* Curriculum Heatmap Card */}
        <Card variant="elevated" padding="base">
          <SectionHeader
            title="Curriculum Heatmap"
            icon={BarChart3}
            iconColor={colors.indigo}
          />
          <View style={styles.cardContent}>
            {familyId && dateRange ? (
              <CurriculumHeatmap
                familyId={familyId}
                startDate={dateRange.start.toISOString().split('T')[0]}
                endDate={dateRange.end.toISOString().split('T')[0]}
                onClose={() => {}}
              />
            ) : (
              <Text style={styles.placeholderText}>Select a timeframe to view heatmap</Text>
            )}
          </View>
        </Card>

        {/* Skills Overview Card */}
        {primaryChildId && (
          <Card variant="elevated" padding="base">
            <SectionHeader
              title="Skills Overview"
              icon={Target}
              iconColor={colors.green}
            />
            <View style={styles.cardContent}>
              <SkillGraph 
                childId={primaryChildId} 
                subjectId={null}
                daysBack={365}
              />
            </View>
          </Card>
        )}

        {/* Mastery Over Time Card */}
        {primaryChildId && (
          <Card variant="elevated" padding="base">
            <SectionHeader
              title="Mastery Over Time"
              icon={BarChart3}
              iconColor={colors.blue}
            />
            <View style={styles.cardContent}>
              <SkillHeatmap 
                childId={primaryChildId} 
                subjectId={null}
                daysBack={90}
                groupBy="week"
              />
              <View style={{ marginTop: 16 }}>
                <MasteryCharts
                  childId={primaryChildId}
                  subjectId={null}
                  daysBack={365}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Strengths & Areas for Improvement Card */}
        {primaryChildId && (
          <Card variant="elevated" padding="base">
            <SectionHeader
              title="Strengths & Areas for Improvement"
              icon={TrendingUp}
              iconColor={colors.orange}
            />
            <View style={styles.cardContent}>
              <SkillStrengthsWeaknesses
                childId={primaryChildId}
                subjectId={null}
              />
            </View>
          </Card>
        )}

        {/* Behavior Trends Card */}
        {primaryChildId && (
          <Card variant="elevated" padding="base">
            <SectionHeader
              title="Behavior Trends"
              icon={Flame}
              iconColor={colors.red}
            />
            <View style={styles.cardContent}>
              <BehaviorAnalytics
                childId={primaryChildId}
              />
            </View>
          </Card>
        )}

        {/* Year Plan & Milestones Card */}
        <Card variant="elevated" padding="base">
          <SectionHeader
            title="Year Plan & Milestones"
            icon={Calendar}
            iconColor={colors.purple}
          />
          <View style={styles.cardContent}>
            <Text style={styles.cardDescription}>
              Create and manage your annual learning plan with pacing and milestones
            </Text>
            <TouchableOpacity
              style={styles.yearPlanButton}
              onPress={onPlanYear}
            >
              <Target size={16} color={colors.white} />
              <Text style={styles.yearPlanButtonText}>Open Plan-the-Year Wizard</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    </View>
  );
}

// Insights Tab Component
function InsightsTab({
  familyId,
  selectedChildren,
  dateRange,
  onGenerateDigest,
  onApplyInsightChanges, // Callback when insight has proposedChanges
}) {
  // Backend integration for insights
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  
  useEffect(() => {
    if (!familyId || selectedChildren.length === 0) {
      setInsights([]);
      return;
    }
    
    const fetchInsights = async () => {
      setInsightsLoading(true);
      setInsightsError(null);
      
      try {
        const { data, error } = await getInsights(familyId, selectedChildren, dateRange);
        
        if (error) {
          // Only show error if it's not a 404 (endpoint not implemented yet)
          if (error.status !== 404) {
            console.error('[InsightsTab] Error fetching insights:', error);
            setInsightsError(error.message || 'Failed to load insights');
          } else {
            // 404 means endpoint not implemented - silently use empty array
            console.log('[InsightsTab] Insights endpoint not yet implemented');
          }
          setInsights([]);
          return;
        }
        
        // Backend should return array of insights:
        // [{ type: 'alert'|'observation'|'nudge', title, description, action_type, payload, proposed_changes? }]
        setInsights(data || []);
      } catch (err) {
        console.error('[InsightsTab] Exception fetching insights:', err);
        setInsightsError(err.message || 'Failed to load insights');
        setInsights([]);
      } finally {
        setInsightsLoading(false);
      }
    };
    
    fetchInsights();
  }, [familyId, selectedChildren, dateRange]);

  return (
    <View style={styles.tabContent}>
      {/* Parent Digest Hero Card */}
      <View style={styles.digestCard}>
        <View style={styles.digestHeader}>
          <FileText size={24} color={colors.indigo} />
          <View style={styles.digestHeaderText}>
            <Text style={styles.digestTitle}>Parent Digest</Text>
            <Text style={styles.digestSubtitle}>
              Get a comprehensive summary of learning progress and insights
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.digestButton}
          onPress={onGenerateDigest}
        >
          <Sparkles size={18} color={colors.white} />
          <Text style={styles.digestButtonText}>Generate Parent Digest</Text>
        </TouchableOpacity>
      </View>

      {/* Insights Feed */}
      <View style={styles.insightsSection}>
        <SectionHeader title="Insights Feed" icon={Lightbulb} />
        {insightsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.indigo} />
            <Text style={styles.loadingText}>Loading insights...</Text>
          </View>
        ) : insightsError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Error loading insights"
            description={insightsError}
            size="default"
          />
        ) : insights.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="No insights yet"
            description="Insights will appear here as you use the platform"
            size="default"
          />
        ) : (
          <View style={styles.insightsList}>
            {insights.map((insight, idx) => {
              const hasProposedChanges = insight.proposed_changes && insight.proposed_changes.length > 0;
              return (
                <View key={idx} style={styles.insightCard}>
                  <View style={styles.insightHeader}>
                    {insight.type === 'alert' && <AlertTriangle size={16} color={colors.red} />}
                    {insight.type === 'nudge' && <MessageSquare size={16} color={colors.indigo} />}
                    {insight.type === 'observation' && <Lightbulb size={16} color={colors.green} />}
                    <Text style={styles.insightChild}>{insight.title || insight.child || 'Insight'}</Text>
                    {insight.badge && (
                      <View style={styles.insightBadge}>
                        <Text style={styles.insightBadgeText}>{insight.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.insightMessage}>{insight.description || insight.message}</Text>
                  {/* Handle actions */}
                  {hasProposedChanges ? (
                    <TouchableOpacity 
                      style={styles.insightAction}
                      onPress={() => {
                        onApplyInsightChanges?.(insight.proposed_changes);
                      }}
                    >
                      <Text style={styles.insightActionText}>Apply suggestion</Text>
                      <ChevronRight size={14} color={colors.indigo} />
                    </TouchableOpacity>
                  ) : insight.action_type && (
                    <TouchableOpacity 
                      style={styles.insightAction}
                      onPress={() => {
                        // Handle different action types
                        if (insight.action_type === 'planner') {
                          // Navigate to Planner with filters
                          if (typeof window !== 'undefined' && window.__ldSearchNavigate) {
                            window.__ldSearchNavigate('planner', null, { 
                              child: insight.payload?.child_id || 'all' 
                            });
                          }
                        } else if (insight.action_type === 'upload') {
                          // Open upload modal (would need to be passed down or use global event)
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('openUploadModal', { 
                              detail: { childId: insight.payload?.child_id } 
                            }));
                          }
                        } else if (insight.action_type === 'open_records') {
                          // Navigate to Records
                          if (typeof window !== 'undefined' && window.__ldSearchNavigate) {
                            window.__ldSearchNavigate('records', null, { 
                              child: insight.payload?.child_id || 'all' 
                            });
                          }
                        }
                      }}
                    >
                      <Text style={styles.insightActionText}>
                        {insight.action?.label || 'Take action'}
                      </Text>
                      <ChevronRight size={14} color={colors.indigo} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filtersSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
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
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
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
  content: {
    flex: 1,
  },
  tabContent: {
    gap: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 12,
  },
  plannerGrid: {
    ...Platform.select({
      web: {
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '24px',
      },
      default: {
        flexDirection: 'column',
        gap: 20,
      },
    }),
  },
  chatColumn: {
    ...Platform.select({
      web: {
        minWidth: 0, // Prevent overflow
      },
    }),
  },
  previewColumn: {
    ...Platform.select({
      web: {
        minWidth: 0, // Prevent overflow
      },
    }),
  },
  chatSection: {
    marginBottom: 20,
  },
  chatContainer: {
    minHeight: 400,
  },
  chatMessages: {
    maxHeight: 300,
    marginBottom: 12,
  },
  chatMessage: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    maxWidth: '80%',
  },
  chatMessageUser: {
    backgroundColor: colors.indigo,
    alignSelf: 'flex-end',
  },
  chatMessageAssistant: {
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
  },
  chatMessageText: {
    fontSize: 14,
    color: colors.text,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  chatSendButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSection: {
    // Card component handles styling
  },
  changesList: {
    maxHeight: 500,
  },
  changeItem: {
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  changeKind: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.indigo,
    textTransform: 'uppercase',
  },
  changeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  changeDiff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  changeBefore: {
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  changeAfter: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.green,
  },
  changeMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  applyButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  applyError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    backgroundColor: colors.red + '15',
    borderRadius: 6,
    marginBottom: 8,
  },
  applyErrorText: {
    fontSize: 12,
    color: colors.red,
    flex: 1,
  },
  chatError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    backgroundColor: colors.red + '15',
    borderRadius: 6,
    marginBottom: 8,
  },
  chatErrorText: {
    fontSize: 12,
    color: colors.red,
    flex: 1,
  },
  chatSendButtonDisabled: {
    opacity: 0.6,
  },
  analyticsGrid: {
    ...Platform.select({
      web: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '20px',
      },
      default: {
        gap: 20,
      },
    }),
  },
  cardContent: {
    minHeight: 200,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  yearPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  yearPlanButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 40,
  },
  digestCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  digestHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
  },
  digestHeaderText: {
    flex: 1,
  },
  digestTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  digestSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  digestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  digestButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  insightsSection: {
    marginTop: 8,
  },
  insightsList: {
    gap: 12,
  },
  insightCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  insightChild: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  insightBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.green + '20',
    borderRadius: 12,
  },
  insightBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.green,
  },
  insightMessage: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  insightAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  insightActionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.indigo,
  },
});

// Affirmations Tab Component
function AffirmationsTab({ familyId, children, selectedChildren }) {
  // If multiple children selected, show a selector or show first child
  const displayChild = useMemo(() => {
    if (selectedChildren.length === 0 && children.length > 0) {
      return children[0];
    }
    if (selectedChildren.length === 1) {
      return children.find(c => c.id === selectedChildren[0]);
    }
    if (selectedChildren.length > 1) {
      // Show first selected child, or allow switching
      return children.find(c => c.id === selectedChildren[0]);
    }
    return null;
  }, [children, selectedChildren]);

  if (!displayChild) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          icon={Heart}
          title="No child selected"
          description="Select a child from the filters above to view affirmations"
          size="default"
        />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <WebChildAffirmationTab
        childId={displayChild.id}
        childName={displayChild.first_name || displayChild.name}
        familyId={familyId}
        onNavigate={() => {}}
      />
    </View>
  );
}

// Updates Tab Component
function UpdatesTab({ familyId, children, selectedChildren }) {
  const displayChild = useMemo(() => {
    if (selectedChildren.length === 0 && children.length > 0) {
      return children[0];
    }
    if (selectedChildren.length === 1) {
      return children.find(c => c.id === selectedChildren[0]);
    }
    if (selectedChildren.length > 1) {
      return children.find(c => c.id === selectedChildren[0]);
    }
    return null;
  }, [children, selectedChildren]);

  if (!displayChild) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          icon={Activity}
          title="No child selected"
          description="Select a child from the filters above to view updates"
          size="default"
        />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <WebChildUpdatesTab
        childId={displayChild.id}
        childName={displayChild.first_name || displayChild.name}
        familyId={familyId}
        onNavigate={() => {}}
      />
    </View>
  );
}

// Growth Tab Component
function GrowthTab({ familyId, children, selectedChildren }) {
  const displayChild = useMemo(() => {
    if (selectedChildren.length === 0 && children.length > 0) {
      return children[0];
    }
    if (selectedChildren.length === 1) {
      return children.find(c => c.id === selectedChildren[0]);
    }
    if (selectedChildren.length > 1) {
      return children.find(c => c.id === selectedChildren[0]);
    }
    return null;
  }, [children, selectedChildren]);

  if (!displayChild) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          icon={TrendingUp}
          title="No child selected"
          description="Select a child from the filters above to view growth"
          size="default"
        />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <WebChildGrowthTab
        childId={displayChild.id}
        childName={displayChild.first_name || displayChild.name}
        familyId={familyId}
        onNavigate={() => {}}
      />
    </View>
  );
}
