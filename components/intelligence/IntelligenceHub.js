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
  Modal,
  Animated,
  Linking,
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
  Send,
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
  Users,
  Zap,
  Shield,
  ChevronDown,
  Search,
  MapPin,
  Star,
  Compass,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { designTokens } from '../../theme/designTokens';

// Import unified UI components
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

// Sample Question Item Component
function SampleQuestionItem({ question, onPress }) {
  const [isHovered, setIsHovered] = useState(false);
  
  // Capitalize first letter of question (handle edge cases)
  const capitalizedQuestion = question && question.length > 0
    ? question.charAt(0).toUpperCase() + question.slice(1)
    : question;
  
  return (
    <TouchableOpacity
      style={[
        styles.sampleQuestionItem,
        isHovered && styles.sampleQuestionItemHovered,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      })}
    >
      <Text style={styles.sampleQuestionText}>{capitalizedQuestion}</Text>
    </TouchableOpacity>
  );
}

// Context Bar Component - Always Expanded Filters
function ContextBar({
  children = [],
  selectedChildren,
  onChildrenChange,
  timeframe,
  onTimeframeChange,
  activeCategory,
  onCategoryChange,
  onChildToggle,
}) {
  const categories = [
    { id: 'connection', label: 'Connection', icon: Users },
    { id: 'identity', label: 'Identity', icon: UserCircle },
    { id: 'strengths', label: 'Strengths', icon: Star },
    { id: 'curiosity', label: 'Curiosity', icon: Lightbulb },
    { id: 'motivation', label: 'Motivation', icon: Target },
    { id: 'energy', label: 'Energy', icon: Zap },
    { id: 'growth', label: 'Growth', icon: Activity },
    { id: 'application', label: 'Application', icon: BookOpen },
    { id: 'innovation', label: 'Innovation', icon: Sparkles },
  ];

  return (
    <View style={styles.contextBarWrapper}>
      {/* Filter Chips Row - Always Visible */}
      <View style={styles.filterChipsRow}>
        {/* Interest Section */}
        <View style={styles.filterChipGroup}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.filterChipScroll}
            contentContainerStyle={styles.filterChipScrollContent}
          >
            {categories.map(category => {
              const CategoryIcon = category.icon;
              const isActive = activeCategory === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.filterChip,
                    isActive && styles.filterChipActive
                  ]}
                  onPress={() => onCategoryChange(category.id)}
                >
                  {CategoryIcon && (
                    <CategoryIcon 
                      size={14} 
                      color={isActive ? '#4285f4' : colors.textSecondary} 
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text style={[
                    styles.filterChipText,
                    isActive && styles.filterChipTextActive
                  ]}>
                    {category.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

export default function IntelligenceHub({ familyId, children = [] }) {
  console.log('[IntelligenceHub] Component initializing, familyId:', familyId);
  
  // State management
  const [selectedChildren, setSelectedChildren] = useState('all'); // string[] | 'all'
  const [timeframe, setTimeframe] = useState('thisWeek'); // 'thisWeek' | 'twoWeeks' | 'thisMonth' | 'thisYear'
  const [activeCategory, setActiveCategory] = useState('connection'); // 'connection' | 'social' | 'innovation' | 'wellbeing'
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
      if (timeframeParam === 'thisWeek' || timeframeParam === 'twoWeeks' || timeframeParam === 'thisMonth' || timeframeParam === 'thisYear') {
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
      case 'thisYear':
        start.setMonth(0);
        start.setDate(1);
        const yearEnd = new Date(start.getFullYear(), 11, 31);
        return { start, end: yearEnd };
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


  return (
    <View style={styles.container}>
      {/* Content */}
      <View style={styles.contentWrapper}>
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContentContainer}
      >
        <View style={styles.contentInner}>
          <IntelligenceAskGrid
            familyId={familyId}
            selectedChildren={resolvedChildIds}
            children={children}
            timeframe={timeframe}
            dateRange={dateRange}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            propSelectedChildren={selectedChildren}
            onChildrenChange={setSelectedChildren}
            onTimeframeChange={setTimeframe}
            onChildToggle={handleChildToggle}
          />
        </View>
      </ScrollView>
      
      {/* Privacy Note - Fixed at bottom */}
      <View style={styles.privacyNoteContainer}>
        <Text style={styles.privacyNoteText}>
          Learnadoodle never shares personal data.{' '}
          <Text
            style={styles.privacyNoteLink}
            onPress={() => {
              const url = 'https://learnadoodle.com/legal';
              if (Platform.OS === 'web') {
                window.open(url, '_blank');
              } else {
                Linking.openURL(url);
              }
            }}
          >
            Learn more
          </Text>
        </Text>
      </View>
      </View>

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
          title="Catch Up"
          description="Analyze gaps between subjects' required minutes and actual scheduled time, then generate catch-up sessions to meet requirements."
          onClose={handleModalClose}
          onComplete={handleModalComplete}
        />
      )}

      {(activeTool === 'reschedule' || activeTool === 'planWeek' || activeTool === 'plan2Weeks') && (
        <CatchUpModal
          visible={true}
          familyId={familyId}
          title={activeTool === 'reschedule' ? "Reschedule Missed Work" : activeTool === 'planWeek' ? "Plan My Week" : "Plan Next 2 Weeks"}
          description={
            activeTool === 'reschedule'
              ? "Select specific missed events and move them to new available time slots."
              : activeTool === 'planWeek'
              ? "Fill your upcoming week with scheduled learning activities from your backlog."
              : "Fill your upcoming 2 weeks with scheduled learning activities from your backlog."
          }
          onClose={handleModalClose}
          onOpenScheduleRules={() => {
            // Dispatch event that WebLayout can listen to
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('openScheduleRules'));
            }
            handleModalClose();
          }}
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

// Intelligence Ask Grid Component
function IntelligenceAskGrid({
  familyId,
  selectedChildren,
  children = [],
  timeframe,
  dateRange,
  activeCategory,
  onCategoryChange,
  propSelectedChildren,
  onChildrenChange,
  onTimeframeChange,
  onChildToggle,
}) {
  const [askInput, setAskInput] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResponse, setAskResponse] = useState(null);
  const [askError, setAskError] = useState(null);
  const textInputRef = useRef(null);

  // Handle ask submission
  const handleAskSubmit = async () => {
    if (!askInput.trim() || askLoading) return;
    
    const question = askInput.trim();
    setAskLoading(true);
    setAskError(null);
    setAskResponse(null);
    
    try {
      // Call plannerAIChat API with the question
      // The backend will gather:
      // - Child data from onboarding (children table)
      // - Progress on events (events table with status, outcomes)
      // - Upcoming events/assignments (events and assignments tables)
      // - General education recommendations
      const { data, error } = await plannerAIChat(
        familyId,
        selectedChildren,
        dateRange,
        [{ role: 'user', content: question }]
      );
      
      if (error) {
        console.error('[IntelligenceAskGrid] Ask API error:', error);
        setAskError(error.message || 'Failed to get AI response');
        return;
      }
      
      if (data) {
        // Store the response
        const responseText = data.assistant_message || data.response || 'I\'ve analyzed your question.';
        setAskResponse({
          question,
          answer: responseText,
          proposedChanges: data.proposed_changes || [],
          insights: data.insights || [],
        });
        
        // Clear the input after successful submission
        setAskInput('');
      }
    } catch (err) {
      console.error('[IntelligenceAskGrid] Ask exception:', err);
      setAskError(err.message || 'Failed to submit question');
    } finally {
      setAskLoading(false);
    }
  };

  // Remove focus outline on web and style placeholder
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = `
        #intelligence-ask-input:focus {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        #intelligence-ask-input {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        #intelligence-ask-input::placeholder {
          font-family: "League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

  // Get selected child name for question personalization
  const selectedChild = children.find(c => selectedChildren.includes(c.id));
  const childName = selectedChild?.first_name || selectedChild?.name || 'your child';

  // Format timeframe label
  const timeframeLabels = {
    'thisWeek': 'This Week',
    'twoWeeks': '2 Weeks',
    'thisMonth': 'This Month',
    'thisYear': 'This Year',
  };
  const timeframeLabel = timeframeLabels[timeframe] || 'This Week';

  // Category configuration
  const categories = [
    {
      id: 'connection',
      label: 'Connection',
      description: 'Family dynamics, motivation, trust',
      icon: Users,
      placeholder: 'Ask about trust, resistance, or family dynamics…',
    },
    {
      id: 'identity',
      label: 'Identity',
      description: 'Self-awareness, values, personal growth',
      icon: UserCircle,
      placeholder: 'Ask about self-awareness, values, or personal identity…',
    },
    {
      id: 'strengths',
      label: 'Strengths',
      description: 'Natural talents, abilities, capabilities',
      icon: Star,
      placeholder: 'Ask about natural talents, abilities, or strengths…',
    },
    {
      id: 'curiosity',
      label: 'Curiosity',
      description: 'Interests, questions, exploration',
      icon: Lightbulb,
      placeholder: 'Ask about interests, questions, or curiosity…',
    },
    {
      id: 'motivation',
      label: 'Motivation',
      description: 'Drivers, goals, aspirations',
      icon: Target,
      placeholder: 'Ask about drivers, goals, or motivation…',
    },
    {
      id: 'energy',
      label: 'Energy',
      description: 'Vitality, stamina, engagement levels',
      icon: Zap,
      placeholder: 'Ask about energy levels, vitality, or engagement…',
    },
    {
      id: 'growth',
      label: 'Growth',
      description: 'Development, improvement, evolution',
      icon: Activity,
      placeholder: 'Ask about development, improvement, or growth…',
    },
    {
      id: 'application',
      label: 'Application',
      description: 'Practical use, relevance, connections',
      icon: BookOpen,
      placeholder: 'Ask about practical applications or real-world connections…',
    },
    {
      id: 'innovation',
      label: 'Innovation',
      description: 'Curiosity, projects, creative momentum',
      icon: Sparkles,
      placeholder: 'Ask about projects, curiosity, or creative momentum…',
    },
  ];

  const activeCategoryData = categories.find(c => c.id === activeCategory);

  // Sample questions by category
  const sampleQuestions = {
    connection: [
      `Who does ${childName} seem most energized by when learning—alone, with you, or with others?`,
      `When ${childName} struggles, what kind of support helps them feel safe rather than pressured?`,
      `Does ${childName} seem more confident when learning feels shared or independent?`,
      `Who could be a positive learning role model for ${childName} right now?`,
      `How connected does ${childName} feel to the people involved in their learning week?`,
    ],
    identity: [
      `How does ${childName} talk about themselves when they succeed—or when they don't?`,
      `Does this subject strengthen ${childName}'s confidence, or quietly undermine it?`,
      `What labels might ${childName} be giving themselves that you'd want to gently rewrite?`,
      `Where is ${childName} starting to see themselves as "good at something"?`,
      `How can you reflect back a version of ${childName} that feels capable and growing?`,
    ],
    strengths: [
      `What strengths is ${childName} showing that might not be captured by grades?`,
      `Which skills seem to come most naturally to ${childName} across subjects?`,
      `How could you help ${childName} notice what they're already doing well?`,
      `What patterns do you see in how ${childName} solves problems?`,
      `How might these strengths support ${childName}'s future interests or confidence?`,
    ],
    curiosity: [
      `What topic has ${childName} been asking unexpected questions about lately?`,
      `What fun fact could you share at lunch that connects to today's biology block?`,
      `Which subjects spark curiosity without you having to push?`,
      `What would ${childName} explore more if there were no expectations attached?`,
      `How could you follow ${childName}'s curiosity just a little further this week?`,
    ],
    motivation: [
      `What actually motivates ${childName}—praise, progress, autonomy, or novelty?`,
      `When motivation drops, what's usually happening underneath?`,
      `Is ${childName} more driven by finishing tasks or understanding ideas?`,
      `What goal would feel meaningful to them, not just to you?`,
      `How can you encourage effort without making success feel conditional?`,
    ],
    energy: [
      `When does ${childName} seem most alert and engaged during the day?`,
      `Which parts of the schedule seem to drain their energy the fastest?`,
      `Is ${childName}'s learning pace matching their attention span right now?`,
      `What signs tell you ${childName} needs a break before they ask for one?`,
      `How could the week be adjusted to protect ${childName}'s energy?`,
    ],
    growth: [
      `Where has ${childName} grown that you might not have noticed at first?`,
      `What challenge feels just right for stretching ${childName} right now?`,
      `How does ${childName} respond emotionally to mistakes or setbacks?`,
      `What progress would reassure you that things are moving in the right direction?`,
      `How can you celebrate growth without comparing it to others?`,
    ],
    application: [
      `Where might ${childName} encounter this learning outside of school?`,
      `How could you connect today's lesson to something ${childName} already loves?`,
      `What real-world problem could this subject help ${childName} understand?`,
      `How might this learning support ${childName}'s future independence?`,
      `What story could you tell that makes today's work feel meaningful?`,
    ],
    innovation: [
      `How could ${childName} express what they've learned in a creative way?`,
      `What project might help ${childName} feel proud of their thinking?`,
      `How could two of ${childName}'s interests be combined into one activity?`,
      `What would learning look like if curiosity led instead of the schedule?`,
      `How can you help ${childName} see learning as something they create, not just complete?`,
    ],
  };

  const currentQuestions = sampleQuestions[activeCategory] || [];

  return (
    <View style={styles.askGridContainer}>
      {/* Ask Input Box */}
      <View style={styles.askInputSection}>
        <TouchableOpacity
          style={styles.askInputContainer}
          onPress={() => textInputRef.current?.focus()}
          activeOpacity={1}
        >
          <TextInput
            ref={textInputRef}
            style={[
              styles.askInput,
              Platform.OS === 'web' && {
                outline: 'none !important',
                border: 'none !important',
                boxShadow: 'none !important',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                WebkitFocusRingColor: 'transparent',
              },
            ]}
            placeholder="ASK ANYTHING"
            placeholderTextColor={colors.muted}
            value={askInput}
            onChangeText={setAskInput}
            onSubmitEditing={handleAskSubmit}
            returnKeyType="search"
            {...(Platform.OS === 'web' && {
              nativeID: 'intelligence-ask-input',
            })}
          />
          {askInput.length === 0 ? (
            <View style={styles.askIconContainer}>
              <Search size={18} color={colors.muted} />
            </View>
          ) : (
            <View style={styles.askActionsContainer}>
              <TouchableOpacity
                onPress={handleAskSubmit}
                style={styles.askSendButton}
                disabled={askLoading}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {askLoading ? (
                  <ActivityIndicator size="small" color={colors.indigo || '#4285f4'} />
                ) : (
                  <Send size={18} color={colors.indigo || '#4285f4'} />
                )}
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Note about AI responses */}
      <View style={styles.askNoteContainer}>
        <Text style={styles.askNoteText}>
          Note: Responses get better as more data is added and progress is completed.
        </Text>
      </View>

      {/* Category Chips */}
      <ContextBar
        children={children}
        selectedChildren={propSelectedChildren}
        onChildrenChange={onChildrenChange}
        timeframe={timeframe}
        onTimeframeChange={onTimeframeChange}
        activeCategory={activeCategory}
        onCategoryChange={onCategoryChange}
        onChildToggle={onChildToggle}
      />
      
      {/* Sample Questions Section */}
      {currentQuestions.length > 0 && (
        <View style={styles.sampleQuestionsSection}>
          <View style={styles.sampleQuestionsList}>
            {currentQuestions.map((question, idx) => (
              <View key={idx}>
                <SampleQuestionItem
                  question={question}
                  onPress={() => setAskInput(question)}
                />
                {idx < currentQuestions.length - 1 && (
                  <View style={styles.sampleQuestionDivider} />
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Ask Response Section */}
      {askError && (
        <View style={styles.askResponseSection}>
          <View style={styles.askErrorContainer}>
            <AlertTriangle size={16} color={colors.red} />
            <Text style={styles.askErrorText}>{askError}</Text>
          </View>
        </View>
      )}

      {askResponse && (
        <View style={styles.askResponseSection}>
          <Card variant="elevated" padding="base">
            <View style={styles.askResponseHeader}>
              <Text style={styles.askResponseQuestion}>{askResponse.question}</Text>
              <TouchableOpacity
                onPress={() => setAskResponse(null)}
                style={styles.askResponseClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.askResponseAnswer}>{askResponse.answer}</Text>
            {askResponse.proposedChanges && askResponse.proposedChanges.length > 0 && (
              <View style={styles.askResponseChanges}>
                <Text style={styles.askResponseChangesTitle}>Proposed Changes:</Text>
                {askResponse.proposedChanges.map((change, idx) => (
                  <Text key={idx} style={styles.askResponseChangeItem}>
                    • {change.description || JSON.stringify(change)}
                  </Text>
                ))}
              </View>
            )}
          </Card>
        </View>
      )}
    </View>
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
    position: 'relative',
    overflow: 'hidden',
  },
  contentWrapper: {
    flex: 1,
    paddingVertical: 24,
    position: 'relative',
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  pageHeader: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  pageHeaderContent: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 48,
    paddingTop: 24,
    paddingBottom: 16,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  contextBarWrapper: {
    width: '100%',
    backgroundColor: 'transparent',
    position: 'relative',
    zIndex: 1,
  },
  contextBarButton: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    backgroundColor: colors.background,
    paddingHorizontal: 48,
    paddingVertical: 12,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxSizing: 'border-box',
      },
    }),
  },
  contextBarText: {
    fontSize: 14,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipsRow: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    backgroundColor: colors.background,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 12,
    paddingBottom: 16,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  filterChipGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
    width: '100%',
  },
  filterChipGroupLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    minWidth: 90,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipScroll: {
    width: '100%',
  },
  filterChipScrollContent: {
    alignItems: 'center',
    paddingRight: 48,
    paddingLeft: 0,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginRight: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  filterChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  filterChipText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '700',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: '#4285f4',
    fontWeight: '800',
  },
  filtersSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    marginRight: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  chipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  chipText: {
    fontSize: 12,
    color: '#3c4043',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  content: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 80, // Space for fixed privacy note at bottom
  },
  contentInner: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 48,
    position: 'relative',
    zIndex: 1,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
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
  // Intelligence Ask Grid Styles
  askGridContainer: {
    flex: 1,
    paddingBottom: 24,
    width: '100%',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    marginRight: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  categoryChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  categoryChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
  },
  sampleQuestionsSection: {
    marginBottom: 32,
  },
  sampleQuestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sampleQuestionsList: {
    gap: 0,
  },
  sampleQuestionItem: {
    paddingVertical: 16,
    paddingHorizontal: 0,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'opacity 0.2s ease',
      },
    }),
  },
  sampleQuestionItemHovered: {
    opacity: 0.7,
  },
  sampleQuestionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 0,
  },
  sampleQuestionText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '400',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askInputSection: {
    marginBottom: 16,
  },
  askResponseSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  askErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.red + '10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red + '30',
  },
  askErrorText: {
    flex: 1,
    fontSize: 14,
    color: colors.red,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askResponseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  askResponseQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askResponseClose: {
    padding: 4,
  },
  askResponseAnswer: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askResponseChanges: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  askResponseChangesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askResponseChangeItem: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  conversationalCenterContainer: {
    backgroundColor: '#fafafa',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  conversationalCenter: {
    marginBottom: 0,
  },
  conversationalCenterTitle: {
    marginBottom: 8,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  conversationalCenterDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    height: 40,
    ...Platform.select({
      web: {
        cursor: 'text',
      },
    }),
  },
  askInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askIconContainer: {
    padding: 4,
  },
  askActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  askSendButton: {
    padding: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  askClearButton: {
    padding: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  askNoteContainer: {
    marginTop: -6,
    marginLeft: 12,
    marginBottom: 24,
  },
  askNoteText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  privacyNoteContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 48,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  privacyNoteText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  privacyNoteLink: {
    color: colors.indigo || '#4285f4',
    textDecorationLine: 'underline',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  quickAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickActionText: {
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
