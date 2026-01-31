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
  Alert,
  Pressable,
  Image,
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
  GraduationCap,
  Palette,
  ChevronUp,
  Plus,
  CheckCircle,
  Clock,
  Share2,
  Download,
  Edit,
  Trash2,
  ChevronLeft,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { designTokens } from '../../theme/designTokens';
import { supabase } from '../../lib/supabase';

// Import unified UI components
import AppContainer from '../ui/AppContainer';
import SectionHeader from '../ui/SectionHeader';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import TabBar from '../ui/TabBar';

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
import AdvancedInsightsTab from '../ai/AdvancedInsightsTab';
import TemplateGenerationTab from '../ai/TemplateGenerationTab';
import WorkloadBalancingTab from '../ai/WorkloadBalancingTab';
import ReviewRecommendationsTab from '../ai/ReviewRecommendationsTab';

// Import compliance component
import CompliancePanel from '../records/CompliancePanel';
import { getComplianceStatus, getAttendanceTimeline, getGrades, getPortfolioUploads } from '../../lib/services/recordsClient';
import WebChildAffirmationTab from '../child/tabs/WebChildAffirmationTab';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import WebChildUpdatesTab from '../child/tabs/WebChildUpdatesTab';
import WebChildGrowthTab from '../child/tabs/WebChildGrowthTab';
import AddSubjectModal from '../AddSubjectModal';
import AddChildModal from '../AddChildModal';

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
  subjects = [],
  selectedSubject,
  onSubjectChange,
  activeCategory,
  onCategoryChange,
  onChildToggle,
  familyId,
  onAddChild,
  onAddSubject,
}) {
  // Determine which children are selected
  const isChildSelected = (childId) => {
    if (Array.isArray(selectedChildren) && selectedChildren.length === 1) {
      return selectedChildren[0] === childId;
    }
    if (Array.isArray(selectedChildren) && selectedChildren.length > 0) {
      return selectedChildren.includes(childId);
    }
    // Default to first child if no selection
    if (children && children.length > 0) {
      return children[0].id === childId;
    }
    return false;
  };

  const handleSubjectChange = (subjectId) => {
    if (onSubjectChange) {
      onSubjectChange(subjectId === selectedSubject ? null : subjectId);
    }
  };

  return (
    <View style={styles.contextBarWrapper}>
      {/* Children Filter Chips */}
      <>
        <View style={styles.filterLabelContainer}>
          <Text style={styles.filterSectionLabel}>CHILDREN</Text>
        </View>
        <View style={styles.filterChipRow}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.filterScroll}
            contentContainerStyle={styles.filterScrollContent}
          >
            {children.map(child => {
              const childId = child.id;
              const isSelected = isChildSelected(childId);
              const childName = child.first_name || child.name || 'Child';
              
              return (
                <TouchableOpacity
                  key={childId}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipActive
                  ]}
                  onPress={() => onChildToggle(childId)}
                >
                  <Text style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive
                  ]}>
                    {childName}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {onAddChild && (
              <TouchableOpacity
                style={[styles.filterChip, styles.filterChipAdd]}
                onPress={onAddChild}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Plus size={14} color={colors.textSecondary || '#6b7280'} style={{ marginRight: 4 }} />
                  <Text style={styles.filterChipText}>
                    Add New Child
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </>

      {/* Subjects Filter Chips */}
      <>
        <View style={styles.filterLabelContainer}>
          <Text style={styles.filterSectionLabel}>SUBJECTS</Text>
        </View>
        <View style={styles.filterChipRow}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.filterScroll}
            contentContainerStyle={styles.filterScrollContent}
          >
            {subjects.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  !selectedSubject && styles.filterChipActive
                ]}
                onPress={() => handleSubjectChange(null)}
              >
                <Text style={[
                  styles.filterChipText,
                  !selectedSubject && styles.filterChipTextActive
                ]}>
                  All Subjects
                </Text>
              </TouchableOpacity>
            )}
            {subjects.map(subject => {
              const isSelected = selectedSubject === subject.id;
              return (
                <TouchableOpacity
                  key={subject.id}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipActive
                  ]}
                  onPress={() => handleSubjectChange(subject.id)}
                >
                  <Text style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive
                  ]}>
                    {subject.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {onAddSubject && (
              <TouchableOpacity
                style={[styles.filterChip, styles.filterChipAdd]}
                onPress={onAddSubject}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Plus size={14} color={colors.textSecondary || '#6b7280'} style={{ marginRight: 4 }} />
                  <Text style={styles.filterChipText}>
                    Add New Subject
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </>
    </View>
  );
}

export default function IntelligenceHub({ familyId, children = [] }) {
  console.log('[IntelligenceHub] Component initializing, familyId:', familyId);
  
  // State management - default to first child if available
  const [selectedChildren, setSelectedChildren] = useState(() => {
    // Default to first child's ID if children are available
    if (children && children.length > 0) {
      return [children[0].id];
    }
    return 'all';
  });
  const [timeframe, setTimeframe] = useState('thisWeek'); // 'thisWeek' | 'twoWeeks' | 'thisMonth' | 'thisYear'
  const [activeCategory, setActiveCategory] = useState('connection'); // 'connection' | 'social' | 'innovation' | 'wellbeing'
  const [activeTool, setActiveTool] = useState(null); // null | 'planWeek' | 'plan2Weeks' | 'reschedule' | 'packWeek' | 'catchUp' | 'whatIf' | 'summarize' | 'planYear'
  const [activeTab, setActiveTab] = useState('compliance'); // 'grades-goals' | 'insights' | 'analytics' | 'affirmations' | 'forecasting' | 'workload' | 'compliance'
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceError, setComplianceError] = useState(null);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  
  // Homeschool ID card state
  const [homeschoolIdData, setHomeschoolIdData] = useState({
    studentName: '',
    school: 'Learnadoodle Online',
    location: '',
    academicYear: '',
    memberId: '',
    expiration: '',
    grade: '',
  });
  const [loadingChildData, setLoadingChildData] = useState(false);
  const [showHomeschoolIdModal, setShowHomeschoolIdModal] = useState(false);
  const [homeschoolIdType, setHomeschoolIdType] = useState(null); // 'student' or 'teacher'
  
  // Planner AI chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // Proposed changes from AI tools (for Change Preview)
  const [proposedChanges, setProposedChanges] = useState([]);
  
  // Track if we've initialized from query params to prevent loops
  const initializedFromParamsRef = useRef(false);
  
  console.log('[IntelligenceHub] State variables initialized');
  
  // Resolve date range from timeframe (must be defined before effects that use it)
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

  // Resolve child IDs from selectedChildren - always return array of IDs
  const resolvedChildIds = useMemo(() => {
    if (selectedChildren === 'all') {
      // Fallback to all children if somehow 'all' is set
      return children.map(c => c.id);
    }
    if (Array.isArray(selectedChildren) && selectedChildren.length > 0) {
      return selectedChildren;
    }
    // If no selection, default to first child
    if (children && children.length > 0) {
      return [children[0].id];
    }
    return [];
  }, [selectedChildren, children]);

  // Get primary child for homeschool ID
  const primaryChildId = useMemo(() => {
    if (Array.isArray(selectedChildren) && selectedChildren.length > 0) {
      return selectedChildren[0];
    }
    if (children && children.length > 0) {
      return children[0].id;
    }
    return null;
  }, [selectedChildren, children]);
  
  const primaryChild = useMemo(() => {
    if (!primaryChildId || !children || children.length === 0) return null;
    return children.find(c => c.id === primaryChildId);
  }, [primaryChildId, children]);

  // US States list
  const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA',
    'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME',
    'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM',
    'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX',
    'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'
  ];

  // Load child data for homeschool ID card
  useEffect(() => {
    const loadChildDataForId = async () => {
      if (!showHomeschoolIdModal) return;
      
      setLoadingChildData(true);
      try {
        // Calculate academic year (current year to next year)
        const today = new Date();
        const currentYear = today.getFullYear();
        const nextYear = currentYear + 1;
        const academicYear = `${currentYear}/${nextYear}`;
        
        // Calculate expiration (one year from today)
        const expirationDate = new Date(today);
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
        const expiration = expirationDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        
        if (homeschoolIdType === 'student') {
          // For student ID, load child data
          if (!primaryChildId) {
            setLoadingChildData(false);
            return;
          }
          
          const { data: childData, error } = await supabase
            .from('children')
            .select('first_name, grade, grade_level, standards, state_code, state')
            .eq('id', primaryChildId)
            .single();
          
          if (error) {
            console.error('[IntelligenceHub] Error loading child data for ID:', error);
            setLoadingChildData(false);
            return;
          }
          
          // Get state from various possible fields
          const childState = childData.standards || childData.state_code || childData.state || '';
          
          // Get grade
          const childGrade = childData.grade || childData.grade_level || '';
          
          // Use child's UUID as member ID
          const memberId = primaryChildId;
          
          setHomeschoolIdData({
            studentName: childData.first_name || '',
            school: 'Learnadoodle Online',
            location: childState || '',
            academicYear: academicYear,
            memberId: memberId,
            expiration: expiration,
            grade: childGrade || '',
          });
        } else {
          // For teacher ID, load family data
          if (!familyId) {
            setLoadingChildData(false);
            return;
          }
          
          const { data: familyData, error } = await supabase
            .from('family')
            .select('id, name')
            .eq('id', familyId)
            .single();
          
          if (error) {
            console.error('[IntelligenceHub] Error loading family data for ID:', error);
            setLoadingChildData(false);
            return;
          }
          
          // Use full name from family table
          const familyName = familyData.name || 'Teacher';
          
          // Use family's UUID as member ID (from familyId, not child)
          const memberId = familyId;
          
          setHomeschoolIdData({
            studentName: familyName,
            school: 'Learnadoodle Online',
            location: '', // Family table doesn't have state/standards columns
            academicYear: academicYear,
            memberId: memberId,
            expiration: expiration,
            grade: '', // No grade for teacher
          });
        }
      } catch (err) {
        console.error('[IntelligenceHub] Error in loadChildDataForId:', err);
      } finally {
        setLoadingChildData(false);
      }
    };
    
    loadChildDataForId();
  }, [primaryChildId, familyId, showHomeschoolIdModal, homeschoolIdType]);

  // Fetch subjects
  useEffect(() => {
    const fetchSubjects = async () => {
      if (!familyId) return;
      try {
        const { data, error } = await supabase
          .from('subject')
          .select('id, name, child_id')
          .eq('family_id', familyId)
          .order('name', { ascending: true });
        
        if (error) {
          console.error('[IntelligenceHub] Error fetching subjects:', error);
          return;
        }
        
        // Filter: Show family-wide subjects (child_id is null) or subjects for selected children
        const resolvedChildIdsForSubjects = resolvedChildIds.length > 0 ? resolvedChildIds : (children.length > 0 ? [children[0].id] : []);
        
        const filteredSubjects = (data || []).filter(subject => {
          // Family-wide subjects always show
          if (!subject.child_id) return true;
          // Child-specific subjects only show if child is selected
          return resolvedChildIdsForSubjects.includes(subject.child_id);
        });
        
        // Deduplicate by name, preferring child-specific over family-wide
        const subjectMap = new Map();
        filteredSubjects.forEach(subject => {
          const existing = subjectMap.get(subject.name);
          if (!existing || (existing.child_id === null && subject.child_id !== null)) {
            subjectMap.set(subject.name, subject);
          }
        });
        
        setSubjects(Array.from(subjectMap.values()));
      } catch (err) {
        console.error('[IntelligenceHub] Exception fetching subjects:', err);
      }
    };
    
    fetchSubjects();
  }, [familyId, resolvedChildIds, children]);

  // Fetch compliance status
  useEffect(() => {
    if (!familyId || resolvedChildIds.length === 0) {
      setComplianceStatus(null);
      return;
    }
    
    const loadCompliance = async () => {
      setComplianceLoading(true);
      setComplianceError(null);
      
      try {
        const compliance = await getComplianceStatus(familyId, resolvedChildIds, dateRange);
        setComplianceStatus(compliance);
      } catch (err) {
        console.error('[IntelligenceHub] Error fetching compliance:', err);
        setComplianceError(err.message || 'Failed to load compliance data');
        // Use fallback data (empty checklist)
        setComplianceStatus({ checklist: [], readiness: {}, gaps: [], documents: [], stateRules: null });
      } finally {
        setComplianceLoading(false);
      }
    };
    
    loadCompliance();
  }, [familyId, resolvedChildIds, dateRange]);
  
  // Ensure a child is always selected when children are available
  useEffect(() => {
    if (children && children.length > 0) {
      // If no child is selected or 'all' is selected, default to first child
      if (selectedChildren === 'all' || (Array.isArray(selectedChildren) && selectedChildren.length === 0)) {
        setSelectedChildren([children[0].id]);
      } else if (Array.isArray(selectedChildren) && selectedChildren.length > 0) {
        // Ensure the selected child still exists in the children array
        const selectedChildExists = children.some(c => c.id === selectedChildren[0]);
        if (!selectedChildExists) {
          setSelectedChildren([children[0].id]);
        }
      }
    }
  }, [children]);
  
  // Read query params on mount and when URL changes
  useEffect(() => {
    console.log('[IntelligenceHub] useEffect: Reading query params');
    try {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    const readQueryParams = () => {
      const params = new URLSearchParams(window.location.search);
      
      // Read child param
      const childParam = params.get('child');
      if (childParam && childParam !== 'all') {
        // Try to find child by ID or slug
        const child = children.find(c => String(c.id) === childParam || c.first_name?.toLowerCase() === childParam.toLowerCase());
        if (child) {
          setSelectedChildren(prev => {
            const newSelected = [child.id];
            return JSON.stringify(prev) !== JSON.stringify(newSelected) ? newSelected : prev;
          });
        }
      } else if (!childParam && children && children.length > 0) {
        // If no child param and no selection, default to first child
        setSelectedChildren(prev => {
          if (prev === 'all' || (Array.isArray(prev) && prev.length === 0)) {
            return [children[0].id];
          }
          return prev;
        });
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

  // Handle child toggle - only allow one child at a time, always require selection
  const handleChildToggle = (childId) => {
    // Always select the clicked child (no deselecting allowed)
    setSelectedChildren([childId]);
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
      {/* Header Row */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>
          THE INTELLIGENCE HUB 
        </Text>
      </View>
      <View style={styles.headerDivider} />

      {/* Filter Chips - Children and Timeframe */}
      <View style={styles.filtersContainer}>
        <ContextBar
          children={children}
          selectedChildren={selectedChildren}
          onChildrenChange={setSelectedChildren}
          subjects={subjects}
          selectedSubject={selectedSubject}
          onSubjectChange={setSelectedSubject}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          onChildToggle={handleChildToggle}
          familyId={familyId}
          onAddChild={() => setShowAddChildModal(true)}
          onAddSubject={() => setShowAddSubjectModal(true)}
        />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBarContainer}>
        <TabBar
          tabs={[
            { id: 'compliance', label: 'Learning Log', icon: BookOpen },
            { id: 'grades-goals', label: 'Grades and Goals', icon: GraduationCap },
            { id: 'insights', label: 'Attendance', icon: Lightbulb },
            { id: 'homeschool-ids', label: 'Homeschool IDs', icon: FileText },
            { id: 'affirmations', label: 'Coach', icon: Heart },
            { id: 'extracurriculars', label: 'Extracurriculars', icon: Activity },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'compliance-new', label: 'Compliance', icon: Shield },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </View>

      {/* Content */}
      <View style={styles.contentWrapper}>
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContentContainer}
      >
        <View style={styles.contentInner}>
          {/* Keep all tabs mounted but hide inactive ones to preserve state and avoid reloading */}
          <View style={{ display: activeTab === 'grades-goals' ? 'flex' : 'none' }}>
            <GradesAndGoalsTab
              familyId={familyId}
              selectedChildren={resolvedChildIds}
              children={children}
              subjects={subjects}
              dateRange={dateRange}
            />
          </View>
          <View style={{ display: activeTab === 'insights' ? 'flex' : 'none' }}>
            <InsightsTab
            familyId={familyId}
            selectedChildren={resolvedChildIds}
            children={children}
            timeframe={timeframe}
            dateRange={dateRange}
              onGenerateDigest={() => {}}
              onApplyInsightChanges={() => {}}
            />
          </View>
          <View style={{ display: activeTab === 'compliance' ? 'flex' : 'none' }}>
            <ComplianceTab
              familyId={familyId}
              selectedChildren={resolvedChildIds}
              children={children}
              dateRange={dateRange}
              subjects={subjects}
              selectedSubject={selectedSubject}
            />
          </View>
          <View style={{ display: activeTab === 'compliance-new' ? 'flex' : 'none' }}>
            <View style={styles.tabPlaceholder}>
              <Text style={styles.placeholderText}>Compliance content coming soon</Text>
            </View>
          </View>
          <View style={{ display: activeTab === 'homeschool-ids' ? 'flex' : 'none' }}>
            <HomeschoolIdTab
              onGenerateStudentId={() => {
                setHomeschoolIdType('student');
                setShowHomeschoolIdModal(true);
              }}
              onGenerateTeacherId={() => {
                setHomeschoolIdType('teacher');
                setShowHomeschoolIdModal(true);
              }}
            />
          </View>
          <View style={{ display: activeTab === 'affirmations' ? 'flex' : 'none' }}>
            <CoachTab
              familyId={familyId}
              selectedChildren={resolvedChildIds}
              children={children}
              subjects={subjects}
            />
          </View>
          <View style={{ display: activeTab === 'extracurriculars' ? 'flex' : 'none' }}>
            <ExtracurricularsTab
              familyId={familyId}
              selectedChildren={resolvedChildIds}
              children={children}
            />
          </View>
          <View style={{ display: activeTab === 'analytics' ? 'flex' : 'none' }}>
            <AnalyticsTab
              familyId={familyId}
              selectedChildren={resolvedChildIds}
              dateRange={dateRange}
              onPlanYear={() => setActiveTool('planYear')}
              children={children}
              subjects={subjects}
            />
          </View>
        </View>
      </ScrollView>
      
      {/* Homeschool ID Modal */}
      <HomeschoolIdCard
        homeschoolIdData={homeschoolIdData}
        setHomeschoolIdData={setHomeschoolIdData}
        loading={loadingChildData}
        primaryChild={primaryChild}
        US_STATES={US_STATES}
        idType={homeschoolIdType}
        familyId={familyId}
        visible={showHomeschoolIdModal}
        onClose={() => {
          setShowHomeschoolIdModal(false);
          setHomeschoolIdType(null);
        }}
      />
      
      {/* Add Subject Modal */}
      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => setShowAddSubjectModal(false)}
        onSubjectAdded={() => {
          // Refresh subjects list
          const fetchSubjects = async () => {
            if (!familyId) return;
            try {
              const { data, error } = await supabase
                .from('subject')
                .select('id, name, child_id')
                .eq('family_id', familyId)
                .order('name', { ascending: true });
              
              if (error) {
                console.error('[IntelligenceHub] Error fetching subjects:', error);
                return;
              }
              
              const resolvedChildIdsForSubjects = resolvedChildIds.length > 0 ? resolvedChildIds : (children.length > 0 ? [children[0].id] : []);
              
              const filteredSubjects = (data || []).filter(subject => {
                if (!subject.child_id) return true; // Family-wide subjects
                return resolvedChildIdsForSubjects.includes(subject.child_id);
              });
              
              setSubjects(filteredSubjects);
            } catch (err) {
              console.error('[IntelligenceHub] Error in fetchSubjects:', err);
            }
          };
          fetchSubjects();
        }}
        familyId={familyId}
      />

      {/* Add Child Modal */}
      <AddChildModal
        visible={showAddChildModal}
        onClose={() => setShowAddChildModal(false)}
        onChildAdded={(child) => {
          // Refresh children list - the parent component should handle this
          // For now, we'll trigger a window event that the parent can listen to
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshChildren'));
          }
        }}
        familyId={familyId}
      />
      
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
          evidence: data.evidence || [],
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
  const getChildName = () => {
    // Always have a single child selected
    const childId = Array.isArray(selectedChildren) && selectedChildren.length > 0 
      ? selectedChildren[0] 
      : (children && children.length > 0 ? children[0].id : null);
    
    if (childId) {
      const child = children.find(c => c.id === childId);
      return child?.first_name || child?.name || 'your child';
    }
    return 'your child';
  };
  const childName = getChildName();

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
      id: 'identity',
      label: 'Identity',
      description: 'Self-awareness, values, personal growth',
      icon: UserCircle,
      placeholder: 'Ask about self-awareness, values, or personal identity…',
    },
    {
      id: 'social',
      label: 'Social',
      description: 'Social interactions, relationships, communication',
      icon: Users,
      placeholder: 'Ask about social interactions, relationships, or communication…',
    },
  ];

  const activeCategoryData = categories.find(c => c.id === activeCategory);

  // Sample questions by category
  const sampleQuestions = {
    connection: [
      `Am I doing right by my child — and by myself?`,
      `Am I giving ${childName} enough support without hovering?`,
      `Should I be giving ${childName} more space right now — or more reassurance?`,
      `How do I know when ${childName} is quietly struggling, even if they aren't saying it?`,
      `Are we spending enough quality time learning together, or does it feel tense lately?`,
      `How do I make room for myself without feeling guilty about it?`,
      `Do my kids feel like I'm on their team, even when I'm enforcing rules?`,
      `Is our current rhythm helping us connect — or wearing us both down?`,
    ],
    curiosity: [
      `How can I tell if ${childName} is genuinely interested — or just checking boxes?`,
      `What topics light ${childName} up when no one is watching?`,
      `How do I know when ${childName} is starting to lose interest before it turns into resistance?`,
      `With so many online options, how do I choose materials that actually fit my child?`,
      `Am I following ${childName}'s curiosity enough, or pushing what I think they "should" learn?`,
      `What's one small way I could make learning feel more fun this week?`,
    ],
    motivation: [
      `How can I motivate ${childName} without turning learning into pressure?`,
      `Does ${childName} need more encouragement — or fewer expectations right now?`,
      `Am I confusing effort with success?`,
      `When ${childName} resists work, what might they actually be reacting to?`,
      `Is it okay if progress looks slower than I expected?`,
      `How do I help ${childName} care about learning without bribing or nagging?`,
    ],
    identity: [
      `Am I setting ${childName} up for long-term success, or worrying too much about short-term outcomes?`,
      `Is ${childName} ahead, behind, or exactly where they need to be — and why does that matter to me?`,
      `Am I being too hard on myself as a teacher?`,
      `What kind of learner does ${childName} believe they are becoming?`,
      `Does learning give ${childName} a sense of purpose — or just obligation?`,
      `What strengths does ${childName} have that aren't measured by grades or benchmarks?`,
      `What would it look like to trust that I'm doing "enough"?`,
    ],
    social: [
      `Will ${childName} be confident speaking up around others?`,
      `Is ${childName} learning how to share, collaborate, and handle conflict?`,
      `Do my children think I'm cool — or at least someone they can talk to?`,
      `Is ${childName} developing leadership in their own way?`,
      `How much should I worry about comparison with other kids?`,
      `Is ${childName} learning how to work with people who think differently than they do?`,
    ],
  };

  const currentQuestions = sampleQuestions[activeCategory] || [];

  return (
    <View style={styles.askGridContainer}>
      {/* Ask Input Box - Hidden */}
      {/* <View style={styles.askInputSection}>
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
      </View> */}

      {/* Note about AI responses - Hidden */}
      {/* <View style={styles.askNoteContainer}>
        <Text style={styles.askNoteText}>
          Note: Responses get better as more data is added and progress is completed.
        </Text>
      </View> */}

      {/* Category Chips - Hidden */}
      {/* <ContextBar
        children={children}
        selectedChildren={propSelectedChildren}
        onChildrenChange={onChildrenChange}
        timeframe={timeframe}
        onTimeframeChange={onTimeframeChange}
        activeCategory={activeCategory}
        onCategoryChange={onCategoryChange}
        onChildToggle={onChildToggle}
      /> */}
      
      {/* Loading State - Show "Thinking..." when loading */}
      {askLoading && (
        <View style={styles.thinkingContainer}>
          <Card variant="elevated" padding="base">
            <View style={styles.thinkingContent}>
              <ActivityIndicator size="small" color={colors.indigo || '#4285f4'} />
              <Text style={styles.thinkingText}>Thinking...</Text>
            </View>
          </Card>
        </View>
      )}

      {/* Sample Questions Section - Hidden */}
      {/* {!askResponse && !askLoading && currentQuestions.length > 0 && (
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
      )} */}

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
                onPress={() => {
                  setAskResponse(null);
                  setAskError(null);
                }}
                style={styles.askResponseClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {askResponse.evidence && askResponse.evidence.length > 0 && (
              <View style={styles.askResponseEvidence}>
                <Text style={styles.askResponseEvidenceTitle}>Based on:</Text>
                {askResponse.evidence.map((evidence, idx) => (
                  <Text key={idx} style={styles.askResponseEvidenceItem}>
                    • {evidence}
                  </Text>
                ))}
              </View>
            )}
            {askResponse.evidence && askResponse.evidence.length > 0 && (
              <View style={styles.askResponseDivider} />
            )}
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
  children = [],
  subjects = [],
}) {
  const primaryChildId = selectedChildren.length > 0 ? selectedChildren[0] : null;
  const primaryChild = children.find(c => c.id === primaryChildId);
  const [coverageData, setCoverageData] = useState(null);
  const [skillsData, setSkillsData] = useState(null);
  const [masteryData, setMasteryData] = useState(null);
  const [strengthsData, setStrengthsData] = useState(null);
  const [behaviorData, setBehaviorData] = useState(null);
  const [yearPlanData, setYearPlanData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Calculate last 6 weeks date range
  const last6WeeksRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 42); // 6 weeks
    return { start, end };
  }, []);

  // Load analytics data
  useEffect(() => {
    if (!primaryChildId || !familyId) {
      setLoading(false);
      return;
    }

    const loadAnalyticsData = async () => {
      setLoading(true);
      try {
        // Load events for coverage analysis
        const { data: eventsData } = await supabase
          .from('events')
          .select('id, subject_id, start_ts, end_ts, event_type, child_id')
          .eq('family_id', familyId)
          .eq('child_id', primaryChildId)
          .gte('start_ts', last6WeeksRange.start.toISOString())
          .lte('start_ts', last6WeeksRange.end.toISOString())
          .is('deleted_at', null);

        // Process coverage data
        const subjectMap = new Map();
        (subjects || []).forEach(s => subjectMap.set(s.id, s.name));

        const weeklyData = {};
        const subjectTotals = {};

        (eventsData || []).forEach(event => {
          const weekStart = new Date(event.start_ts);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const weekKey = weekStart.toISOString().split('T')[0];
          
          if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = {};
          }

          const subjectName = subjectMap.get(event.subject_id) || 'Unknown';
          if (!weeklyData[weekKey][subjectName]) {
            weeklyData[weekKey][subjectName] = 0;
          }

          const duration = event.end_ts && event.start_ts 
            ? (new Date(event.end_ts) - new Date(event.start_ts)) / (1000 * 60) // minutes
            : 30; // default 30 min

          weeklyData[weekKey][subjectName] += duration;
          
          if (!subjectTotals[subjectName]) {
            subjectTotals[subjectName] = 0;
          }
          subjectTotals[subjectName] += duration;
        });

        const totalTime = Object.values(subjectTotals).reduce((sum, t) => sum + t, 0);
        const mostFocused = Object.entries(subjectTotals).sort((a, b) => b[1] - a[1])[0];
        const leastCovered = Object.entries(subjectTotals).sort((a, b) => a[1] - b[1])[0];

        setCoverageData({
          weeklyData,
          subjectTotals,
          mostFocused: mostFocused ? { subject: mostFocused[0], percent: Math.round((mostFocused[1] / totalTime) * 100) } : null,
          leastCovered: leastCovered ? { subject: leastCovered[0], percent: Math.round((leastCovered[1] / totalTime) * 100) } : null,
          unassignedTime: 0, // TODO: Calculate from gaps
        });

        // Get expected skills based on grade and subjects
        const childGrade = primaryChild?.grade || '6';
        const expectedSkills = getExpectedSkillsForGrade(childGrade, subjects);
        setSkillsData({ expectedSkills, observedSkills: [] }); // TODO: Load observed skills

        // TODO: Load mastery, strengths, behavior, and year plan data
        setMasteryData({ trend: 'stable', confidence: 'medium' });
        setStrengthsData({ strengths: [], growthAreas: [] });
        setBehaviorData({ focus: [], frustration: [], confidence: [] });
        setYearPlanData({ progress: 42, milestones: [] });

      } catch (err) {
        console.error('[AnalyticsTab] Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAnalyticsData();
  }, [primaryChildId, familyId, last6WeeksRange, subjects, primaryChild]);

  // Helper to get expected skills based on grade
  const getExpectedSkillsForGrade = (grade, subjects) => {
    const gradeNum = parseInt(grade.replace(/[^0-9]/g, '')) || 6;
    const baseSkills = [
      'Observation',
      'Cause & effect',
      'Critical thinking',
      'Communication',
      'Problem solving',
    ];

    const subjectSkills = {};
    (subjects || []).forEach(subject => {
      const name = subject.name?.toLowerCase() || '';
      if (name.includes('science')) {
        subjectSkills[subject.name] = ['Observation', 'Cause & effect', 'Scientific vocabulary', 'Data recording'];
      } else if (name.includes('math')) {
        subjectSkills[subject.name] = ['Number sense', 'Pattern recognition', 'Logical reasoning', 'Problem solving'];
      } else if (name.includes('reading') || name.includes('english') || name.includes('ela')) {
        subjectSkills[subject.name] = ['Reading comprehension', 'Vocabulary', 'Written expression', 'Literary analysis'];
      } else {
        subjectSkills[subject.name] = baseSkills;
      }
    });

    return subjectSkills;
  };

  if (loading) {
  return (
    <View style={styles.tabContent}>
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#4285f4" />
          <Text style={{ marginTop: 16, color: colors.textSecondary }}>Loading analytics...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <View style={styles.analyticsGrid2x3}>
        {/* 1. Curriculum Heatmap (top-left) */}
        <View style={styles.analyticsCard}>
          <View style={styles.analyticsCardHeader}>
            <Text style={styles.analyticsCardTitle}>Curriculum Coverage</Text>
            <Text style={styles.analyticsCardSubtitle}>(Last 6 Weeks)</Text>
          </View>
          <Text style={styles.analyticsCardSubtitle2}>By subject & skill type</Text>
          
          {coverageData ? (
            <View style={{ marginTop: 16 }}>
              {/* Simplified heatmap visualization */}
              <View style={{ gap: 8 }}>
                {Object.entries(coverageData.subjectTotals).slice(0, 5).map(([subject, time]) => (
                  <View key={subject} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 12, width: 100, color: colors.text }}>{subject}</Text>
                    <View style={{ flex: 1, height: 20, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
                      <View 
                        style={{ 
                          height: '100%', 
                          width: `${Math.min((time / Math.max(...Object.values(coverageData.subjectTotals))) * 100, 100)}%`,
                          backgroundColor: '#4285f4',
                        }} 
                      />
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, width: 50 }}>
                      {Math.round(time / 60)}h
                    </Text>
                  </View>
                ))}
              </View>

              {/* Right-side micro-summary */}
              <View style={{ marginTop: 16, padding: 12, backgroundColor: colors.background, borderRadius: 8 }}>
                {coverageData.mostFocused && (
                  <Text style={{ fontSize: 12, color: colors.text, marginBottom: 4 }}>
                    Most focused: {coverageData.mostFocused.subject} ({coverageData.mostFocused.percent}%)
                  </Text>
                )}
                {coverageData.leastCovered && (
                  <Text style={{ fontSize: 12, color: colors.text, marginBottom: 4 }}>
                    Least covered: {coverageData.leastCovered.subject} ({coverageData.leastCovered.percent}%)
                  </Text>
                )}
                {coverageData.unassignedTime > 0 && (
                  <Text style={{ fontSize: 12, color: colors.text }}>
                    Unassigned time detected: {coverageData.unassignedTime} hrs
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.analyticsCTA, { marginTop: 12 }]}
                onPress={() => {
                  // TODO: Open planner with pre-filled suggestions
                }}
              >
                <Text style={styles.analyticsCTAText}>Balance Curriculum →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 16 }}>
              No coverage data available
            </Text>
            )}
          </View>

        {/* 2. Skills Overview (top-right) */}
        <View style={styles.analyticsCard}>
          <View style={styles.analyticsCardHeader}>
            <Text style={styles.analyticsCardTitle}>Skills Overview</Text>
            </View>
          
          {skillsData && Object.keys(skillsData.expectedSkills).length > 0 ? (
            <View style={{ marginTop: 16 }}>
              {Object.entries(skillsData.expectedSkills).map(([subjectName, skills]) => (
                <View key={subjectName} style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
                    Expected skills for {subjectName}
                  </Text>
                  <View style={{ gap: 6 }}>
                    {skills.map((skill, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>• {skill}</Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' }}>
                          (Not yet observed)
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              
              <TouchableOpacity
                style={[styles.analyticsCTA, { marginTop: 12 }]}
                onPress={() => {
                  // TODO: Link skills from past events
                }}
              >
                <Text style={styles.analyticsCTAText}>Link skills from past events</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 16 }}>
              Add subjects to see expected skills
            </Text>
          )}
        </View>

        {/* 3. Mastery Over Time (middle-left) */}
        <View style={styles.analyticsCard}>
          <View style={styles.analyticsCardHeader}>
            <Text style={styles.analyticsCardTitle}>Learning Momentum</Text>
          </View>
          
          {masteryData ? (
              <View style={{ marginTop: 16 }}>
              {/* Simplified trend visualization */}
              <View style={{ height: 100, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, borderRadius: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 24, color: colors.textSecondary }}>→</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                  {masteryData.trend === 'improving' ? 'Improving' : masteryData.trend === 'declining' ? 'Declining' : 'Stable'}
                </Text>
              </View>
              
              <Text style={{ fontSize: 12, color: colors.text, fontStyle: 'italic', marginBottom: 12 }}>
                {primaryChild?.first_name || 'Child'}'s mastery growth shows steady progress with consistent engagement.
              </Text>

              <TouchableOpacity
                style={styles.analyticsCTA}
                onPress={() => {
                  // TODO: Show what influenced progress
                }}
              >
                <Text style={styles.analyticsCTAText}>See what influenced progress</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 16 }}>
              No mastery data available
            </Text>
          )}
        </View>

        {/* 4. Strengths & Areas for Improvement (middle-right) */}
        <View style={styles.analyticsCard}>
          <View style={styles.analyticsCardHeader}>
            <Text style={styles.analyticsCardTitle}>Strengths & Growth Areas</Text>
            </View>
          
          {strengthsData ? (
            <View style={{ marginTop: 16, flexDirection: 'row', gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Strengths</Text>
                <View style={{ gap: 6 }}>
                  {strengthsData.strengths.length > 0 ? (
                    strengthsData.strengths.map((strength, idx) => (
                      <View key={idx} style={{ padding: 8, backgroundColor: colors.background, borderRadius: 6 }}>
                        <Text style={{ fontSize: 12, color: colors.text }}>{strength}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' }}>
                      Pattern recognition{'\n'}Verbal explanations{'\n'}Curiosity-driven tasks
                    </Text>
                  )}
                </View>
              </View>
              
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Growth Areas</Text>
                <View style={{ gap: 6 }}>
                  {strengthsData.growthAreas.length > 0 ? (
                    strengthsData.growthAreas.map((area, idx) => (
                      <View key={idx} style={{ padding: 8, backgroundColor: colors.background, borderRadius: 6 }}>
                        <Text style={{ fontSize: 12, color: colors.text }}>{area}</Text>
            </View>
                    ))
                  ) : (
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' }}>
                      Written output consistency{'\n'}Task completion stamina
                    </Text>
                  )}
                </View>
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 16 }}>
              No strengths data available
            </Text>
          )}
        </View>

        {/* 5. Behavior Trends (bottom-left) */}
        <View style={styles.analyticsCard}>
          <View style={styles.analyticsCardHeader}>
            <Text style={styles.analyticsCardTitle}>Learning Energy</Text>
          </View>
          <Text style={styles.analyticsCardSubtitle2}>How is learning feeling lately?</Text>
          
          {behaviorData ? (
            <View style={{ marginTop: 16 }}>
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 4 }}>Focus</Text>
                  <View style={{ height: 30, backgroundColor: colors.background, borderRadius: 4, justifyContent: 'center', paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>More engaged during hands-on days</Text>
                  </View>
                </View>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 4 }}>Confidence</Text>
                  <View style={{ height: 30, backgroundColor: colors.background, borderRadius: 4, justifyContent: 'center', paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>Steady confidence levels</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.analyticsCTA, { marginTop: 12 }]}
                onPress={() => {
                  // TODO: Tag behaviors during events
                }}
              >
                <Text style={styles.analyticsCTAText}>Tag behaviors during events</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 16 }}>
              No behavior data available
            </Text>
          )}
        </View>

        {/* 6. Year Plan & Milestones (bottom-right) */}
        <View style={styles.analyticsCard}>
          <View style={styles.analyticsCardHeader}>
            <Text style={styles.analyticsCardTitle}>Year Plan Progress</Text>
          </View>
          
          {yearPlanData ? (
            <View style={{ marginTop: 16 }}>
              {/* Progress ring visualization */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 8, borderColor: colors.border, borderTopColor: '#4285f4', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{yearPlanData.progress}%</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.text, marginTop: 8 }}>On pace for June goals</Text>
              </View>

              {/* Milestones list */}
              <View style={{ gap: 8, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14 }}>✓</Text>
                  <Text style={{ fontSize: 12, color: colors.text }}>Term 1 science units</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14 }}>🔄</Text>
                  <Text style={{ fontSize: 12, color: colors.text }}>Writing portfolio halfway</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14 }}>⏳</Text>
                  <Text style={{ fontSize: 12, color: colors.text }}>Math benchmark upcoming</Text>
                </View>
              </View>

            <TouchableOpacity
                style={styles.analyticsCTA}
              onPress={onPlanYear}
            >
                <Text style={styles.analyticsCTAText}>Adjust pacing</Text>
            </TouchableOpacity>
          </View>
          ) : (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
                Create a year plan to track progress
              </Text>
              <TouchableOpacity
                style={styles.analyticsCTA}
                onPress={onPlanYear}
              >
                <Text style={styles.analyticsCTAText}>Create Year Plan</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// Homeschool ID Tab Component
function HomeschoolIdTab({ onGenerateStudentId, onGenerateTeacherId }) {
  return (
    <View style={styles.homeschoolIdTabContainer}>
      <View style={styles.homeschoolIdTabContent}>
        <FileText size={64} color={colors.textSecondary || '#6b7280'} style={{ marginBottom: 24 }} />
        <Text style={styles.homeschoolIdTabTitle}>Homeschool IDs</Text>
        <Text style={styles.homeschoolIdTabNote}>
          Generate student or teacher identification cards for educational discount purposes.
        </Text>
        <View style={styles.homeschoolIdTabButtons}>
          <TouchableOpacity
            style={styles.homeschoolIdTabButton}
            onPress={onGenerateStudentId}
          >
            <Sparkles size={18} color="#ffffff" />
            <Text style={styles.homeschoolIdTabButtonText}>GENERATE STUDENT ID</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.homeschoolIdTabButton}
            onPress={onGenerateTeacherId}
          >
            <Sparkles size={18} color="#ffffff" />
            <Text style={styles.homeschoolIdTabButtonText}>GENERATE TEACHER ID</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Homeschool ID Card Component (Modal)
function HomeschoolIdCard({ homeschoolIdData, setHomeschoolIdData, loading, primaryChild, US_STATES, idType, familyId, visible, onClose }) {
  const cardRef = useRef(null);
  const updateField = (field, value) => {
    setHomeschoolIdData(prev => ({ ...prev, [field]: value }));
  };

  const handleShare = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Share', 'Share functionality is available on web');
      return;
    }

    try {
      // Get the DOM element from the ref
      const cardElement = cardRef.current;
      
      if (!cardElement) {
        Alert.alert('Error', 'Could not find card element');
        return;
      }

      // Get the actual DOM node
      let domNode = cardElement;
      if (cardElement._nativeNode) {
        domNode = cardElement._nativeNode;
      } else if (typeof cardElement === 'object' && cardElement.nodeType !== 1) {
        const reactFiber = cardElement._reactInternalFiber || cardElement._reactInternalInstance;
        if (reactFiber && reactFiber.stateNode) {
          domNode = reactFiber.stateNode;
        }
      }

      // Check if html2canvas is available, if not try to load it dynamically
      if (typeof window === 'undefined' || typeof window.html2canvas !== 'function') {
        try {
          await new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[src*="html2canvas"]');
            if (existingScript) {
              if (window.html2canvas) {
                resolve();
              } else {
                existingScript.onload = resolve;
                existingScript.onerror = reject;
              }
              return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load html2canvas from CDN'));
            document.head.appendChild(script);
          });
        } catch (loadError) {
          console.error('Failed to load html2canvas:', loadError);
          Alert.alert(
            'Share Unavailable',
            'Image sharing requires html2canvas library. Please install html2canvas or check your internet connection.'
          );
          return;
        }
      }

      // Capture the card as an image
      if (typeof window.html2canvas === 'function') {
        try {
          const canvas = await window.html2canvas(domNode, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: false,
            removeContainer: true,
          });

          // Convert canvas to blob
          canvas.toBlob(async (blob) => {
            if (!blob) {
              Alert.alert('Error', 'Failed to create image for sharing');
              return;
            }

            // Create a File object from the blob
            const fileName = `learnadoodle-${idType}-id-${(homeschoolIdData.studentName || 'card').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });

            // Try Web Share API with file
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
              try {
                await navigator.share({
                  title: `${idType === 'student' ? 'Student' : 'Teacher'} ID - ${homeschoolIdData.studentName || 'Learnadoodle'}`,
                  text: `Learnadoodle ${idType === 'student' ? 'Student' : 'Teacher'} ID`,
                  files: [file],
                });
              } catch (shareError) {
                if (shareError.name !== 'AbortError') {
                  throw shareError;
                }
              }
            } else {
              // Fallback: Download the image (user can then share it manually)
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              Alert.alert('Downloaded', 'ID card image downloaded. You can now share it from your device.');
            }
          }, 'image/png', 1.0);
        } catch (canvasError) {
          console.error('html2canvas error:', canvasError);
          Alert.alert(
            'Share Error',
            'Failed to create image for sharing: ' + (canvasError.message || 'Unknown error')
          );
        }
      } else {
        Alert.alert(
          'Share Unavailable',
          'Image sharing requires html2canvas library. Please install it to use image sharing.'
        );
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error sharing:', error);
        Alert.alert('Error', 'Failed to share ID: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const handleExport = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Export', 'Export functionality is available on web');
      return;
    }

    try {
      // Get the DOM element from the ref
      // In React Native Web, ref.current should be the DOM element directly
      const cardElement = cardRef.current;
      
      if (!cardElement) {
        Alert.alert('Error', 'Could not find card element. Please try again.');
        return;
      }

      // Get the actual DOM node - React Native Web renders Views as divs
      // The ref might point to the View wrapper, so we need the actual DOM element
      let domNode = cardElement;
      
      // Try to get the native DOM node
      if (cardElement._nativeNode) {
        domNode = cardElement._nativeNode;
      } else if (typeof cardElement === 'object' && cardElement.nodeType !== 1) {
        // If it's not a direct DOM element, try to find it
        // React Native Web might wrap it, so check for the actual div
        if (cardElement.ownerDocument) {
          // It's already a DOM element
          domNode = cardElement;
        } else {
          // Try to find the DOM element by querying
          const reactFiber = cardElement._reactInternalFiber || cardElement._reactInternalInstance;
          if (reactFiber && reactFiber.stateNode) {
            domNode = reactFiber.stateNode;
          }
        }
      }
      
      // Final check - ensure we have a valid DOM element
      if (!domNode || (domNode.nodeType !== 1 && typeof domNode.offsetWidth === 'undefined')) {
        // Last resort: try to find the element by its style or class
        // In React Native Web, Views render as divs with inline styles
        console.warn('Could not find direct DOM node, trying alternative method');
        // Use a small delay to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        domNode = cardRef.current;
      }
      
      // Check if html2canvas is available, if not try to load it dynamically
      if (typeof window === 'undefined' || typeof window.html2canvas !== 'function') {
        // Try to dynamically load html2canvas from CDN
        try {
          await new Promise((resolve, reject) => {
            // Check if script already exists
            const existingScript = document.querySelector('script[src*="html2canvas"]');
            if (existingScript) {
              if (window.html2canvas) {
                resolve();
              } else {
                existingScript.onload = resolve;
                existingScript.onerror = reject;
              }
              return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load html2canvas from CDN'));
            document.head.appendChild(script);
          });
        } catch (loadError) {
          console.error('Failed to load html2canvas:', loadError);
          Alert.alert(
            'Export Unavailable',
            'Image export requires html2canvas library. Please install html2canvas or check your internet connection.'
          );
          return;
        }
      }
      
      // Now html2canvas should be available
      if (typeof window.html2canvas === 'function') {
        try {
          // Capture just the card element as PNG
          const canvas = await window.html2canvas(domNode, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: false,
            removeContainer: true,
          });
          
          // Convert canvas to blob and download
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const sanitizedName = (homeschoolIdData.studentName || 'card')
                .replace(/\s+/g, '-')
                .replace(/[^a-zA-Z0-9-]/g, '')
                .toLowerCase();
              const fileName = `learnadoodle-${idType}-id-${sanitizedName}.png`;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }, 100);
            } else {
              throw new Error('Failed to create blob from canvas');
            }
          }, 'image/png', 1.0);
        } catch (canvasError) {
          console.error('html2canvas error:', canvasError);
          Alert.alert(
            'Export Error', 
            'Failed to export as image: ' + (canvasError.message || 'Unknown error')
          );
        }
      } else {
        Alert.alert(
          'Export Unavailable',
          'html2canvas library is not available. Please install it to use image export.'
        );
      }
    } catch (error) {
      console.error('Error exporting:', error);
      Alert.alert('Error', 'Failed to export ID: ' + (error.message || 'Unknown error'));
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.homeschoolIdModalContent}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.homeschoolIdModalHeader}>
            <Text style={styles.homeschoolIdModalTitle}>
              {idType === 'student' ? 'Student ID' : 'Teacher ID'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.homeschoolIdModalClose}
            >
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <View style={styles.homeschoolIdContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Loading information...</Text>
            </View>
          ) : (idType === 'student' && !primaryChild) ? (
            <View style={styles.homeschoolIdContainer}>
              <Text style={styles.emptyText}>Please select a child to generate a student ID.</Text>
            </View>
          ) : (
            <ScrollView style={styles.homeschoolIdModalBody} showsVerticalScrollIndicator={false}>
              <View ref={cardRef} style={styles.homeschoolIdCard}>
                {/* Logo */}
                <View style={styles.homeschoolIdLogoContainer}>
                  <Image
                    source={require('../../assets/learnadoodle-logo.png')}
                    style={styles.homeschoolIdLogo}
                    resizeMode="cover"
              />
            </View>

                {/* Title */}
                <Text style={styles.homeschoolIdTitle}>
                  {idType === 'student' ? 'Student ID' : 'Teacher ID'}
                </Text>

                {/* Editable Fields */}
                <View style={styles.homeschoolIdFields}>
                  <View style={styles.homeschoolIdFieldRow}>
                    <Text style={styles.homeschoolIdLabel}>Name:</Text>
                    <View style={styles.homeschoolIdValue}>
                      <Text style={styles.homeschoolIdValueText}>
                        {homeschoolIdData.studentName || (idType === 'student' ? primaryChild?.first_name : '') || ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.homeschoolIdFieldRow}>
                    <Text style={styles.homeschoolIdLabel}>School:</Text>
                    <View style={styles.homeschoolIdValue}>
                      <Text style={styles.homeschoolIdValueText}>
                        {homeschoolIdData.school || 'Learnadoodle Online'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.homeschoolIdFieldRow}>
                    <Text style={styles.homeschoolIdLabel}>Location:</Text>
                    <View style={styles.homeschoolIdValue}>
                      <Text style={styles.homeschoolIdValueText}>
                        {homeschoolIdData.location || primaryChild?.standards || primaryChild?.state_code || primaryChild?.state || ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.homeschoolIdFieldRow}>
                    <Text style={styles.homeschoolIdLabel}>Academic Year:</Text>
                    <View style={styles.homeschoolIdValue}>
                      <Text style={styles.homeschoolIdValueText}>
                        {homeschoolIdData.academicYear || (() => {
                          const today = new Date();
                          const currentYear = today.getFullYear();
                          const nextYear = currentYear + 1;
                          return `${currentYear}/${nextYear}`;
                        })()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.homeschoolIdFieldRow}>
                    <Text style={styles.homeschoolIdLabel}>Member ID:</Text>
                    <View style={styles.homeschoolIdValue}>
                      <Text style={styles.homeschoolIdValueText}>
                        {homeschoolIdData.memberId || (idType === 'student' ? primaryChild?.id : familyId) || ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.homeschoolIdFieldRow}>
                    <Text style={styles.homeschoolIdLabel}>Expiration:</Text>
                    <View style={styles.homeschoolIdValue}>
                      <Text style={styles.homeschoolIdValueText}>
                        {homeschoolIdData.expiration || (() => {
                          const today = new Date();
                          const expirationDate = new Date(today);
                          expirationDate.setFullYear(expirationDate.getFullYear() + 1);
                          return expirationDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                        })()}
                      </Text>
                    </View>
                  </View>

                  {idType === 'student' && (
                    <View style={styles.homeschoolIdFieldRow}>
                      <Text style={styles.homeschoolIdLabel}>Grade:</Text>
                      <View style={styles.homeschoolIdValue}>
                        <Text style={styles.homeschoolIdValueText}>
                          {homeschoolIdData.grade || primaryChild?.grade || primaryChild?.grade_level || ''}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Disclaimer */}
                <View style={styles.homeschoolIdDisclaimer}>
                  <Text style={styles.homeschoolIdDisclaimerText}>
                    This ID is for educational discount purposes only{'\n'}
                    Not a government-issued identification{'\n'}
                    This is not proof of legal homeschooling status{'\n'}
                    For verification, visit Learnadoodle.com
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
          <View style={styles.homeschoolIdModalFooter}>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.homeschoolIdModalActionButton}
            >
              <Share2 size={18} color={colors.text} />
              <Text style={styles.homeschoolIdModalActionText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleExport}
              style={styles.homeschoolIdModalActionButton}
            >
              <Download size={18} color={colors.text} />
              <Text style={styles.homeschoolIdModalActionText}>Export</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// Compliance Tab Component
function ComplianceTab({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  subjects = [],
  selectedSubject = null,
}) {
  const [showComplianceChecklist, setShowComplianceChecklist] = useState(false);
  const [attendanceData, setAttendanceData] = useState([]);
  const [grades, setGrades] = useState([]);
  const [portfolioUploads, setPortfolioUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logSamples, setLogSamples] = useState({
    lessons: [],
    activities: [],
    materials: [],
    assignments: []
  });
  const [loadingLogSamples, setLoadingLogSamples] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const primaryChildId = selectedChildren.length > 0 ? selectedChildren[0] : null;
  const primaryChild = children.find(c => c.id === primaryChildId);
  
  // Get child name and subject name for display
  const displayChildName = primaryChild ? (primaryChild.first_name || primaryChild.name || 'Child') : 'All Children';
  const displaySubjectName = selectedSubject 
    ? (subjects.find(s => s.id === selectedSubject)?.name || 'Subject')
    : 'All Subjects';
  
  // Calculate school year date range (current school year)
  const schoolYearDateRange = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const month = today.getMonth();
    // School year starts in September (month 8)
    const yearStart = month >= 8 
      ? new Date(currentYear, 8, 1) // September
      : new Date(currentYear - 1, 8, 1);
    const yearEnd = month >= 8
      ? new Date(currentYear + 1, 5, 30) // June
      : new Date(currentYear, 5, 30);
    return { start: yearStart, end: yearEnd };
  }, []);

  useEffect(() => {
    if (!primaryChildId || !familyId) {
      setLoading(false);
      return;
    }
    
    const loadComplianceData = async () => {
      setLoading(true);
      try {
        const [attendance, gradesData, uploadsData] = await Promise.all([
          getAttendanceTimeline(
            primaryChildId,
            schoolYearDateRange.start.toISOString().split('T')[0],
            schoolYearDateRange.end.toISOString().split('T')[0]
          ).catch(() => []),
          getGrades(primaryChildId).catch(() => []),
          getPortfolioUploads(primaryChildId).catch(() => []),
        ]);
        
        setAttendanceData(attendance || []);
        setGrades(gradesData || []);
        setPortfolioUploads(uploadsData || []);
      } catch (err) {
        console.error('[ComplianceTab] Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadComplianceData();
  }, [primaryChildId, familyId, schoolYearDateRange]);

  // Load log samples automatically
  useEffect(() => {
    if (!primaryChildId || !familyId) return;
    loadLogSamples();
  }, [primaryChildId, familyId, selectedSubject]);

  // Load log samples for the learning log
  const loadLogSamples = async () => {
    if (!primaryChildId || !familyId) return;
    
    setLoadingLogSamples(true);
    try {
      // Helper function to filter events by child
      const filterEventsByChild = (events) => {
        return (events || []).filter(event => 
          event.child_id === primaryChildId
        );
      };

      // Load ALL events for the family, then filter in JavaScript
      const { data: allEventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, description, subject_id, unit, grade, start_ts, child_id, event_type')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .order('start_ts', { ascending: false })
        .limit(200);

      let lessonsData = [];
      let activitiesData = [];
      let assignmentsData = [];

      if (eventsError) {
        console.error('[ComplianceTab] Error loading events:', eventsError);
      } else {
        // Filter events by child and type in JavaScript
        const allEvents = allEventsData || [];
        const childEvents = filterEventsByChild(allEvents);
        
        // Filter by subject if one is selected
        const subjectFilteredEvents = selectedSubject
          ? childEvents.filter(e => e.subject_id === selectedSubject)
          : childEvents;
        
        const lessonsFiltered = subjectFilteredEvents
          .filter(e => e.event_type === 'Lesson')
          .slice(0, 20);
        
        const activitiesFiltered = subjectFilteredEvents
          .filter(e => e.event_type === 'Activity')
          .slice(0, 15);
        
        const assignmentsFiltered = subjectFilteredEvents
          .filter(e => ['Project', 'Exam', 'Assignment', 'Assessment'].includes(e.event_type))
          .slice(0, 15);
        
        // Fetch subject names for all events
        const allSubjectIds = [...new Set([
          ...lessonsFiltered.map(l => l.subject_id),
          ...activitiesFiltered.map(a => a.subject_id),
          ...assignmentsFiltered.map(a => a.subject_id)
        ].filter(Boolean))];
        
        const subjectMap = {};
        if (allSubjectIds.length > 0) {
          const { data: subjectsData } = await supabase
            .from('subject')
            .select('id, name')
            .in('id', allSubjectIds);
          (subjectsData || []).forEach(s => { subjectMap[s.id] = s; });
        }
        
        lessonsData = lessonsFiltered.map(lesson => ({
          ...lesson,
          notes: lesson.description || lesson.notes || '',
          subject: lesson.subject_id ? subjectMap[lesson.subject_id] : null
        }));
        
        activitiesData = activitiesFiltered.map(activity => ({
          ...activity,
          notes: activity.description || activity.notes || '',
          subject: activity.subject_id ? subjectMap[activity.subject_id] : null
        }));
        
        assignmentsData = assignmentsFiltered.map(assignment => ({
          ...assignment,
          notes: assignment.description || assignment.notes || '',
          subject: assignment.subject_id ? subjectMap[assignment.subject_id] : null
        }));
      }

      // Load materials connected to this child via material_children table
      const { data: materialChildrenData } = await supabase
        .from('material_children')
        .select('material_id')
        .eq('child_id', primaryChildId)
        .eq('family_id', familyId);

      const materialIds = materialChildrenData?.map(mc => mc.material_id) || [];

      let materialsData = [];
      if (materialIds.length > 0) {
        let materialsQuery = supabase
          .from('materials')
          .select(`
            id,
            title,
            type,
            subject_id,
            created_at
          `)
          .eq('family_id', familyId)
          .in('id', materialIds);
        
        // Filter by subject if one is selected
        if (selectedSubject) {
          materialsQuery = materialsQuery.eq('subject_id', selectedSubject);
        }
        
        const { data: materials, error: materialsError } = await materialsQuery
          .order('created_at', { ascending: false })
          .limit(20);

        if (materialsError) {
          console.error('[ComplianceTab] Error loading materials:', materialsError);
        } else {
          // Fetch subject names for materials
          const materialSubjectIds = [...new Set((materials || []).map(m => m.subject_id).filter(Boolean))];
          const materialSubjectMap = {};
          if (materialSubjectIds.length > 0) {
            const { data: materialSubjectsData } = await supabase
              .from('subject')
              .select('id, name')
              .in('id', materialSubjectIds);
            (materialSubjectsData || []).forEach(s => { materialSubjectMap[s.id] = s; });
          }
          
          materialsData = (materials || []).map(material => ({
            ...material,
            subject: material.subject_id ? materialSubjectMap[material.subject_id] : null
          }));
        }
      }

      setLogSamples({
        lessons: lessonsData,
        activities: activitiesData,
        materials: materialsData,
        assignments: assignmentsData
      });
    } catch (error) {
      console.error('[ComplianceTab] Error loading log samples:', error);
      setLogSamples({
        lessons: [],
        activities: [],
        materials: [],
        assignments: []
      });
    } finally {
      setLoadingLogSamples(false);
    }
  };

  if (!primaryChildId || !primaryChild) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          icon={Shield}
          title="No child selected"
          description="Select a child from the filters above to view compliance"
          size="default"
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.tabContent}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.indigo} />
          <Text style={styles.loadingText}>Loading compliance data...</Text>
        </View>
      </View>
    );
  }

  const childName = primaryChild.first_name || primaryChild.name || 'Child';
  const childState = primaryChild.standards || primaryChild.standards_state || primaryChild.state_code || primaryChild.state || 'CA';
  const childGrade = primaryChild.grade ? primaryChild.grade.replace(/^(K|Kindergarten)$/i, 'K').replace(/(\d+)(st|nd|rd|th)?\s*Grade/i, '$1').trim() : '6';
  
  const stateNames = { 
    'CA': 'California', 
    'NY': 'New York', 
    'TX': 'Texas', 
    'FL': 'Florida',
    'DC': 'District of Columbia',
    'MD': 'Maryland',
    'VA': 'Virginia'
  };
  const stateName = stateNames[childState] || childState;

  // Calculate coverage from attendance data
  const totalSchoolDays = 180; // Standard school year
  const loggedDays = new Set(attendanceData.map(a => a.day_date || a.date)).size;
  const coveragePercent = totalSchoolDays > 0 ? Math.round((loggedDays / totalSchoolDays) * 100) : 0;
  const isOnTrack = coveragePercent >= 90;

  // Calculate credits from grades (sum of credits field)
  const earnedCredits = grades.reduce((sum, grade) => {
    const credits = grade.credits ? parseFloat(grade.credits) : 0;
    return sum + (isNaN(credits) ? 0 : credits);
  }, 0);
  const requiredCredits = 6; // Default, could come from state requirements
  const complianceCredits = {
    earned: Math.round(earnedCredits * 10) / 10, // Round to 1 decimal
    required: requiredCredits
  };

  // Calculate portfolio evidence count
  const portfolioEvidenceCount = portfolioUploads?.length || 0;
  const hasPortfolioEvidence = portfolioEvidenceCount > 0;

  // Build the 4 required compliance checklist items
  const checklistItems = [
    {
      id: 'attendance-logged',
      item: 'Attendance logged',
      status: loggedDays >= 180 ? 'completed' : loggedDays > 0 ? 'in_progress' : 'pending',
      evidence: `${loggedDays}/${totalSchoolDays} days`,
      category: 'Attendance',
    },
    {
      id: 'subjects-covered',
      item: 'Required subjects covered',
      status: subjects.length >= 3 ? 'completed' : subjects.length > 0 ? 'in_progress' : 'pending',
      evidence: `${subjects.length} subject${subjects.length !== 1 ? 's' : ''}`,
      category: 'Subjects',
    },
    {
      id: 'portfolio-evidence',
      item: 'Portfolio evidence attached',
      status: hasPortfolioEvidence ? 'completed' : 'pending',
      evidence: hasPortfolioEvidence ? `${portfolioEvidenceCount} file${portfolioEvidenceCount !== 1 ? 's' : ''}` : 'No files',
      category: 'Documentation',
    },
    {
      id: 'standardized-testing',
      item: 'Standardized testing',
      status: 'pending',
      evidence: null,
      category: 'Assessments',
      isOptional: true
    }
  ];

  // Group by category
  const checklistByCategory = {
    'Attendance': [],
    'Subjects': [],
    'Documentation': [],
    'Assessments': []
  };

  checklistItems.forEach(item => {
    if (!checklistByCategory[item.category]) {
      checklistByCategory[item.category] = [];
    }
    checklistByCategory[item.category].push(item);
  });

  return (
    <View style={styles.tabContent}>
      <View style={styles.complianceCard}>
        <View style={styles.complianceCardContent}>
          {/* Learning Log Content */}
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>
                {displayChildName} - {displaySubjectName}
              </Text>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: '#000000',
                  backgroundColor: 'transparent',
                  borderRadius: 6,
                }}
                onPress={() => {
                  console.log('Export button clicked');
                  if (!primaryChildId) {
                    if (Platform.OS === 'web') {
                      window.alert('Please select a child to export the learning log.');
                    } else {
                      Alert.alert('Error', 'Please select a child to export the learning log.');
                    }
                    return;
                  }
                  setShowExportModal(true);
                }}
              >
                <Download size={16} color="#000000" />
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>
                  Export
                </Text>
              </TouchableOpacity>
            </View>
            {loadingLogSamples ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.indigo || '#3b82f6'} />
                <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8 }}>
                  Loading samples...
                </Text>
              </View>
            ) : (
              <View style={{ gap: 20 }}>
                {/* Lessons Section */}
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
                    Lessons ({logSamples.lessons.length})
                  </Text>
                  {logSamples.lessons.length === 0 ? (
                    <View style={{ padding: 12, backgroundColor: colors.background || '#f9fafb', borderRadius: 8 }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                        Add more Lessons to include in your compliance log
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {logSamples.lessons.slice(0, 5).map((lesson) => {
                        const hasDetails = lesson.subject?.name || lesson.unit || lesson.notes;
                        return (
                          <View key={lesson.id} style={{ padding: 12, backgroundColor: colors.background || '#f9fafb', borderRadius: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 4 }}>
                              {lesson.title || 'Untitled Lesson'}
                            </Text>
                            {hasDetails ? (
                              <>
                                {(lesson.subject?.name || lesson.unit) && (
                                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
                                    {lesson.subject?.name && `Subject: ${lesson.subject.name}`}
                                    {lesson.subject?.name && lesson.unit && ` · `}
                                    {lesson.unit && lesson.unit}
                                  </Text>
                                )}
                                {lesson.notes && (
                                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                    {lesson.notes.substring(0, 100)}{lesson.notes.length > 100 ? '...' : ''}
                                  </Text>
                                )}
                              </>
                            ) : (
                              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                Add details or notes
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Activities Section */}
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
                    Educational Activities ({logSamples.activities.length})
                  </Text>
                  {logSamples.activities.length === 0 ? (
                    <View style={{ padding: 12, backgroundColor: colors.background || '#f9fafb', borderRadius: 8 }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                        Add more Activities to include in your compliance log
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {logSamples.activities.slice(0, 5).map((activity) => {
                        const hasDetails = activity.subject?.name || activity.notes;
                        return (
                          <View key={activity.id} style={{ padding: 12, backgroundColor: colors.background || '#f9fafb', borderRadius: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 4 }}>
                              {activity.title || 'Untitled Activity'}
                            </Text>
                            {hasDetails ? (
                              <>
                                {activity.subject?.name && (
                                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
                                    Subject: {activity.subject.name}
                                  </Text>
                                )}
                                {activity.notes && (
                                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                    {activity.notes.substring(0, 100)}{activity.notes.length > 100 ? '...' : ''}
                                  </Text>
                                )}
                              </>
                            ) : (
                              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                Add details or notes
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Materials Section */}
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
                    Materials Used ({logSamples.materials.length})
                  </Text>
                  {logSamples.materials.length === 0 ? (
                    <View style={{ padding: 12, backgroundColor: colors.background || '#f9fafb', borderRadius: 8 }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                        Add more Materials to include in your compliance log
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {logSamples.materials.slice(0, 5).map((material) => (
                        <View key={material.id} style={{ padding: 12, backgroundColor: colors.background || '#f9fafb', borderRadius: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 4 }}>
                            {material.title || 'Untitled Material'}
                          </Text>
                          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                            Type: {material.type || 'Other'}
                            {material.subject?.name && ` · Subject: ${material.subject.name}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Assignments Section */}
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
                    Assignments ({logSamples.assignments.length})
                  </Text>
                  {logSamples.assignments.length === 0 ? (
                    <View style={{ padding: 12, backgroundColor: colors.background || '#f9fafb', borderRadius: 8 }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                        Add more Assignments to include in your compliance log
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {logSamples.assignments.slice(0, 5).map((assignment) => {
                        const hasDetails = assignment.subject?.name || assignment.grade || assignment.notes;
                        const detailParts = [];
                        if (assignment.subject?.name) detailParts.push(`Subject: ${assignment.subject.name}`);
                        if (assignment.grade) detailParts.push(`Grade: ${assignment.grade}`);
                        return (
                          <View key={assignment.id} style={{ padding: 12, backgroundColor: colors.background || '#f9fafb', borderRadius: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 4 }}>
                              {assignment.title || 'Untitled Assignment'}
                            </Text>
                            {hasDetails ? (
                              <>
                                {detailParts.length > 0 && (
                                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
                                    {detailParts.join(' · ')}
                                  </Text>
                                )}
                                {assignment.notes && (
                                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                    {assignment.notes.substring(0, 100)}{assignment.notes.length > 100 ? '...' : ''}
                                  </Text>
                                )}
                              </>
                            ) : (
                              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                Add details or notes
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Export Format Modal */}
      <Modal
        visible={showExportModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setShowExportModal(false)}
          />
          <View style={{
            backgroundColor: colors.card || '#ffffff',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '100%',
            position: 'relative',
          }}>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: colors.text,
                ...(Platform.OS === 'web' && {
                  fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }),
              }}>
                Export Learning Log
              </Text>
              <TouchableOpacity
                onPress={() => setShowExportModal(false)}
                style={{
                  padding: 4,
                }}
              >
                <X size={24} color={colors.text || '#000000'} />
              </TouchableOpacity>
            </View>
            <Text style={{
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 20,
            }}>
              Choose export format:
            </Text>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowExportModal(false);
                  try {
                    const { exportLearningLog } = await import('../../lib/services/exportClient');
                    const result = await exportLearningLog(
                      primaryChildId,
                      schoolYearDateRange.start,
                      schoolYearDateRange.end,
                      'pdf'
                    );
                    if (!result.success) {
                      if (Platform.OS === 'web') {
                        window.alert(`Error: ${result.error || 'Failed to export learning log.'}`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to export learning log.');
                      }
                    }
                  } catch (err) {
                    if (Platform.OS === 'web') {
                      window.alert(`Error: ${err.message || 'Failed to export learning log.'}`);
                    } else {
                      Alert.alert('Error', err.message || 'Failed to export learning log.');
                    }
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  PDF
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowExportModal(false);
                  try {
                    const { exportLearningLog } = await import('../../lib/services/exportClient');
                    const result = await exportLearningLog(
                      primaryChildId,
                      schoolYearDateRange.start,
                      schoolYearDateRange.end,
                      'docx'
                    );
                    if (!result.success) {
                      if (Platform.OS === 'web') {
                        window.alert(`Error: ${result.error || 'Failed to export learning log.'}`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to export learning log.');
                      }
                    }
                  } catch (err) {
                    if (Platform.OS === 'web') {
                      window.alert(`Error: ${err.message || 'Failed to export learning log.'}`);
                    } else {
                      Alert.alert('Error', err.message || 'Failed to export learning log.');
                    }
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  WORD
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Insights Tab Component
function InsightsTab({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  onGenerateDigest,
  onApplyInsightChanges, // Callback when insight has proposedChanges
}) {
  // Backend integration for insights
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  
  // Activity log data
  const [attendanceData, setAttendanceData] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [activityEvents, setActivityEvents] = useState([]);
  const [loadingActivityEvents, setLoadingActivityEvents] = useState(false);
  const [showAttendanceExportModal, setShowAttendanceExportModal] = useState(false);
  
  const primaryChildId = selectedChildren.length > 0 ? selectedChildren[0] : null;
  const primaryChild = children.find(c => c.id === primaryChildId);
  
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

  // Load attendance data for activity log card
  useEffect(() => {
    if (!primaryChildId) {
      setAttendanceData([]);
      return;
    }
    
    const loadAttendance = async () => {
      setLoadingAttendance(true);
      try {
        // Get attendance for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const endDate = new Date();
        
        const attendance = await getAttendanceTimeline(
          primaryChildId,
          thirtyDaysAgo.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        );
        
        setAttendanceData(attendance || []);
      } catch (err) {
        console.error('[InsightsTab] Error loading attendance:', err);
        setAttendanceData([]);
      } finally {
        setLoadingAttendance(false);
      }
    };
    
    loadAttendance();
  }, [primaryChildId]);

  // Load activity events (always load, not just when modal opens)
  useEffect(() => {
    if (!primaryChildId || !familyId) {
      setActivityEvents([]);
      return;
    }
    
    const loadActivityEvents = async () => {
      setLoadingActivityEvents(true);
      try {
        // Load events for the child (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        
        // Load all family events in the date range, then filter in JavaScript
        // This allows us to check both child_id and child_ids array
        const { data: allFamilyEvents, error: eventsError } = await supabase
          .from('events')
          .select(`
            id,
            title,
            description,
            start_ts,
            end_ts,
            event_type,
            subject_id,
            status,
            child_id,
            child_ids
          `)
          .eq('family_id', familyId)
          .gte('start_ts', startDate.toISOString())
          .lte('start_ts', endDate.toISOString())
          .is('deleted_at', null)
          .order('start_ts', { ascending: false })
          .limit(200);
        
        let eventsData = [];
        
        if (!eventsError && allFamilyEvents) {
          // Filter to include events where:
          // 1. child_id matches the selected child, OR
          // 2. child_ids array contains the selected child
          const filteredEvents = allFamilyEvents.filter(event => {
            if (event.child_id === primaryChildId) {
              return true;
            }
            if (event.child_ids && Array.isArray(event.child_ids)) {
              return event.child_ids.includes(primaryChildId);
            }
            return false;
          });
          
          // Fetch subject names for events that have subject_id
          const subjectIds = [...new Set(filteredEvents.map(e => e.subject_id).filter(Boolean))];
          let subjectMap = new Map();
          
          if (subjectIds.length > 0) {
            try {
              const { data: subjects, error: subjectsError } = await supabase
                .from('subject')
                .select('id, name')
                .in('id', subjectIds);
              
              if (!subjectsError && subjects) {
                subjects.forEach(subject => {
                  subjectMap.set(subject.id, subject);
                });
              }
            } catch (err) {
              console.error('[InsightsTab] Error fetching subjects:', err);
            }
          }
          
          // Add subject information and calculate duration for events
          eventsData = filteredEvents.map(event => {
            // Calculate duration_minutes from start_ts and end_ts
            let duration_minutes = null;
            if (event.start_ts && event.end_ts) {
              const start = new Date(event.start_ts);
              const end = new Date(event.end_ts);
              duration_minutes = Math.round((end - start) / (1000 * 60));
            }
            
            return {
              ...event,
              duration_minutes,
              subject: event.subject_id ? subjectMap.get(event.subject_id) : null
            };
          });
        }
        
        if (eventsError) {
          console.error('[InsightsTab] Error loading activity events:', eventsError);
          setActivityEvents([]);
        } else {
          setActivityEvents(eventsData || []);
        }
      } catch (err) {
        console.error('[InsightsTab] Error loading activity events:', err);
        setActivityEvents([]);
      } finally {
        setLoadingActivityEvents(false);
      }
    };
    
    loadActivityEvents();
  }, [primaryChildId, familyId]);

  // Calculate activity log stats
  const activityLogStats = useMemo(() => {
    if (!attendanceData || attendanceData.length === 0) {
      return {
        loggedDays: 0,
        expectedDays: 5,
        attendanceRate: 0,
        onTrack: false,
        weeklyCompliance: [null, null, null, null]
      };
    }

    // Get attendance for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentAttendance = attendanceData.filter(a => {
      const dayDate = new Date(a.day_date || a.date);
      return dayDate >= thirtyDaysAgo;
    });

    // Calculate stats for last school week (7 days back)
    const today = new Date();
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - 7);
    const lastWeekEnd = new Date(today);
    
    const lastWeekAttendance = recentAttendance.filter(a => {
      const dayDate = new Date(a.day_date || a.date);
      return dayDate >= lastWeekStart && dayDate <= lastWeekEnd;
    });
    const loggedDays = new Set(lastWeekAttendance.map(a => a.day_date || a.date)).size;
    
    // Expected school days - use 5 as default
    const expectedDays = Math.max(loggedDays, 5);
    const attendanceRate = expectedDays > 0 ? Math.round((loggedDays / expectedDays) * 100) : 0;
    const onTrack = loggedDays >= expectedDays || attendanceRate >= 90;

    // Calculate weekly compliance for mini-trend (last 4 weeks)
    const weeklyCompliance = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i * 7) - 7);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - (i * 7));
      
      const weekAttendance = recentAttendance.filter(a => {
        const dayDate = new Date(a.day_date || a.date);
        return dayDate >= weekStart && dayDate < weekEnd;
      });
      
      const weekLoggedDays = new Set(weekAttendance.map(a => a.day_date || a.date)).size;
      const weekPresentCount = weekAttendance.filter(a => a.status === 'present').length;
      
      if (weekLoggedDays === 0) {
        weeklyCompliance.push(null); // Not required (gray circle)
      } else {
        // Compliant if all logged days are present, or high present rate
        const weekRate = weekAttendance.length > 0 
          ? Math.round((weekPresentCount / weekAttendance.length) * 100) 
          : 0;
        weeklyCompliance.push(weekRate >= 90 || weekPresentCount === weekLoggedDays);
      }
    }

    return {
      loggedDays,
      expectedDays,
      attendanceRate,
      onTrack,
      weeklyCompliance
    };
  }, [attendanceData]);

  return (
    <View style={styles.tabContent}>
      {/* Activity Log Card - Always show */}
      <View style={styles.attendanceCard}>
          <View style={styles.attendanceCardContent}>
            {loadingAttendance ? (
              <View style={styles.attendanceLoading}>
                <ActivityIndicator size="small" color={colors.indigo} />
                <Text style={styles.attendanceLoadingText}>Loading activity log...</Text>
              </View>
            ) : (
              <>
                {/* Weekly Summary */}
                {(() => {
                  const today = new Date();
                  // Set to start of today (midnight)
                  today.setHours(0, 0, 0, 0);
                  
                  // Last 7 days ending with today (6 days before today + today = 7 days)
                  const weekEnd = new Date(today);
                  weekEnd.setHours(23, 59, 59, 999); // End of today
                  const weekStart = new Date(today);
                  weekStart.setDate(today.getDate() - 6); // 6 days before today
                  weekStart.setHours(0, 0, 0, 0); // Start of that day
                  
                  // Format week range
                  const weekStartStr = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  const weekEndStr = weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  const weekRange = `${weekStartStr}–${weekEndStr}`;
                  
                  // Get week events
                  const weekEvents = activityEvents.filter(e => {
                    if (!e.start_ts) return false;
                    const eventDate = new Date(e.start_ts);
                    return eventDate >= weekStart && eventDate <= weekEnd;
                  });
                  
                  // Calculate session stats
                  const completedSessions = weekEvents.filter(e => e.status === 'done' || e.status === 'completed').length;
                  
                  // Calculate total time
                  const weekAttendance = attendanceData.filter(a => {
                    const dayDate = new Date(a.day_date || a.date);
                    dayDate.setHours(0, 0, 0, 0);
                    return dayDate >= weekStart && dayDate <= weekEnd;
                  });
                  const totalMinutes = weekAttendance.reduce((sum, a) => sum + (a.minutes || 0), 0);
                  const hours = Math.floor(totalMinutes / 60);
                  const minutes = totalMinutes % 60;
                  const totalTimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                  
                  return (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={{ 
                        fontSize: 18, 
                        fontWeight: '600', 
                        color: colors.text, 
                        marginBottom: 12,
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}>
                        This Week · {weekRange}
                      </Text>
                      <Text style={{ 
                        fontSize: 14, 
                        fontWeight: '500', 
                        color: colors.text,
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}>
                        Total time: {totalTimeStr}
            </Text>
          </View>
                  );
                })()}

                {/* Recent Attendance Summary - Horizontal Strip */}
                {(() => {
                  const today = new Date();
                  const days = [];
                  for (let i = 6; i >= 0; i--) {
                    const date = new Date(today);
                    date.setDate(today.getDate() - i);
                    days.push(date);
                  }
                  
                  return (
                    <View style={styles.attendanceStrip}>
                      {days.map((day, index) => {
                        const dayStr = day.toISOString().split('T')[0];
                        const record = attendanceData.find(a => (a.day_date || a.date) === dayStr);
                        const dayLabel = day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
                        const dayNum = day.getDate();
                        
                        let statusColor = '#e5e7eb';
                        let statusIcon = '○';
                        if (record) {
                          if (record.status === 'present') {
                            statusColor = '#10B981';
                            statusIcon = '✓';
                          } else if (record.status === 'partial') {
                            statusColor = '#F59E0B';
                            statusIcon = '~';
                          } else if (record.status === 'absent') {
                            statusColor = '#EF4444';
                            statusIcon = '⏸';
                          }
                        }
                        
                        return (
                          <View key={index} style={styles.attendanceDay}>
                            <View style={[
                              styles.attendanceDayDot,
                              {
                                backgroundColor: statusColor + '20',
                                borderColor: statusColor
                              }
                            ]}>
                              <Text style={{ fontSize: 14, color: statusColor, fontWeight: '600' }}>
                                {statusIcon}
                              </Text>
        </View>
                            <Text style={styles.attendanceDayLabel}>{dayLabel}</Text>
                            <Text style={[styles.attendanceDayLabel, { fontSize: 11, fontWeight: '600' }]}>{dayNum}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                {/* Recent Events */}
                <View style={{ marginTop: 24, marginBottom: 16 }}>
                  <Text style={{ 
                    fontSize: 16, 
                    fontWeight: '600', 
                    color: colors.text, 
                    marginBottom: 12,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>
                    Recent Events
                  </Text>
                  {loadingActivityEvents ? (
                    <View style={{ padding: 16, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={colors.indigo} />
                    </View>
                  ) : (() => {
                    // Filter events from the past 7 days
                    const today = new Date();
                    const sevenDaysAgo = new Date(today);
                    sevenDaysAgo.setDate(today.getDate() - 7);
                    
                    const recentEvents = activityEvents.filter(event => {
                      if (!event.start_ts) return false;
                      const eventDate = new Date(event.start_ts);
                      // Include events from the past 7 days (including today)
                      // Compare dates (ignore time) to include all events from the past 7 days
                      const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                      const sevenDaysAgoOnly = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate());
                      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                      
                      return eventDateOnly >= sevenDaysAgoOnly && eventDateOnly <= todayOnly;
                    });
                    
                    return recentEvents.length === 0 ? (
                      <Text style={{ 
                        fontSize: 14, 
                        color: colors.textSecondary, 
                        padding: 16,
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}>
                        No recent events
                      </Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {recentEvents.slice(0, 10).map((event, idx) => {
                          const eventDate = event.start_ts ? new Date(event.start_ts) : null;
                          const dateString = eventDate
                            ? eventDate.toLocaleDateString(undefined, { 
                                month: 'short', 
                                day: 'numeric' 
                              })
                            : null;
                          const timeString = eventDate
                            ? eventDate.toLocaleTimeString(undefined, { 
                                hour: 'numeric',
                                minute: '2-digit'
                              })
                            : null;
                          
                          // Get child names for this event
                          const eventChildIds = [];
                          if (event.child_id) {
                            eventChildIds.push(event.child_id);
                          }
                          if (event.child_ids && Array.isArray(event.child_ids)) {
                            event.child_ids.forEach(id => {
                              if (!eventChildIds.includes(id)) {
                                eventChildIds.push(id);
                              }
                            });
                          }
                          const eventChildren = eventChildIds
                            .map(id => children.find(c => c.id === id))
                            .filter(Boolean);
                        
                          return (
                            <View key={event.id || idx} style={styles.activityEventItem}>
                              <View style={{ flex: 1 }}>
                                {/* Title row with event type (same style as library) */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <Text style={{ 
                                    fontSize: 14, 
                                    fontWeight: '700', 
                                    color: colors.text,
                                    ...(Platform.OS === 'web' && {
                                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                    }),
                                  }}>
                                    {event.title || 'Untitled Event'}
                                  </Text>
                                  {event.event_type && (
                                    <Text style={{ 
                                      fontSize: 13, 
                                      color: colors.muted || colors.textSecondary,
                                      fontWeight: '400',
                                      ...(Platform.OS === 'web' && {
                                        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                      }),
                                    }}>
                                      {event.event_type}
                                    </Text>
                                  )}
                                </View>
                                
                                {/* Child names with color dots from planner */}
                                {eventChildren.length > 0 && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                                    {eventChildren.map((child, childIdx) => {
                                      const childColor = getChildColorFromAvatar(child.avatar);
                                      return (
                                        <View key={child.id || childIdx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                          <View style={{ 
                                            width: 8, 
                                            height: 8, 
                                            borderRadius: 4, 
                                            backgroundColor: childColor 
                                          }} />
                                          <Text style={{ 
                                            fontSize: 14, 
                                            color: colors.textSecondary,
                                            ...(Platform.OS === 'web' && {
                                              fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                            }),
                                          }}>
                                            {child.first_name || child.name || 'Child'}
                                          </Text>
                                        </View>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>
                              
                              {/* Date and time on the right */}
                              {(dateString || timeString) && (
                                <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                                  {dateString && (
                                    <Text style={{ 
                                      fontSize: 14, 
                                      color: colors.text,
                                      fontWeight: '500',
                                      ...(Platform.OS === 'web' && {
                                        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                      }),
                                    }}>
                                      {dateString}
                                    </Text>
                                  )}
                                  {timeString && (
                                    <Text style={{ 
                                      fontSize: 14, 
                                      color: colors.textSecondary,
                                      marginTop: 2,
                                      ...(Platform.OS === 'web' && {
                                        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                      }),
                                    }}>
                                      {timeString}
                                    </Text>
                                  )}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>

                {/* Full Attendance Log */}
                <View style={{ marginTop: 24 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ 
                      fontSize: 18, 
                      fontWeight: '600', 
                      color: colors.text, 
                      ...(Platform.OS === 'web' && {
                        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }),
                    }}>
                      Full Attendance Log
                    </Text>
                    {attendanceData.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setShowAttendanceExportModal(true)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderWidth: 1,
                          borderColor: '#000000',
                          backgroundColor: 'transparent',
                          borderRadius: 6,
                        }}
                      >
                        <Download size={16} color="#000000" />
                        <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>
                          Export
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {attendanceData.length === 0 ? (
                    <Text style={{ 
                      fontSize: 14, 
                      color: colors.textSecondary, 
                      padding: 16,
                      ...(Platform.OS === 'web' && {
                        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }),
                    }}>
                      No attendance records found.
                    </Text>
                  ) : (
                    <View style={styles.attendanceTable}>
                      {/* Table Header */}
                      <View style={styles.attendanceTableHeader}>
                        <Text style={styles.attendanceTableHeaderText}>Date</Text>
                        <Text style={styles.attendanceTableHeaderText}>Subject</Text>
                        <Text style={styles.attendanceTableHeaderText}>Duration</Text>
                        <Text style={styles.attendanceTableHeaderText}>Status</Text>
                      </View>
                      {/* Table Rows */}
                      {attendanceData.map((record, index) => {
                        const dateString = record.day_date || record.date
                          ? new Date(record.day_date || record.date).toLocaleDateString(undefined, { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })
                          : null;
                        
                        const statusColor = {
                          present: '#10B981',
                          partial: '#F59E0B',
                          absent: '#EF4444'
                        }[record.status] || colors.textSecondary;

                        const statusLabel = record.status ? record.status.charAt(0).toUpperCase() + record.status.slice(1) : 'Unknown';
                        
                        // Get subject name from event if available
                        const event = activityEvents.find(e => e.id === record.event_id);
                        const subjectName = event?.subject?.name || 'N/A';

                        return (
                          <View
                            key={record.id || index}
                            style={[
                              styles.attendanceTableRow,
                              index < attendanceData.length - 1 && styles.attendanceTableRowBorder
                            ]}
                          >
                            <Text style={styles.attendanceTableCell}>
                              {dateString || 'No Date'}
                            </Text>
                            <Text style={styles.attendanceTableCell}>
                              {subjectName}
                            </Text>
                            <Text style={styles.attendanceTableCell}>
                              {record.minutes > 0 ? `${record.minutes}m` : 'N/A'}
                            </Text>
                            <View style={styles.attendanceTableCell}>
                              <View style={[
                                styles.attendanceStatusBadge,
                                { backgroundColor: statusColor + '20' }
                              ]}>
                                <Text style={[styles.attendanceStatusText, { color: statusColor }]}>
                                  {statusLabel}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
      </View>

      {/* Insights Feed */}
      <View style={styles.insightsSection}>
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
        ) : insights.length > 0 && (
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

      {/* Activity Log Modal */}
      {showAttendanceModal && (
        <Modal
          visible={showAttendanceModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAttendanceModal(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowAttendanceModal(false)}
            />
            <View
              style={[styles.modalContent, { maxWidth: 600 }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  Activity Log
                </Text>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowAttendanceModal(false)}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScrollView}>
                {loadingActivityEvents || loadingAttendance ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={colors.indigo} />
                    <Text style={{ marginTop: 16, color: colors.textSecondary }}>Loading activity log...</Text>
                  </View>
                ) : (
                  <>
                    {/* Weekly Summary Card */}
                    {(() => {
                      const today = new Date();
                      const weekStart = new Date(today);
                      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
                      const weekEnd = new Date(weekStart);
                      weekEnd.setDate(weekStart.getDate() + 6);
                      
                      // Format week range
                      const weekStartStr = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const weekEndStr = weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const weekRange = `${weekStartStr}–${weekEndStr}`;
                      
                      // Get week events
                      const weekEvents = activityEvents.filter(e => {
                        if (!e.start_ts) return false;
                        const eventDate = new Date(e.start_ts);
                        return eventDate >= weekStart && eventDate <= weekEnd;
                      });
                      
                      // Calculate session stats
                      const completedSessions = weekEvents.filter(e => e.status === 'done' || e.status === 'completed').length;
                      
                      // Calculate total time
                      const weekAttendance = attendanceData.filter(a => {
                        const dayDate = new Date(a.day_date || a.date);
                        return dayDate >= weekStart && dayDate <= weekEnd;
                      });
                      const totalMinutes = weekAttendance.reduce((sum, a) => sum + (a.minutes || 0), 0);
                      const hours = Math.floor(totalMinutes / 60);
                      const minutes = totalMinutes % 60;
                      const totalTimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                      
                      return (
                        <View style={styles.weeklySummaryCard}>
                          <View style={styles.weeklySummaryHeader}>
                            <Text style={styles.weeklySummaryTitle}>
                              This Week · {weekRange}
                            </Text>
                          </View>
                          <View style={styles.weeklySummaryStats}>
                            <View style={styles.weeklySummaryStat}>
                              <Text style={{ fontSize: 16, color: '#10B981' }}>✓</Text>
                              <Text style={styles.weeklySummaryStatText}>
                                {completedSessions} learning session{completedSessions !== 1 ? 's' : ''} completed
                              </Text>
                            </View>
                          </View>
                          <View style={styles.weeklySummaryTotal}>
                            <Text style={styles.weeklySummaryTotalText}>
                              Total time: {totalTimeStr}
                            </Text>
      </View>
                        </View>
                      );
                    })()}

                    {/* Recent Attendance Summary - Horizontal Strip */}
                    {(() => {
                      const today = new Date();
                      const days = [];
                      for (let i = 6; i >= 0; i--) {
                        const date = new Date(today);
                        date.setDate(today.getDate() - i);
                        days.push(date);
                      }
                      
                      return (
                        <View style={styles.attendanceStrip}>
                          {days.map((day, index) => {
                            const dayStr = day.toISOString().split('T')[0];
                            const record = attendanceData.find(a => (a.day_date || a.date) === dayStr);
                            const dayLabel = day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
                            const dayNum = day.getDate();
                            
                            let statusColor = '#e5e7eb';
                            let statusIcon = '○';
                            if (record) {
                              if (record.status === 'present') {
                                statusColor = '#10B981';
                                statusIcon = '✓';
                              } else if (record.status === 'partial') {
                                statusColor = '#F59E0B';
                                statusIcon = '~';
                              } else if (record.status === 'absent') {
                                statusColor = '#EF4444';
                                statusIcon = '⏸';
                              }
                            }
                            
                            return (
                              <View key={index} style={styles.attendanceDay}>
                                <View style={[
                                  styles.attendanceDayDot,
                                  {
                                    backgroundColor: statusColor + '20',
                                    borderColor: statusColor
                                  }
                                ]}>
                                  <Text style={{ fontSize: 14, color: statusColor, fontWeight: '600' }}>
                                    {statusIcon}
                                  </Text>
                                </View>
                                <Text style={styles.attendanceDayLabel}>{dayLabel}</Text>
                                <Text style={[styles.attendanceDayLabel, { fontSize: 11, fontWeight: '600' }]}>{dayNum}</Text>
                              </View>
                            );
                          })}
                        </View>
                      );
                    })()}

                    {/* Recent Events */}
                    <View style={{ marginTop: 24, marginBottom: 16 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
                        Recent Events
                      </Text>
                      {activityEvents.length === 0 ? (
                        <Text style={{ fontSize: 14, color: colors.textSecondary, padding: 16 }}>
                          No recent events
                        </Text>
                      ) : (
                        <View style={{ gap: 8 }}>
                          {activityEvents.slice(0, 10).map((event, idx) => {
                            const timeString = event.start_ts
                              ? new Date(event.start_ts).toLocaleTimeString(undefined, { 
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })
                              : null;
                            
                            return (
                              <View key={event.id || idx} style={styles.activityEventItem}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>
                                    {event.title || 'Untitled Event'}
                                  </Text>
                                  {timeString && (
                                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                                      {timeString}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>

                    {/* View Full Attendance Log Button */}
                    <TouchableOpacity
                      style={styles.viewFullAttendanceButton}
                      onPress={() => {
                        setShowAttendanceModal(false);
                        if (typeof window !== 'undefined' && window.__ldSearchNavigate) {
                          const childId = primaryChildId || selectedChildren[0] || null;
                          window.__ldSearchNavigate('records', null, { 
                            tab: 'attendance', 
                            child: childId 
                          });
                        }
                      }}
                    >
                      <Text style={styles.viewFullAttendanceText}>View full attendance log</Text>
                      <ChevronDown size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Attendance Export Modal */}
      <Modal
        visible={showAttendanceExportModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAttendanceExportModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          onPress={() => setShowAttendanceExportModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              ...Platform.select({
                web: {
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                },
                default: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  elevation: 8,
                },
              }),
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: colors.text || '#000000',
              }}>
                Export Attendance Log
              </Text>
              <TouchableOpacity
                onPress={() => setShowAttendanceExportModal(false)}
                style={{
                  padding: 4,
                }}
              >
                <X size={24} color={colors.text || '#000000'} />
              </TouchableOpacity>
            </View>
            <Text style={{
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 20,
            }}>
              Choose export format:
            </Text>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowAttendanceExportModal(false);
                  try {
                    const { exportAttendanceLog } = await import('../../lib/services/exportClient');
                    const result = await exportAttendanceLog(
                      primaryChildId,
                      dateRange?.start || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
                      dateRange?.end || new Date().toISOString().split('T')[0],
                      'pdf'
                    );
                    if (!result.success) {
                      if (Platform.OS === 'web') {
                        window.alert(`Error: ${result.error || 'Failed to export attendance log.'}`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to export attendance log.');
                      }
                    }
                  } catch (err) {
                    if (Platform.OS === 'web') {
                      window.alert(`Error: ${err.message || 'Failed to export attendance log.'}`);
                    } else {
                      Alert.alert('Error', err.message || 'Failed to export attendance log.');
                    }
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  PDF
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowAttendanceExportModal(false);
                  try {
                    const { exportAttendanceLog } = await import('../../lib/services/exportClient');
                    const result = await exportAttendanceLog(
                      primaryChildId,
                      dateRange?.start || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
                      dateRange?.end || new Date().toISOString().split('T')[0],
                      'csv'
                    );
                    if (!result.success) {
                      if (Platform.OS === 'web') {
                        window.alert(`Error: ${result.error || 'Failed to export attendance log.'}`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to export attendance log.');
                      }
                    }
                  } catch (err) {
                    if (Platform.OS === 'web') {
                      window.alert(`Error: ${err.message || 'Failed to export attendance log.'}`);
                    } else {
                      Alert.alert('Error', err.message || 'Failed to export attendance log.');
                    }
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  CSV
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Extracurriculars Tab Component
function ExtracurricularsTab({
  familyId,
  selectedChildren,
  children = [],
}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [activeView, setActiveView] = useState('all'); // 'all', 'volunteer', 'leadership', 'work', 'certifications'
  const [showExportModal, setShowExportModal] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [startDateCalendarViewMonth, setStartDateCalendarViewMonth] = useState(new Date());
  const [endDateCalendarViewMonth, setEndDateCalendarViewMonth] = useState(new Date());

  const primaryChildId = selectedChildren.length > 0 ? selectedChildren[0] : null;
  const primaryChild = children.find(c => c.id === primaryChildId);

  // Activity form state
  const [activityForm, setActivityForm] = useState({
    name: '',
    category: '',
    organization: '',
    startDate: '',
    endDate: '',
    isOngoing: false,
    description: '',
    hoursPerWeek: '',
    totalHours: '',
    location: '',
    supervisorName: '',
    supervisorContact: '',
    proofUrl: '',
    childId: primaryChildId,
  });

  const categories = [
    'Volunteer',
    'Club / Organization',
    'Job / Internship',
    'Leadership Role',
    'Sport',
    'Creative / Independent Project',
    'Certificate / Credential',
    'Competition / Award',
  ];

  // Helper functions for date handling
  const addDays = (d, n) => {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + n);
    return nd;
  };

  const fmt = (d) => {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateForInput = (d) => {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Calculate analytics
  const analytics = useMemo(() => {
    const volunteerActivities = activities.filter(a => a.category === 'Volunteer');
    const leadershipActivities = activities.filter(a => 
      a.category === 'Leadership Role' || a.tags?.includes('Leadership')
    );
    const workActivities = activities.filter(a => a.category === 'Job / Internship');
    const certActivities = activities.filter(a => 
      a.category === 'Certificate / Credential' || a.category === 'Competition / Award'
    );

    const totalVolunteerHours = volunteerActivities.reduce((sum, a) => {
      return sum + (parseFloat(a.totalHours) || 0);
    }, 0);

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);
    
    const volunteerHoursThisYear = volunteerActivities
      .filter(a => {
        const startDate = a.startDate ? new Date(a.startDate) : null;
        const endDate = a.endDate ? new Date(a.endDate) : null;
        return (startDate && startDate <= yearEnd) && (!endDate || endDate >= yearStart);
      })
      .reduce((sum, a) => sum + (parseFloat(a.totalHours) || 0), 0);

    const yearsActive = new Set(
      activities.map(a => {
        const startDate = a.startDate ? new Date(a.startDate) : null;
        return startDate ? startDate.getFullYear() : null;
      }).filter(y => y !== null)
    ).size;

    return {
      totalActivities: activities.length,
      yearsActive,
      totalVolunteerHours,
      volunteerHoursThisYear,
      leadershipCount: leadershipActivities.length,
    };
  }, [activities]);

  // Filter activities by view
  const filteredActivities = useMemo(() => {
    switch (activeView) {
      case 'volunteer':
        return activities.filter(a => a.category === 'Volunteer');
      case 'leadership':
        return activities.filter(a => 
          a.category === 'Leadership Role' || a.tags?.includes('Leadership')
        );
      case 'work':
        return activities.filter(a => a.category === 'Job / Internship');
      case 'certifications':
        return activities.filter(a => 
          a.category === 'Certificate / Credential' || 
          a.category === 'Competition / Award'
        );
      default:
        return activities;
    }
  }, [activities, activeView]);

  // Sync calendar view month when start date changes
  useEffect(() => {
    if (activityForm.startDate && !showStartDatePicker) {
      const date = new Date(activityForm.startDate);
      if (!isNaN(date.getTime())) {
        setStartDateCalendarViewMonth(date);
      }
    }
  }, [activityForm.startDate, showStartDatePicker]);

  // Sync calendar view month when end date changes
  useEffect(() => {
    if (activityForm.endDate && !showEndDatePicker) {
      const date = new Date(activityForm.endDate);
      if (!isNaN(date.getTime())) {
        setEndDateCalendarViewMonth(date);
      }
    }
  }, [activityForm.endDate, showEndDatePicker]);

  // Load activities
  useEffect(() => {
    if (!familyId || !primaryChildId) {
      setLoading(false);
      return;
    }

    const loadActivities = async () => {
      try {
        setLoading(true);
        // TODO: Replace with actual Supabase query
        // For now, using empty array
        setActivities([]);
      } catch (error) {
        console.error('[ExtracurricularsTab] Error loading activities:', error);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
  }, [familyId, primaryChildId]);

  const handleSaveActivity = async () => {
    try {
      // TODO: Save to Supabase
      const newActivity = {
        id: editingActivity?.id || Date.now().toString(),
        ...activityForm,
        createdAt: editingActivity?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingActivity) {
        setActivities(prev => prev.map(a => a.id === editingActivity.id ? newActivity : a));
      } else {
        setActivities(prev => [...prev, newActivity]);
      }

      setShowAddActivityModal(false);
      setEditingActivity(null);
      setActivityForm({
        name: '',
        category: '',
        organization: '',
        startDate: '',
        endDate: '',
        isOngoing: false,
        description: '',
        hoursPerWeek: '',
        totalHours: '',
        location: '',
        supervisorName: '',
        supervisorContact: '',
        proofUrl: '',
        childId: primaryChildId,
      });
    } catch (error) {
      console.error('[ExtracurricularsTab] Error saving activity:', error);
      if (Platform.OS === 'web') {
        window.alert('Error saving activity. Please try again.');
      } else {
        Alert.alert('Error', 'Error saving activity. Please try again.');
      }
    }
  };

  const handleEditActivity = (activity) => {
    setEditingActivity(activity);
    setActivityForm({
      name: activity.name || '',
      category: activity.category || '',
      organization: activity.organization || '',
      startDate: activity.startDate || '',
      endDate: activity.endDate || '',
      isOngoing: activity.isOngoing || false,
      description: activity.description || '',
      hoursPerWeek: activity.hoursPerWeek || '',
      totalHours: activity.totalHours || '',
      location: activity.location || '',
      supervisorName: activity.supervisorName || '',
      supervisorContact: activity.supervisorContact || '',
      proofUrl: activity.proofUrl || '',
      childId: activity.childId || primaryChildId,
    });
    setShowAddActivityModal(true);
  };

  const handleDeleteActivity = async (activityId) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Are you sure you want to delete this activity?')) {
        return;
      }
    } else {
      Alert.alert(
        'Delete Activity',
        'Are you sure you want to delete this activity?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => {} },
        ]
      );
    }

    setActivities(prev => prev.filter(a => a.id !== activityId));
  };

  // Empty state
  if (loading) {
    return (
      <View style={styles.tabContent}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.indigo} />
          <Text style={styles.loadingText}>Loading activities...</Text>
        </View>
      </View>
    );
  }

  if (activities.length === 0 && !showAddActivityModal) {
    return (
      <View style={styles.tabContent}>
        <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Text style={{
            fontSize: 20,
            fontWeight: '600',
            color: colors.text,
            marginBottom: 12,
            textAlign: 'center',
          }}>
            Extracurriculars build the story
          </Text>
          <Text style={{
            fontSize: 14,
            color: colors.textSecondary,
            marginBottom: 32,
            textAlign: 'center',
            lineHeight: 20,
          }}>
            Track volunteering, leadership, jobs, clubs, and certifications here.{'\n'}
            This helps build a complete picture of who your child is beyond academics.
          </Text>
          <TouchableOpacity
            onPress={() => setShowAddActivityModal(true)}
            style={{
              paddingVertical: 14,
              paddingHorizontal: 24,
              borderRadius: 8,
              backgroundColor: '#4285f4',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <Sparkles size={18} color="#ffffff" />
            <Text style={{
              fontSize: 16,
              fontWeight: '700',
              color: '#ffffff',
              textTransform: 'uppercase',
              ...(Platform.OS === 'web' && {
                fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }),
            }}>
              Start tracking
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Analytics Panel */}
        <View style={{
          padding: 16,
          backgroundColor: colors.card || '#ffffff',
          borderRadius: 12,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: colors.border || '#e5e7eb',
        }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
                Total Activities
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '600', color: colors.text }}>
                {analytics.totalActivities}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
                Years Active
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '600', color: colors.text }}>
                {analytics.yearsActive}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
                Volunteer Hours
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '600', color: colors.text }}>
                {analytics.totalVolunteerHours}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
                Leadership Roles
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '600', color: colors.text }}>
                {analytics.leadershipCount}
              </Text>
            </View>
          </View>
        </View>

        {/* View Filters */}
        <View style={{
          flexDirection: 'row',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}>
          {[
            { id: 'all', label: 'All Activities' },
            { id: 'volunteer', label: 'Volunteer Hours' },
            { id: 'leadership', label: 'Leadership' },
            { id: 'work', label: 'Work & Internships' },
            { id: 'certifications', label: 'Certifications' },
          ].map(view => (
            <TouchableOpacity
              key={view.id}
              onPress={() => setActiveView(view.id)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 6,
                backgroundColor: activeView === view.id 
                  ? (colors.indigo || '#4285f4')
                  : 'transparent',
                borderWidth: 1,
                borderColor: activeView === view.id
                  ? (colors.indigo || '#4285f4')
                  : (colors.border || '#e5e7eb'),
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '500',
                color: activeView === view.id
                  ? '#ffffff'
                  : (colors.text || '#000000'),
              }}>
                {view.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Activities List */}
        {filteredActivities.length === 0 ? (
          <View style={{
            padding: 32,
            alignItems: 'center',
            backgroundColor: colors.card || '#ffffff',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border || '#e5e7eb',
          }}>
            <Text style={{
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 16,
            }}>
              No {activeView !== 'all' ? activeView : ''} activities yet.
            </Text>
            <TouchableOpacity
              onPress={() => setShowAddActivityModal(true)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.border || '#e5e7eb',
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '500',
                color: colors.text || '#000000',
              }}>
                Add Activity
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {filteredActivities.map(activity => (
              <View
                key={activity.id}
                style={{
                  padding: 16,
                  backgroundColor: colors.card || '#ffffff',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border || '#e5e7eb',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: colors.text,
                      marginBottom: 4,
                    }}>
                      {activity.name}
                    </Text>
                    <Text style={{
                      fontSize: 13,
                      color: colors.textSecondary,
                      marginBottom: 4,
                    }}>
                      {activity.category}
                    </Text>
                    {activity.organization && (
                      <Text style={{
                        fontSize: 13,
                        color: colors.textSecondary,
                      }}>
                        {activity.organization}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleEditActivity(activity)}
                      style={{ padding: 4 }}
                    >
                      <Edit size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteActivity(activity.id)}
                      style={{ padding: 4 }}
                    >
                      <Trash2 size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
                {activity.description && (
                  <Text style={{
                    fontSize: 13,
                    color: colors.text,
                    marginBottom: 8,
                    lineHeight: 18,
                  }}>
                    {activity.description}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                  {activity.startDate && (
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      {new Date(activity.startDate).toLocaleDateString()} - {activity.isOngoing ? 'Ongoing' : (activity.endDate ? new Date(activity.endDate).toLocaleDateString() : '')}
                    </Text>
                  )}
                  {activity.totalHours && (
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      {activity.totalHours} hours
                    </Text>
                  )}
                  {activity.hoursPerWeek && (
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      {activity.hoursPerWeek} hrs/week
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons */}
        <View style={{
          flexDirection: 'row',
          gap: 12,
          marginTop: 24,
          marginBottom: 24,
        }}>
          <TouchableOpacity
            onPress={() => {
              setEditingActivity(null);
              setActivityForm({
                name: '',
                category: '',
                organization: '',
                startDate: '',
                endDate: '',
                isOngoing: false,
                description: '',
                hoursPerWeek: '',
                totalHours: '',
                location: '',
                supervisorName: '',
                supervisorContact: '',
                proofUrl: '',
                childId: primaryChildId,
              });
              setShowAddActivityModal(true);
            }}
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border || '#e5e7eb',
              backgroundColor: 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{
              fontSize: 14,
              fontWeight: '500',
              color: colors.text || '#000000',
            }}>
              Add Activity
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowExportModal(true)}
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border || '#e5e7eb',
              backgroundColor: 'transparent',
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Download size={16} color={colors.text || '#000000'} />
            <Text style={{
              fontSize: 14,
              fontWeight: '500',
              color: colors.text || '#000000',
            }}>
              Export
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add/Edit Activity Modal */}
      <Modal
        visible={showAddActivityModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowAddActivityModal(false);
          setEditingActivity(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onPress={() => {
              setShowAddActivityModal(false);
              setEditingActivity(null);
            }}
          />
          <View
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              maxWidth: 600,
              width: '100%',
              maxHeight: '80%',
              padding: 24,
              zIndex: 1,
              flexDirection: 'column',
              ...Platform.select({
                web: {
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                },
                default: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  elevation: 8,
                },
              }),
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{
                fontSize: 20,
                fontWeight: '600',
                color: colors.text || '#000000',
              }}>
                {editingActivity ? 'Edit Activity' : 'Add Activity'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddActivityModal(false);
                  setEditingActivity(null);
                }}
                style={{ padding: 4 }}
              >
                <X size={24} color={colors.text || '#000000'} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {/* Required Fields */}
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: colors.text,
                marginBottom: 12,
              }}>
                Required
              </Text>

              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: colors.text,
                  marginBottom: 6,
                }}>
                  Activity Name <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <TextInput
                  value={activityForm.name}
                  onChangeText={(text) => setActivityForm(prev => ({ ...prev, name: text }))}
                  placeholder="e.g., Community Garden Volunteer"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    fontSize: 14,
                    color: colors.text,
                  }}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: colors.text,
                  marginBottom: 8,
                }}>
                  Category <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <View style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setActivityForm(prev => ({ ...prev, category: cat }))}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: activityForm.category === cat
                          ? '#4285f4'
                          : (colors.border || '#e5e7eb'),
                        backgroundColor: activityForm.category === cat
                          ? '#e3f2fd'
                          : 'transparent',
                      }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '500',
                        color: activityForm.category === cat
                          ? '#4285f4'
                          : (colors.text || '#000000'),
                      }}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: colors.text,
                  marginBottom: 6,
                }}>
                  Organization / Sponsor <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <TextInput
                  value={activityForm.organization}
                  onChangeText={(text) => setActivityForm(prev => ({ ...prev, organization: text }))}
                  placeholder="e.g., Local Food Bank"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    fontSize: 14,
                    color: colors.text,
                  }}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: colors.text,
                  marginBottom: 6,
                }}>
                  Start Date <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const currentDate = activityForm.startDate ? new Date(activityForm.startDate) : new Date();
                    setStartDateCalendarViewMonth(currentDate);
                    setShowStartDatePicker(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    color: activityForm.startDate ? colors.text : colors.textSecondary,
                  }}>
                    {activityForm.startDate ? fmt(activityForm.startDate) : 'Select start date'}
                  </Text>
                  <Calendar size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => setActivityForm(prev => ({ ...prev, isOngoing: !prev.isOngoing }))}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: colors.border || '#e5e7eb',
                      marginRight: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: activityForm.isOngoing ? (colors.indigo || '#4285f4') : 'transparent',
                    }}
                  >
                    {activityForm.isOngoing && (
                      <CheckCircle size={14} color="#ffffff" />
                    )}
                  </TouchableOpacity>
                  <Text style={{
                    fontSize: 13,
                    color: colors.text,
                  }}>
                    Ongoing
                  </Text>
                </View>
                {!activityForm.isOngoing && (
                  <TouchableOpacity
                    onPress={() => {
                      const currentDate = activityForm.endDate ? new Date(activityForm.endDate) : (activityForm.startDate ? new Date(activityForm.startDate) : new Date());
                      setEndDateCalendarViewMonth(currentDate);
                      setShowEndDatePicker(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderWidth: 1,
                      borderColor: colors.border || '#e5e7eb',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <Text style={{
                      fontSize: 14,
                      color: activityForm.endDate ? colors.text : colors.textSecondary,
                    }}>
                      {activityForm.endDate ? fmt(activityForm.endDate) : 'Select end date'}
                    </Text>
                    <Calendar size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Optional Fields */}
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: colors.text,
                marginTop: 24,
                marginBottom: 12,
              }}>
                Optional
              </Text>

              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: colors.text,
                  marginBottom: 6,
                }}>
                  Description
                </Text>
                <TextInput
                  value={activityForm.description}
                  onChangeText={(text) => setActivityForm(prev => ({ ...prev, description: text }))}
                  placeholder="What they actually did..."
                  multiline
                  numberOfLines={4}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    fontSize: 14,
                    color: colors.text,
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 13,
                    fontWeight: '500',
                    color: colors.text,
                    marginBottom: 6,
                  }}>
                    Hours/Week
                  </Text>
                  <TextInput
                    value={activityForm.hoursPerWeek}
                    onChangeText={(text) => setActivityForm(prev => ({ ...prev, hoursPerWeek: text }))}
                    placeholder="e.g., 5"
                    keyboardType="numeric"
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border || '#e5e7eb',
                      fontSize: 14,
                      color: colors.text,
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 13,
                    fontWeight: '500',
                    color: colors.text,
                    marginBottom: 6,
                  }}>
                    Total Hours
                  </Text>
                  <TextInput
                    value={activityForm.totalHours}
                    onChangeText={(text) => setActivityForm(prev => ({ ...prev, totalHours: text }))}
                    placeholder="e.g., 200"
                    keyboardType="numeric"
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border || '#e5e7eb',
                      fontSize: 14,
                      color: colors.text,
                    }}
                  />
                </View>
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: colors.text,
                  marginBottom: 6,
                }}>
                  Location
                </Text>
                <TextInput
                  value={activityForm.location}
                  onChangeText={(text) => setActivityForm(prev => ({ ...prev, location: text }))}
                  placeholder="Local / Remote"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    fontSize: 14,
                    color: colors.text,
                  }}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: colors.text,
                  marginBottom: 6,
                }}>
                  Supervisor / Reference
                </Text>
                <TextInput
                  value={activityForm.supervisorName}
                  onChangeText={(text) => setActivityForm(prev => ({ ...prev, supervisorName: text }))}
                  placeholder="Name"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    fontSize: 14,
                    color: colors.text,
                    marginBottom: 8,
                  }}
                />
                <TextInput
                  value={activityForm.supervisorContact}
                  onChangeText={(text) => setActivityForm(prev => ({ ...prev, supervisorContact: text }))}
                  placeholder="Contact (email/phone)"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    fontSize: 14,
                    color: colors.text,
                  }}
                />
              </View>

              <View style={{ marginBottom: 24 }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: colors.text,
                  marginBottom: 6,
                }}>
                  Proof (URL)
                </Text>
                <TextInput
                  value={activityForm.proofUrl}
                  onChangeText={(text) => setActivityForm(prev => ({ ...prev, proofUrl: text }))}
                  placeholder="Certificate, letter, screenshot URL"
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    fontSize: 14,
                    color: colors.text,
                  }}
                />
              </View>
            </ScrollView>

            {/* Fixed Footer */}
            <View style={{
              borderTopWidth: 1,
              borderTopColor: colors.border || '#e5e7eb',
              paddingTop: 16,
              marginTop: 16,
            }}>
              <TouchableOpacity
                onPress={handleSaveActivity}
                disabled={!activityForm.name || !activityForm.category || !activityForm.organization || !activityForm.startDate}
                style={{
                  paddingVertical: 14,
                  borderRadius: 8,
                  backgroundColor: (!activityForm.name || !activityForm.category || !activityForm.organization || !activityForm.startDate)
                    ? (colors.border || '#e5e7eb')
                    : (colors.indigo || '#4285f4'),
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: (!activityForm.name || !activityForm.category || !activityForm.organization || !activityForm.startDate)
                    ? (colors.textSecondary || '#9ca3af')
                    : '#ffffff',
                }}>
                  {editingActivity ? 'Save Changes' : 'Add Activity'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Start Date Calendar Picker Modal */}
      {showStartDatePicker && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showStartDatePicker}
          onRequestClose={() => setShowStartDatePicker(false)}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={1}
            onPress={() => setShowStartDatePicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                padding: 16,
                width: Platform.OS === 'web' ? 320 : '90%',
                maxWidth: 320,
                ...(Platform.OS === 'web' 
                  ? { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }
                  : {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.15,
                      shadowRadius: 12,
                      elevation: 8,
                    }
                ),
              }}
            >
              {/* Month/Year Navigation */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(startDateCalendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() - 1);
                    setStartDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronLeft size={20} color={colors.text || '#111827'} />
                </TouchableOpacity>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors.text || '#111827',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  {startDateCalendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(startDateCalendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() + 1);
                    setStartDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronRight size={20} color={colors.text || '#111827'} />
                </TouchableOpacity>
              </View>

              {/* Year Navigation */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(startDateCalendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() - 1);
                    setStartDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: colors.textSecondary || '#6b7280',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const today = new Date();
                    setStartDateCalendarViewMonth(today);
                    setActivityForm(prev => ({ ...prev, startDate: formatDateForInput(today) }));
                    setShowStartDatePicker(false);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: colors.textSecondary || '#6b7280',
                    textDecorationLine: 'underline',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(startDateCalendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() + 1);
                    setStartDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: colors.textSecondary || '#6b7280',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Year →</Text>
                </TouchableOpacity>
              </View>

              {/* Calendar Grid */}
              <View>
                {/* Day Headers */}
                <View style={{
                  flexDirection: 'row',
                  marginBottom: 8,
                }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 11,
                        color: colors.textSecondary || '#6b7280',
                        fontWeight: '500',
                      }}>{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Days */}
                {(() => {
                  const year = startDateCalendarViewMonth.getFullYear();
                  const month = startDateCalendarViewMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const startDate = new Date(firstDay);
                  startDate.setDate(startDate.getDate() - startDate.getDay());
                  
                  const days = [];
                  const currentDate = new Date(startDate);
                  
                  for (let i = 0; i < 42; i++) {
                    days.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                  }

                  return (
                    <View>
                      {[0, 1, 2, 3, 4, 5].map((week) => (
                        <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                          {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                            const isCurrentMonth = day.getMonth() === month;
                            const selectedDate = activityForm.startDate ? new Date(activityForm.startDate) : null;
                            const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString();
                            const isToday = day.toDateString() === new Date().toDateString();
                            
                            return (
                              <TouchableOpacity
                                key={idx}
                                onPress={() => {
                                  setActivityForm(prev => ({ ...prev, startDate: formatDateForInput(day) }));
                                  setShowStartDatePicker(false);
                                }}
                                style={{
                                  flex: 1,
                                  aspectRatio: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  backgroundColor: isSelected ? (colors.indigo || '#4285f4') : 'transparent',
                                  borderWidth: isToday ? 2 : 0,
                                  borderColor: isToday ? (colors.indigo || '#4285f4') : 'transparent',
                                }}
                              >
                                <Text style={{
                                  fontSize: 13,
                                  color: isSelected 
                                    ? '#FFFFFF' 
                                    : (isCurrentMonth ? (colors.text || '#111827') : (colors.textSecondary || '#9ca3af')),
                                  fontWeight: isSelected || isToday ? '600' : '400',
                                }}>
                                  {day.getDate()}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* End Date Calendar Picker Modal */}
      {showEndDatePicker && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showEndDatePicker}
          onRequestClose={() => setShowEndDatePicker(false)}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={1}
            onPress={() => setShowEndDatePicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                padding: 16,
                width: Platform.OS === 'web' ? 320 : '90%',
                maxWidth: 320,
                ...(Platform.OS === 'web' 
                  ? { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }
                  : {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.15,
                      shadowRadius: 12,
                      elevation: 8,
                    }
                ),
              }}
            >
              {/* Month/Year Navigation */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(endDateCalendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() - 1);
                    setEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronLeft size={20} color={colors.text || '#111827'} />
                </TouchableOpacity>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors.text || '#111827',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  {endDateCalendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(endDateCalendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() + 1);
                    setEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronRight size={20} color={colors.text || '#111827'} />
                </TouchableOpacity>
              </View>

              {/* Year Navigation */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(endDateCalendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() - 1);
                    setEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: colors.textSecondary || '#6b7280',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const today = new Date();
                    setEndDateCalendarViewMonth(today);
                    setActivityForm(prev => ({ ...prev, endDate: formatDateForInput(today) }));
                    setShowEndDatePicker(false);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: colors.textSecondary || '#6b7280',
                    textDecorationLine: 'underline',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(endDateCalendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() + 1);
                    setEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: colors.textSecondary || '#6b7280',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Year →</Text>
                </TouchableOpacity>
              </View>

              {/* Calendar Grid */}
              <View>
                {/* Day Headers */}
                <View style={{
                  flexDirection: 'row',
                  marginBottom: 8,
                }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 11,
                        color: colors.textSecondary || '#6b7280',
                        fontWeight: '500',
                      }}>{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Days */}
                {(() => {
                  const year = endDateCalendarViewMonth.getFullYear();
                  const month = endDateCalendarViewMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const startDate = new Date(firstDay);
                  startDate.setDate(startDate.getDate() - startDate.getDay());
                  
                  const days = [];
                  const currentDate = new Date(startDate);
                  
                  for (let i = 0; i < 42; i++) {
                    days.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                  }

                  return (
                    <View>
                      {[0, 1, 2, 3, 4, 5].map((week) => (
                        <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                          {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                            const isCurrentMonth = day.getMonth() === month;
                            const selectedDate = activityForm.endDate ? new Date(activityForm.endDate) : null;
                            const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString();
                            const isToday = day.toDateString() === new Date().toDateString();
                            
                            return (
                              <TouchableOpacity
                                key={idx}
                                onPress={() => {
                                  setActivityForm(prev => ({ ...prev, endDate: formatDateForInput(day) }));
                                  setShowEndDatePicker(false);
                                }}
                                style={{
                                  flex: 1,
                                  aspectRatio: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  backgroundColor: isSelected ? (colors.indigo || '#4285f4') : 'transparent',
                                  borderWidth: isToday ? 2 : 0,
                                  borderColor: isToday ? (colors.indigo || '#4285f4') : 'transparent',
                                }}
                              >
                                <Text style={{
                                  fontSize: 13,
                                  color: isSelected 
                                    ? '#FFFFFF' 
                                    : (isCurrentMonth ? (colors.text || '#111827') : (colors.textSecondary || '#9ca3af')),
                                  fontWeight: isSelected || isToday ? '600' : '400',
                                }}>
                                  {day.getDate()}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Export Modal */}
      <Modal
        visible={showExportModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          onPress={() => setShowExportModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 400,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: colors.text || '#000000',
              }}>
                Export Extracurriculars
              </Text>
              <TouchableOpacity
                onPress={() => setShowExportModal(false)}
                style={{ padding: 4 }}
              >
                <X size={24} color={colors.text || '#000000'} />
              </TouchableOpacity>
            </View>
            <Text style={{
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 20,
            }}>
              Choose export format:
            </Text>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  setShowExportModal(false);
                  // TODO: Implement PDF export
                  if (Platform.OS === 'web') {
                    window.alert('PDF export coming soon');
                  } else {
                    Alert.alert('Info', 'PDF export coming soon');
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                }}>
                  PDF Summary
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  setShowExportModal(false);
                  // TODO: Implement Common App export
                  if (Platform.OS === 'web') {
                    window.alert('Common App format export coming soon');
                  } else {
                    Alert.alert('Info', 'Common App format export coming soon');
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                }}>
                  Common App Format
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  setShowExportModal(false);
                  // TODO: Implement CSV export
                  if (Platform.OS === 'web') {
                    window.alert('CSV export coming soon');
                  } else {
                    Alert.alert('Info', 'CSV export coming soon');
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                }}>
                  CSV
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
  filtersContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  // Header Row Styles
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerSearchAndButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  headerSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 350,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  headerSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerSearchIconContainer: {
    padding: 4,
  },
  headerClearButton: {
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  headerNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#000000',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  headerNewButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 24,
  },
  tabBarContainer: {
    paddingHorizontal: 24,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
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
  childrenLabelContainer: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  childrenLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childrenFilterRow: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    marginBottom: 12,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  childrenFilterScroll: {
    flexGrow: 0,
  },
  childrenFilterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  childrenFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  childrenFilterChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#f0f5ff',
  },
  childrenFilterChipText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childrenFilterChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
  },
  categoryLabelContainer: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  categoryLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  categoryFilterRow: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    marginBottom: 12,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  categoryFilterScroll: {
    flexGrow: 0,
  },
  categoryFilterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
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
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: 'transparent',
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
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
  },
  filterChipAdd: {
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: colors.border || '#e5e7eb',
    backgroundColor: 'transparent',
  },
  filtersSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterLabelContainer: {
    paddingHorizontal: 0,
    paddingBottom: 8,
    paddingTop: 4,
  },
  filterSectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    ...Platform.select({
      web: {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }),
  },
  filterChipRow: {
    marginBottom: 16,
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
  filterScroll: {
    flex: 1,
    flexGrow: 1,
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  tabPlaceholder: {
    padding: 40,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: designTokens.fonts.sans,
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
  analyticsGrid2x3: {
    ...Platform.select({
      web: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '20px',
      },
      default: {
        gap: 20,
      },
    }),
  },
  analyticsCard: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  analyticsCardHeader: {
    marginBottom: 8,
  },
  analyticsCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: designTokens.fonts.display,
    }),
  },
  analyticsCardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  analyticsCardSubtitle2: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  analyticsCTA: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.indigo || '#3b82f6',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  analyticsCTAText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  coachInsightContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  coachInsightCard: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '100%',
  },
  coachInsightButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  coachInsightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachInsightText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 6,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachInsightReassuranceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  coachInsightIconContainer: {
    marginTop: 2,
    flexShrink: 0,
  },
  coachInsightReassurance: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    flex: 1,
    fontWeight: '400',
    marginTop: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachInsightSignalSource: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
    fontStyle: 'normal',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachInsightCTA: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexDirection: 'row',
    gap: 6,
  },
  coachInsightCTAIcon: {
    flexShrink: 0,
  },
  coachInsightCTAArrow: {
    flexShrink: 0,
    marginLeft: 4,
  },
  coachInsightCTAText: {
    fontSize: 13,
    color: colors.text || '#1a1a1a',
    fontWeight: '600',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  coachModalContent: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  coachModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  coachModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachModalClose: {
    padding: 4,
  },
  coachModalBody: {
    padding: 20,
  },
  coachModalSection: {
    marginBottom: 24,
  },
  coachModalSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary || '#6b7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachModalSectionText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachModalSignalList: {
    gap: 12,
  },
  coachModalSignalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  coachModalSignalBullet: {
    fontSize: 14,
    color: colors.textSecondary || '#6b7280',
    lineHeight: 20,
    marginTop: 0,
  },
  coachModalSignalItem: {
    fontSize: 14,
    color: colors.textSecondary || '#6b7280',
    lineHeight: 20,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachCategoryDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 40,
    width: '100%',
  },
  coachCategoryDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  coachCategoryDividerText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
    paddingHorizontal: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachCategoryDividerTextFaded: {
    opacity: 0.6,
  },
  coachCategoriesGrid: {
    ...Platform.select({
      web: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      },
      default: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
      },
    }),
    marginBottom: 24,
  },
  coachCategoryTile: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 120,
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  coachCategoryTileActive: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#e8f0fe',
  },
  coachCategoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 6,
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: designTokens.fonts.display,
    }),
  },
  coachCategoryDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachCategoryPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  coachCategoryPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  coachCategoryPanelTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: designTokens.fonts.display,
    }),
  },
  coachCategoryPanelClose: {
    padding: 4,
  },
  coachQuestionSection: {
    marginBottom: 0,
  },
  coachQuestionPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 0,
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachInsightBox: {
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  coachInsightBoxText: {
    fontSize: 15,
    color: '#2a2a2a',
    lineHeight: 22,
    marginBottom: 0,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachSignalSource: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 8,
    fontStyle: 'normal',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachReflection: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 0,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachTakeaway: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
    marginTop: 12,
    fontWeight: '400',
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachExpandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  coachExpandButtonText: {
    fontSize: 13,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachBackButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  coachBackButtonText: {
    fontSize: 13,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  coachLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachDeeperSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
  },
  coachDeeperTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachDeeperIntro: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  coachDeeperPrompt: {
    padding: 0,
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  coachDeeperPromptText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    textTransform: 'uppercase',
    ...Platform.select({
      web: {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }),
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
    fontWeight: '700',
    color: colors.white,
    textTransform: 'uppercase',
    ...Platform.select({
      web: {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }),
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
  thinkingContainer: {
    marginTop: 24,
    marginBottom: 24,
  },
  thinkingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  thinkingText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  askResponseEvidence: {
    marginTop: 12,
    marginBottom: 0,
  },
  askResponseEvidenceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askResponseEvidenceItem: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askResponseDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  askResponseAnswer: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginTop: 0,
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
  // Mastery & Skills Card Styles
  masteryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    overflow: 'hidden',
    width: '100%',
  },
  masteryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
  },
  masteryCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: designTokens.fonts.display,
    color: colors.text,
    textTransform: 'uppercase',
    ...Platform.select({
      web: {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }),
  },
  masteryCardSubtitle: {
    fontSize: 13,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
    marginTop: 4,
  },
  masteryCardContent: {
    padding: 20,
  },
  radarChartContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
  },
  radarChartTitle: {
    fontSize: 12,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  radarChartPlaceholder: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    backgroundColor: colors.background || '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarChartPlaceholderText: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  confidencePill: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  confidencePillText: {
    fontSize: 11,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
  },
  domainTilesRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  domainTile: {
    flex: 1,
    minWidth: 120,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    backgroundColor: colors.background || '#f9fafb',
  },
  domainTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  domainTileTitle: {
    fontSize: 13,
    fontFamily: designTokens.fonts.sans,
    color: colors.text,
    fontWeight: '500',
  },
  domainTileStatus: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    fontWeight: '600',
    marginBottom: 8,
  },
  domainTileDescription: {
    fontSize: 11,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
    marginTop: 4,
  },
  domainTileProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.border || '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  domainTileProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  momentumEngagementRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  momentumCard: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    backgroundColor: colors.background || '#f9fafb',
  },
  momentumCardTitle: {
    fontSize: 13,
    fontFamily: designTokens.fonts.sans,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 8,
  },
  momentumSparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 40,
    marginBottom: 8,
  },
  sparklineBar: {
    flex: 1,
    minHeight: 2,
    borderRadius: 2,
  },
  momentumCardValue: {
    fontSize: 13,
    fontFamily: designTokens.fonts.sans,
    color: colors.text,
    fontWeight: '500',
  },
  engagementText: {
    fontSize: 12,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
  },
  // Compliance Card Styles
  complianceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 0,
    overflow: 'hidden',
    width: '100%',
  },
  complianceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
  },
  complianceCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: designTokens.fonts.display,
    color: colors.text,
    textTransform: 'uppercase',
    ...Platform.select({
      web: {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }),
  },
  complianceCardSubtitle: {
    fontSize: 13,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
    marginTop: 4,
  },
  complianceCardContent: {
    padding: 20,
  },
  generateLogButton: {
    padding: 12,
    backgroundColor: 'transparent',
    borderRadius: 8,
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  generateLogButtonText: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    color: '#9333ea',
    fontWeight: '600',
  },
  // Learning Log Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: designTokens.fonts.display,
    color: colors.text,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScrollView: {
    flex: 1,
    padding: 20,
  },
  modalLoadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  modalLoadingText: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 14,
  },
  modalSectionsContainer: {
    gap: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  modalEmptySection: {
    padding: 12,
    backgroundColor: (colors.border || '#e5e7eb') + '20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderStyle: 'dashed',
  },
  modalEmptyText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  modalItemsContainer: {
    gap: 4,
  },
  modalItem: {
    padding: 12,
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  modalItemTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  modalItemDetail: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalItemNotes: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9ca3af',
  },
  modalGenerateButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#000000',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  modalGenerateText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  // Activity Log Card Styles
  attendanceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 0,
    overflow: 'hidden',
    width: '100%',
  },
  attendanceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
  },
  attendanceCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: designTokens.fonts.display,
    color: colors.text,
    textTransform: 'uppercase',
    ...Platform.select({
      web: {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }),
  },
  attendanceCardContent: {
    padding: 20,
  },
  attendanceLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  attendanceLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceViewAllButton: {
    padding: 12,
    backgroundColor: 'transparent',
    borderRadius: 8,
    alignItems: 'flex-end',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  attendanceViewAllText: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    color: '#9333ea',
    fontWeight: '600',
  },
  // Activity Log Modal Additional Styles
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  weeklySummaryCard: {
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  weeklySummaryHeader: {
    marginBottom: 12,
  },
  weeklySummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  weeklySummaryStats: {
    gap: 8,
    marginBottom: 12,
  },
  weeklySummaryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weeklySummaryStatText: {
    fontSize: 14,
    color: colors.text,
  },
  weeklySummaryTotal: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
  },
  weeklySummaryTotalText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  attendanceStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  attendanceDay: {
    alignItems: 'center',
    gap: 4,
  },
  attendanceDayDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceDayLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  activityEventItem: {
    padding: 12,
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  viewFullAttendanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  viewFullAttendanceText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  // Collapsed Section Styles
  collapsedSection: {
    marginTop: 16,
  },
  collapsedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  collapsedSectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  // Attendance Table Styles
  attendanceTable: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    overflow: 'hidden',
  },
  attendanceTableHeader: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: colors.background || '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  attendanceTableHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTableRow: {
    flexDirection: 'row',
    padding: 12,
  },
  attendanceTableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  attendanceTableCell: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  attendanceStatusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  // Grades and Goals Card Styles
  gradesGoalsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 0,
    overflow: 'hidden',
    width: '100%',
  },
  gradesGoalsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
  },
  gradesGoalsCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: designTokens.fonts.display,
    color: colors.text,
    textTransform: 'uppercase',
    ...Platform.select({
      web: {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }),
  },
  gradesGoalsCardSubtitle: {
    fontSize: 13,
    fontFamily: designTokens.fonts.sans,
    color: colors.textSecondary,
    marginTop: 4,
  },
  gradesGoalsCardContent: {
    padding: 20,
  },
  subjectGradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background || '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  // Homeschool ID Card Styles
  homeschoolIdContainer: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeschoolIdCard: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bfdbfe',
    padding: 16,
    maxWidth: 400,
    width: '100%',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    }),
  },
  homeschoolIdLogoContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  homeschoolIdLogo: {
    width: 200,
    height: 50,
    ...(Platform.OS === 'web' && {
      maxWidth: '100%',
    }),
  },
  homeschoolIdTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    textAlign: 'center',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdFields: {
    marginBottom: 12,
  },
  homeschoolIdFieldRow: {
    marginBottom: 8,
  },
  homeschoolIdLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdInput: {
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 6,
    padding: 6,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.background || '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdValue: {
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 6,
    backgroundColor: colors.background || '#f9fafb',
    minHeight: 30,
    justifyContent: 'center',
  },
  homeschoolIdValueText: {
    fontSize: 13,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdStateSelector: {
    maxHeight: 80,
  },
  homeschoolIdStateSelectorContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  homeschoolIdStateChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    backgroundColor: colors.background || '#ffffff',
  },
  homeschoolIdStateChipSelected: {
    backgroundColor: colors.accent || '#4285f4',
    borderColor: colors.accent || '#4285f4',
  },
  homeschoolIdStateChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdStateChipTextSelected: {
    color: '#ffffff',
  },
  homeschoolIdDisclaimer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
  },
  homeschoolIdDisclaimerText: {
    fontSize: 10,
    color: colors.textSecondary || '#6b7280',
    lineHeight: 14,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    justifyContent: 'center',
  },
  homeschoolIdButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accent || '#4285f4',
    minWidth: 100,
    alignItems: 'center',
  },
  homeschoolIdButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  // Homeschool ID Tab Styles
  homeschoolIdTabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  homeschoolIdTabContent: {
    alignItems: 'center',
    maxWidth: 500,
  },
  homeschoolIdTabTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdTabNote: {
    fontSize: 16,
    color: colors.textSecondary || '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdTabButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  homeschoolIdTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#4285f4',
  },
  homeschoolIdTabButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  // Homeschool ID Modal Styles
  homeschoolIdModalContent: {
    backgroundColor: colors.card || '#ffffff',
    borderRadius: 16,
    maxWidth: 400,
    width: 'auto',
    maxHeight: '90%',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    }),
  },
  homeschoolIdModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  homeschoolIdModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  homeschoolIdModalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.background || '#f9fafb',
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  homeschoolIdModalActionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  homeschoolIdModalClose: {
    padding: 4,
    marginLeft: 8,
  },
  homeschoolIdModalBody: {
    maxHeight: '80vh',
    padding: 16,
  },
  homeschoolIdModalFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
  },
});

// Grades and Goals Tab Component
function GradesAndGoalsTab({
  familyId,
  selectedChildren,
  children = [],
  subjects = [],
  dateRange,
}) {
  const [grades, setGrades] = useState([]);
  const [goalsData, setGoalsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchedSubjects, setFetchedSubjects] = useState([]);
  
  // Modal states
  const [showGradesList, setShowGradesList] = useState(false);
  const [gradesList, setGradesList] = useState([]);
  const [loadingGradesList, setLoadingGradesList] = useState(false);
  const [selectedSubjectForGrades, setSelectedSubjectForGrades] = useState(null);
  const [showReportCardModal, setShowReportCardModal] = useState(false);
  const [reportCardData, setReportCardData] = useState([]);
  const [loadingReportCard, setLoadingReportCard] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('Spring Term 25/26 School Year');
  const [behaviorComment, setBehaviorComment] = useState('');
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [transcriptData, setTranscriptData] = useState([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [showReportCardExportModal, setShowReportCardExportModal] = useState(false);
  const [showTranscriptExportModal, setShowTranscriptExportModal] = useState(false);
  
  const primaryChildId = selectedChildren.length > 0 ? selectedChildren[0] : null;
  const primaryChild = children.find(c => c.id === primaryChildId);
  
  // Use provided subjects or fetched subjects
  const allSubjects = subjects.length > 0 ? subjects : fetchedSubjects;

  useEffect(() => {
    if (!primaryChildId || !familyId) {
      setGrades([]);
      setGoalsData([]);
      setLoading(false);
      return;
    }
    
    const loadData = async () => {
      setLoading(true);
      try {
        // Load grades using the same logic as family screen
        console.log('[GradesAndGoalsTab] Loading grades for child:', primaryChildId, 'family:', familyId);
        
        // Load from grades table
        const { data: gradesData, error: gradesError } = await supabase
          .from('grades')
          .select(`
            id,
            child_id,
            grade,
            score,
            subject_id,
            created_at,
            subject:subject_id (id, name)
          `)
          .eq('child_id', primaryChildId)
          .eq('family_id', familyId)
          .order('created_at', { ascending: false });

        // Load from events table (grades stored directly on events)
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('id, title, child_id, child_ids, subject_id, grade, created_at, updated_at')
          .eq('family_id', familyId)
          .eq('child_id', primaryChildId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (gradesError) {
          console.warn('[GradesAndGoalsTab] Error loading grades from grades table:', gradesError);
        }
        if (eventsError) {
          console.warn('[GradesAndGoalsTab] Error loading events:', eventsError);
        }

        // Filter events to only those with grades
        const eventsWithGrades = (eventsData || []).filter(e => e.grade != null && e.grade !== '');

        // Convert events with grades to grade format
        const gradesFromEvents = eventsWithGrades.map(event => ({
          id: `event-${event.id}`,
          child_id: event.child_id,
          subject_id: event.subject_id,
          grade: event.grade,
          score: null,
          created_at: event.updated_at || event.created_at || new Date().toISOString(),
          source: 'events_table'
        }));

        // Combine grades from both sources
        const allGrades = [
          ...(gradesData || []).map(g => ({ ...g, source: 'grades_table' })),
          ...gradesFromEvents
        ];

        // Sort by created_at, most recent first
        allGrades.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        console.log('[GradesAndGoalsTab] Grades loaded:', {
          fromGradesTable: (gradesData || []).length,
          fromEvents: gradesFromEvents.length,
          total: allGrades.length
        });

        setGrades(allGrades);
        
        // If subjects weren't provided, fetch them from grades
        if (subjects.length === 0 && allGrades.length > 0) {
          const subjectIds = [...new Set(allGrades.map(g => g.subject_id).filter(Boolean))];
          if (subjectIds.length > 0) {
            try {
              const { data: subjectsData, error: subjectsError } = await supabase
                .from('subject')
                .select('id, name')
                .in('id', subjectIds);
              
              if (!subjectsError && subjectsData) {
                console.log('[GradesAndGoalsTab] Fetched subjects from grades:', subjectsData.length);
                setFetchedSubjects(subjectsData);
              }
            } catch (err) {
              console.log('[GradesAndGoalsTab] Error fetching subjects:', err);
            }
          }
        }
        
        // Load goals - handle errors gracefully
        const goals = [];
        
        // Try to load from goals table (handle errors gracefully)
        try {
          const goalsResult = await supabase
            .from('goals')
            .select('*')
            .eq('child_id', primaryChildId)
            .eq('family_id', familyId)
            .order('created_at', { ascending: false });
          
          // Check for errors (404, 400, table not found, or permission errors)
          if (goalsResult.error) {
            // Silently handle table not found (42P01), permission errors (PGRST301), or HTTP errors
            const isTableNotFound = goalsResult.error.code === '42P01' || 
                                   goalsResult.error.message?.includes('does not exist') ||
                                   goalsResult.error.status === 404 || 
                                   goalsResult.error.status === 400;
            if (!isTableNotFound && goalsResult.error.code !== 'PGRST301') {
              console.log('[GradesAndGoalsTab] Error loading goals:', goalsResult.error);
            }
          } else if (goalsResult.data) {
            goals.push(...goalsResult.data.map(g => ({
              ...g,
              source: 'goals_table'
            })));
          }
        } catch (err) {
          // Table might not exist - silently continue
          // Check if it's a "table does not exist" error
          const isTableNotFound = err.code === '42P01' || 
                                 err.message?.includes('does not exist');
          if (!isTableNotFound) {
            console.log('[GradesAndGoalsTab] Goals table not available:', err);
          }
        }
        
        // Try to load from subject_goals table (handle errors gracefully)
        try {
          const subjectGoalsResult = await supabase
            .from('subject_goals')
            .select('*')
            .eq('child_id', primaryChildId)
            .eq('is_active', true)
            .order('priority', { ascending: false });
          
          // Check for errors (404, 400, table not found, or permission errors)
          if (subjectGoalsResult.error) {
            // Silently handle table not found (42P01), permission errors (PGRST301), or HTTP errors
            const isTableNotFound = subjectGoalsResult.error.code === '42P01' || 
                                   subjectGoalsResult.error.message?.includes('does not exist') ||
                                   subjectGoalsResult.error.status === 404 || 
                                   subjectGoalsResult.error.status === 400;
            if (!isTableNotFound && subjectGoalsResult.error.code !== 'PGRST301') {
              console.log('[GradesAndGoalsTab] Error loading subject goals:', subjectGoalsResult.error);
            }
          } else if (subjectGoalsResult.data) {
            // Fetch subject names separately
            const subjectIds = [...new Set(subjectGoalsResult.data.map(sg => sg.subject_id).filter(Boolean))];
            let subjectMap = new Map();
            
            if (subjectIds.length > 0) {
              try {
                const { data: subjectsData, error: subjectsError } = await supabase
                  .from('subject')
                  .select('id, name')
                  .in('id', subjectIds);
                
                if (!subjectsError && subjectsData) {
                  subjectsData.forEach(subject => {
                    subjectMap.set(subject.id, subject);
                  });
                }
              } catch (err) {
                console.log('[GradesAndGoalsTab] Error fetching subjects for goals:', err);
              }
            }
            
            // Add goals from subject_goals table (convert to goals format)
            goals.push(...subjectGoalsResult.data.map(sg => {
              const subject = subjectMap.get(sg.subject_id);
              return {
                id: sg.id,
                child_id: sg.child_id,
                subject_id: sg.subject_id,
                title: `${subject?.name || 'Subject'} - ${sg.minutes_per_week || 0} min/week`,
                description: `Weekly goal: ${sg.minutes_per_week || 0} minutes`,
                target_date: null,
                created_at: sg.created_at,
                source: 'subject_goals_table'
              };
            }));
          }
        } catch (err) {
          // Table might not exist - silently continue
          // Check if it's a "table does not exist" error
          const isTableNotFound = err.code === '42P01' || 
                                 err.message?.includes('does not exist');
          if (!isTableNotFound) {
            console.log('[GradesAndGoalsTab] Subject goals table not available:', err);
          }
        }
        
        setGoalsData(goals);
        console.log('[GradesAndGoalsTab] Goals loaded:', goals.length);
      } catch (err) {
        console.error('[GradesAndGoalsTab] Error loading data:', err);
        setGrades([]);
        setGoalsData([]);
      } finally {
        setLoading(false);
        console.log('[GradesAndGoalsTab] Loading complete');
      }
    };
    
    loadData();
  }, [primaryChildId, familyId]);

  // Handle opening grades modal for a subject
  const handleOpenGrades = async (subject) => {
    if (!subject || !subject.id || !primaryChildId) return;
    
    setSelectedSubjectForGrades(subject);
    setLoadingGradesList(true);
    
    try {
      // Fetch grades from both sources (same as loadData)
      const { data: gradesData } = await supabase
        .from('grades')
        .select(`
          id,
          child_id,
          subject_id,
          grade,
          score,
          created_at,
          assignment_id,
          assignments!assignment_id (id, title)
        `)
        .eq('child_id', primaryChildId)
        .eq('subject_id', subject.id)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });
      
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, title, event_type, start_ts, end_ts, child_id, child_ids, grade, unit, percent_of_total_grade, created_at, updated_at')
        .eq('subject_id', subject.id)
        .eq('family_id', familyId)
        .is('deleted_at', null);
      
      // Filter events to only those that belong to the selected child
      const relevantEvents = (eventsData || []).filter(event => {
        const hasChildIdMatch = event.child_id && event.child_id === primaryChildId;
        const hasChildIdsMatch = event.child_ids && Array.isArray(event.child_ids) && 
          event.child_ids.includes(primaryChildId);
        return hasChildIdMatch || hasChildIdsMatch;
      });
      
      // Convert events to grade format
      const assignmentsFromEvents = relevantEvents.map(event => {
        const hasGrade = !!event.grade;
        const dueDate = event.end_ts || event.start_ts;
        const formattedDueDate = dueDate 
          ? new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : null;
        
        return {
          id: `event-${event.id}`,
          child_id: event.child_id || primaryChildId,
          subject_id: subject.id,
          grade: event.grade || null,
          isUngraded: !hasGrade,
          dueDate: dueDate,
          formattedDueDate: formattedDueDate,
          percent_of_total_grade: event.percent_of_total_grade || null,
          notes: event.unit || null,
          created_at: event.updated_at || event.created_at || new Date().toISOString(),
          source: 'events_table',
          event: event,
          event_title: event.title || null,
          event_type: event.event_type || null
        };
      });
      
      // Combine all grades
      const allAssignments = [
        ...(gradesData || []).map(g => ({ ...g, source: 'grades_table', assignment: g.assignments })),
        ...assignmentsFromEvents
      ].sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate) : new Date(a.created_at);
        const dateB = b.dueDate ? new Date(b.dueDate) : new Date(b.created_at);
        return dateB - dateA;
      });
      
      setGradesList(allAssignments);
      setShowGradesList(true);
    } catch (error) {
      console.error('[GradesAndGoalsTab] Error in handleOpenGrades:', error);
      setGradesList([]);
      setShowGradesList(true);
    } finally {
      setLoadingGradesList(false);
    }
  };

  // Load report card data
  const loadReportCardData = async () => {
    if (!primaryChildId || !familyId || !selectedTerm) return;
    
    setLoadingReportCard(true);
    try {
      // Use the same grade conversion functions
      const gradeToNumeric = (grade) => {
        if (!grade) return null;
        if (typeof grade === 'number') return grade;
        if (typeof grade === 'string') {
          const percentMatch = grade.match(/(\d+(?:\.\d+)?)%/);
          if (percentMatch) return parseFloat(percentMatch[1]);
          const letterGrade = grade.toUpperCase().trim();
          if (letterGrade === 'A' || letterGrade === 'A+') return 95;
          if (letterGrade === 'A-') return 90;
          if (letterGrade === 'B' || letterGrade === 'B+') return 85;
          if (letterGrade === 'B-') return 80;
          if (letterGrade === 'C' || letterGrade === 'C+') return 75;
          if (letterGrade === 'C-') return 70;
          if (letterGrade === 'D' || letterGrade === 'D+') return 65;
          if (letterGrade === 'D-') return 60;
          if (letterGrade === 'F') return 55;
          const num = parseFloat(grade);
          if (!isNaN(num)) return num;
        }
        return null;
      };

      const numericToLetterGrade = (numeric) => {
        if (numeric === null || numeric === undefined || isNaN(numeric)) return null;
        if (numeric >= 97) return 'A+';
        if (numeric >= 93) return 'A';
        if (numeric >= 90) return 'A-';
        if (numeric >= 87) return 'B+';
        if (numeric >= 83) return 'B';
        if (numeric >= 80) return 'B-';
        if (numeric >= 77) return 'C+';
        if (numeric >= 73) return 'C';
        if (numeric >= 70) return 'C-';
        if (numeric >= 67) return 'D+';
        if (numeric >= 63) return 'D';
        if (numeric >= 60) return 'D-';
        return 'F';
      };

      // Load grades (same as loadData)
      const { data: gradesData } = await supabase
        .from('grades')
        .select('id, subject_id, term_label, score, grade, created_at, subject:subject_id (id, name)')
        .eq('child_id', primaryChildId)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });

      const { data: eventsData } = await supabase
        .from('events')
        .select('id, title, child_id, subject_id, grade, created_at, updated_at')
        .eq('family_id', familyId)
        .eq('child_id', primaryChildId)
        .not('grade', 'is', null)
        .neq('grade', '')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Filter by term
      const filteredGradesTable = (gradesData || []).filter(grade => {
        if (grade.term_label === selectedTerm) return true;
        return false;
      });

      const gradesFromEvents = (eventsData || []).map(event => ({
        id: `event-${event.id}`,
        child_id: event.child_id,
        subject_id: event.subject_id,
        grade: event.grade,
        score: null,
        created_at: event.updated_at || event.created_at || new Date().toISOString(),
        source: 'events_table'
      }));

      const allGrades = [
        ...filteredGradesTable.map(g => ({ ...g, source: 'grades_table' })),
        ...gradesFromEvents
      ];

      // Group by subject and calculate average
      const subjectAverages = {};
      const subjectIds = [...new Set(allGrades.map(g => g.subject_id).filter(Boolean))];
      
      subjectIds.forEach(subjectId => {
        const subjectGrades = allGrades.filter(g => String(g.subject_id || '') === String(subjectId || ''));
        if (subjectGrades.length === 0) return;

        const numericGrades = subjectGrades.map(g => {
          const num = gradeToNumeric(g.grade) || gradeToNumeric(g.score);
          return num;
        }).filter(n => n !== null);

        if (numericGrades.length === 0) {
          const sorted = subjectGrades.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          subjectAverages[subjectId] = sorted[0].grade || sorted[0].score || null;
        } else {
          const average = numericGrades.reduce((sum, n) => sum + n, 0) / numericGrades.length;
          subjectAverages[subjectId] = numericToLetterGrade(average);
        }
      });

      // Use the same subjects as the subjects row (already filtered and deduplicated)
      // This ensures consistency between the subjects row and the report card
      const subjectsToShow = allSubjects || [];

      // Format for display - include ALL subjects, even if ungraded
      const formattedGrades = subjectsToShow.map(subject => {
        const subjectId = subject.id;
        const averageGrade = subjectAverages[subjectId];
        
        return {
          id: `subject-${subjectId}`,
          subjectId,
          subjectName: subject.name || 'Unknown Subject',
          grade: averageGrade || 'Ungraded',
        };
      });

      // Sort: subjects with grades first, then ungraded
      formattedGrades.sort((a, b) => {
        const aHasGrade = a.grade !== 'Ungraded' && a.grade !== '-';
        const bHasGrade = b.grade !== 'Ungraded' && b.grade !== '-';
        if (aHasGrade && !bHasGrade) return -1;
        if (!aHasGrade && bHasGrade) return 1;
        return a.subjectName.localeCompare(b.subjectName);
      });

      setReportCardData(formattedGrades);

      // Load behavior comment if it exists (stored in localStorage for now)
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const savedComment = localStorage.getItem(`report_card_comment_${primaryChildId}_${selectedTerm}`);
        if (savedComment) {
          setBehaviorComment(savedComment);
        } else {
          setBehaviorComment('');
        }
      }
    } catch (error) {
      console.error('[GradesAndGoalsTab] Error loading report card data:', error);
      setReportCardData([]);
    } finally {
      setLoadingReportCard(false);
    }
  };

  // Save behavior comment
  const saveBehaviorComment = () => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined' && primaryChildId) {
      localStorage.setItem(`report_card_comment_${primaryChildId}_${selectedTerm}`, behaviorComment);
      Alert.alert('Success', 'Behavior comment saved.');
    }
  };

  // Load transcript data - use same subjects and grades as the main tab
  const loadTranscriptData = async () => {
    if (!primaryChildId || !familyId) return;
    
    setLoadingTranscript(true);
    try {
      // Use the same subjects that are used for the subject grade list
      // Get all subjects the child has ever taken (same logic as allChildSubjects)
      const subjectsToUse = allSubjects.length > 0 ? allSubjects : fetchedSubjects;
      
      if (subjectsToUse.length === 0) {
        setTranscriptData([]);
        setLoadingTranscript(false);
        return;
      }

      // Load events to get date ranges and term labels
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, subject_id, start_ts, end_ts, grade, term_label')
        .eq('family_id', familyId)
        .eq('child_id', primaryChildId)
        .not('subject_id', 'is', null)
        .is('deleted_at', null)
        .order('start_ts', { ascending: true });

      // Build transcript entries from subjects (same as subject grade list)
      const transcriptEntries = [];
      
      subjectsToUse.forEach(subject => {
        // Get all events for this subject
        const subjectEvents = (eventsData || []).filter(e => String(e.subject_id) === String(subject.id));
        
        // Get all grades for this subject (from the already-loaded grades state)
        const subjectGrades = grades.filter(g => String(g.subject_id || '') === String(subject.id || ''));
        
        // Get term from events or default
        const termEvents = subjectEvents.filter(e => e.term_label);
        const term = termEvents.length > 0 
          ? termEvents[0].term_label 
          : 'Spring Term 25/26 School Year';
        
        // Calculate date range from events
        let startDate = null;
        let endDate = null;
        
        subjectEvents.forEach(event => {
          if (event.start_ts) {
            const eventStart = new Date(event.start_ts);
            if (!startDate || eventStart < startDate) {
              startDate = eventStart;
            }
          }
          if (event.end_ts) {
            const eventEnd = new Date(event.end_ts);
            if (!endDate || eventEnd > endDate) {
              endDate = eventEnd;
            }
          } else if (event.start_ts) {
            const eventStart = new Date(event.start_ts);
            if (!endDate || eventStart > endDate) {
              endDate = eventStart;
            }
          }
        });
        
        // Get latest grade (same logic as getLatestGrade)
        let finalGrade = null;
        if (subjectGrades.length > 0) {
          // Sort by created_at and get latest
          const sortedGrades = [...subjectGrades].sort((a, b) => {
            const dateA = new Date(a.created_at || 0);
            const dateB = new Date(b.created_at || 0);
            return dateB - dateA;
          });
          finalGrade = sortedGrades[0].grade || sortedGrades[0].score;
        }
        
        // Format date range
        let dateRange = '';
        if (startDate && endDate) {
          const startStr = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          const endStr = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          dateRange = `${startStr} - ${endStr}`;
        } else if (startDate) {
          dateRange = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
        
        transcriptEntries.push({
          term,
          dateRange,
          subjectName: subject.name,
          grade: finalGrade,
        });
      });

      // Group entries by term
      const groupedByTerm = {};
      transcriptEntries.forEach(entry => {
        if (!groupedByTerm[entry.term]) {
          groupedByTerm[entry.term] = {
            term: entry.term,
            dateRange: entry.dateRange, // Use first date range found for the term
            subjects: []
          };
        }
        groupedByTerm[entry.term].subjects.push({
          subjectName: entry.subjectName,
          grade: entry.grade,
          dateRange: entry.dateRange
        });
      });

      // Convert to array and sort subjects within each term
      const groupedEntries = Object.values(groupedByTerm).map(group => ({
        ...group,
        subjects: group.subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName))
      }));

      // Sort by term name
      groupedEntries.sort((a, b) => a.term.localeCompare(b.term));

      setTranscriptData(groupedEntries);
    } catch (error) {
      console.error('[GradesAndGoalsTab] Error loading transcript data:', error);
      setTranscriptData([]);
    } finally {
      setLoadingTranscript(false);
    }
  };

  // Reload transcript when grades or subjects change
  useEffect(() => {
    if (showTranscriptModal && !loading && grades.length >= 0 && allSubjects.length >= 0) {
      loadTranscriptData();
    }
  }, [showTranscriptModal, loading, grades.length, allSubjects.length]);

  if (!primaryChildId || !primaryChild) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          icon={GraduationCap}
          title="No child selected"
          description="Select a child from the filters above to view grades and goals"
          size="default"
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.tabContent}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.indigo} />
          <Text style={styles.loadingText}>Loading grades and goals...</Text>
        </View>
      </View>
    );
  }

  // Helper function to convert grade to numeric
  const gradeToNumeric = (grade) => {
    if (!grade) return null;
    if (typeof grade === 'number') return grade;
    if (typeof grade === 'string') {
      // Try to parse percentage (e.g., "85%")
      const percentMatch = grade.match(/(\d+(?:\.\d+)?)%/);
      if (percentMatch) return parseFloat(percentMatch[1]);
      // Try to parse letter grade (A=95, B=85, C=75, D=65, F=55)
      const letterGrade = grade.toUpperCase().trim();
      if (letterGrade === 'A' || letterGrade === 'A+') return 95;
      if (letterGrade === 'A-') return 90;
      if (letterGrade === 'B' || letterGrade === 'B+') return 85;
      if (letterGrade === 'B-') return 80;
      if (letterGrade === 'C' || letterGrade === 'C+') return 75;
      if (letterGrade === 'C-') return 70;
      if (letterGrade === 'D' || letterGrade === 'D+') return 65;
      if (letterGrade === 'D-') return 60;
      if (letterGrade === 'F') return 55;
      // Try to parse as number
      const num = parseFloat(grade);
      if (!isNaN(num)) return num;
    }
    return null;
  };

  // Convert numeric grade back to letter grade
  const numericToLetterGrade = (numeric) => {
    if (numeric === null || numeric === undefined || isNaN(numeric)) return null;
    if (numeric >= 97) return 'A+';
    if (numeric >= 93) return 'A';
    if (numeric >= 90) return 'A-';
    if (numeric >= 87) return 'B+';
    if (numeric >= 83) return 'B';
    if (numeric >= 80) return 'B-';
    if (numeric >= 77) return 'C+';
    if (numeric >= 73) return 'C';
    if (numeric >= 70) return 'C-';
    if (numeric >= 67) return 'D+';
    if (numeric >= 63) return 'D';
    if (numeric >= 60) return 'D-';
    return 'F';
  };

  // Calculate trend for each subject
  const getSubjectTrend = (subjectId) => {
    const subjectIdStr = String(subjectId || '');
    const subjectGrades = grades
      .filter(g => String(g.subject_id || '') === subjectIdStr)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)); // Most recent first
    
    if (subjectGrades.length < 2) return null;
    
    // Get last 3-5 grades for trend calculation
    const recentGrades = subjectGrades.slice(0, Math.min(5, subjectGrades.length));
    const numericGrades = recentGrades.map(g => {
      const num = gradeToNumeric(g.grade) || gradeToNumeric(g.score);
      return num;
    }).filter(n => n !== null);
    
    if (numericGrades.length < 2) return null;
    
    // Calculate average of first half vs second half
    const midPoint = Math.floor(numericGrades.length / 2);
    const recentAvg = numericGrades.slice(0, midPoint).reduce((sum, n) => sum + n, 0) / midPoint;
    const olderAvg = numericGrades.slice(midPoint).reduce((sum, n) => sum + n, 0) / (numericGrades.length - midPoint);
    
    const diff = recentAvg - olderAvg;
    if (diff > 3) return 'improving';
    if (diff < -3) return 'declining';
    return 'stable';
  };

  // Calculate overall average grade for subject
  const getLatestGrade = (subjectId) => {
    const subjectIdStr = String(subjectId || '');
    const subjectGrades = grades.filter(g => String(g.subject_id || '') === subjectIdStr);
    
    if (subjectGrades.length === 0) return null;
    
    // Convert all grades to numeric values
    const numericGrades = subjectGrades.map(g => {
      const num = gradeToNumeric(g.grade) || gradeToNumeric(g.score);
      return num;
    }).filter(n => n !== null);
    
    if (numericGrades.length === 0) {
      // If no numeric grades, return the most recent grade as-is
      const sorted = subjectGrades.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return sorted[0].grade || sorted[0].score || null;
    }
    
    // Calculate average
    const average = numericGrades.reduce((sum, n) => sum + n, 0) / numericGrades.length;
    
    // Convert back to letter grade
    return numericToLetterGrade(average);
  };

  // Calculate overall average across all subjects for the child
  const calculateChildOverallAverage = () => {
    if (subjectsWithGrades.length === 0) return null;
    
    // Get all numeric grades across all subjects
    const allNumericGrades = [];
    
    subjectsWithGrades.forEach(subject => {
      const subjectGrades = grades.filter(g => String(g.subject_id || '') === String(subject.id || ''));
      const numericGrades = subjectGrades.map(g => {
        const num = gradeToNumeric(g.grade) || gradeToNumeric(g.score);
        return num;
      }).filter(n => n !== null);
      
      if (numericGrades.length > 0) {
        // Calculate average for this subject
        const subjectAvg = numericGrades.reduce((sum, n) => sum + n, 0) / numericGrades.length;
        allNumericGrades.push(subjectAvg);
      }
    });
    
    if (allNumericGrades.length === 0) return null;
    
    // Calculate overall average across all subjects
    const overallAvg = allNumericGrades.reduce((sum, n) => sum + n, 0) / allNumericGrades.length;
    
    // Convert to letter grade
    return numericToLetterGrade(overallAvg);
  };

  // Get all subjects for the child (not just those with grades)
  // Sort: subjects with grades first (by most recent grade), then subjects without grades (alphabetically)
  const allChildSubjects = allSubjects.sort((a, b) => {
    const aGrades = grades.filter(g => String(g.subject_id || '') === String(a.id || ''));
    const bGrades = grades.filter(g => String(g.subject_id || '') === String(b.id || ''));
    
    // If both have grades, sort by most recent
    if (aGrades.length > 0 && bGrades.length > 0) {
      const aLatest = new Date(aGrades[0]?.created_at || 0);
      const bLatest = new Date(bGrades[0]?.created_at || 0);
      return bLatest - aLatest;
    }
    
    // Subjects with grades come first
    if (aGrades.length > 0 && bGrades.length === 0) return -1;
    if (aGrades.length === 0 && bGrades.length > 0) return 1;
    
    // If both have no grades, sort alphabetically
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  // Keep subjectsWithGrades for overall average calculation (only subjects with grades)
  const subjectsWithGrades = allChildSubjects.filter(subj => {
    return grades.some(g => {
      const gradeSubjectId = String(g.subject_id || '');
      const subjectId = String(subj.id || '');
      return gradeSubjectId === subjectId;
    });
  });

  const childOverallAverage = calculateChildOverallAverage();
  const childGoals = goalsData.filter(g => g.child_id === primaryChildId);

  console.log('[GradesAndGoalsTab] Render state:', {
    loading,
    gradesCount: grades.length,
    subjectsCount: subjects.length,
    subjectsWithGradesCount: subjectsWithGrades.length,
    goalsCount: childGoals.length,
    primaryChildId,
    primaryChildName: primaryChild?.first_name || primaryChild?.name
  });

  return (
    <View style={styles.tabContent}>
      <View style={styles.gradesGoalsCard}>
        <View style={styles.gradesGoalsCardContent}>
          {/* Term Header */}
          <Text style={{
            fontSize: 18,
            fontWeight: '600',
            color: colors.text,
            marginBottom: 16,
            ...(Platform.OS === 'web' && {
              fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }),
          }}>
            Spring Term · 25/26 School Year
          </Text>

          {allChildSubjects.length === 0 && childGoals.length === 0 ? (
            <Text style={{ 
              fontSize: 12, 
              color: colors.textSecondary, 
              textAlign: 'center', 
              padding: 16,
              ...(Platform.OS === 'web' && {
                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }),
            }}>
              No grades or goals yet. Add grades to track progress.
            </Text>
          ) : (
            <View style={{ gap: 16 }}>
              {/* Child Overall Average */}
              {childOverallAverage && subjectsWithGrades.length > 0 && (
                <View style={{
                  padding: 16,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: colors.text || '#000',
                  backgroundColor: 'transparent',
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ 
                      fontSize: 14, 
                      fontWeight: '600', 
                      color: colors.text,
                      ...(Platform.OS === 'web' && {
                        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }),
                    }}>
                      Overall Average Across All Subjects:
                    </Text>
                    <Text style={{ 
                      fontSize: 16, 
                      fontWeight: '700', 
                      color: colors.text,
                      ...(Platform.OS === 'web' && {
                        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }),
                    }}>
                      {childOverallAverage}
                    </Text>
                  </View>
                </View>
              )}

              {/* Note about average calculations */}
              {(allChildSubjects.length > 0 || childGoals.length > 0) && (
                <View>
                  <Text style={{
                    fontSize: 11,
                    color: colors.textSecondary || '#6b7280',
                    fontStyle: 'italic',
                    lineHeight: 16,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>
                    Note: Subject overall averages and child overall averages are calculated by averaging all numeric grades for that subject/child and converting to a letter grade.
                  </Text>
                </View>
              )}

              {/* Report Card and Transcript Buttons */}
              <View style={{
                flexDirection: 'row',
                gap: 12,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    setShowReportCardModal(true);
                    loadReportCardData();
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    backgroundColor: 'transparent',
                    alignItems: 'center',
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: colors.text || '#000000',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>
                    Report Card
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setShowTranscriptModal(true);
                    loadTranscriptData();
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border || '#e5e7eb',
                    backgroundColor: 'transparent',
                    alignItems: 'center',
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: colors.text || '#000000',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>
                    Transcript
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Grades by subject */}
              {allChildSubjects.map((subject) => {
                const latestGrade = getLatestGrade(subject.id);
                const trend = getSubjectTrend(subject.id);
                const trendArrow = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : null;
                const hasGrades = latestGrade !== null;

                return (
                  <TouchableOpacity
                    key={subject.id}
                    style={{
                      padding: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border || '#e5e7eb',
                      backgroundColor: 'transparent'
                    }}
                    activeOpacity={0.7}
                    onPress={() => handleOpenGrades(subject)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ 
                          fontSize: 14, 
                          fontWeight: '500', 
                          color: colors.text,
                          ...(Platform.OS === 'web' && {
                            fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          }),
                        }}>
                          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>Subject: </Text>
                          <Text style={{ fontWeight: '700' }}>{subject.name}</Text>
                          {hasGrades ? (
                            <>
                              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>{' · Overall average: '}</Text>
                              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{latestGrade}</Text>
                            </>
                          ) : (
                            <>
                              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>{' · Overall average: '}</Text>
                              <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary }}>Ungraded</Text>
                            </>
                          )}
                          {hasGrades && trendArrow && (
                            <Text style={{ fontSize: 13, color: trend === 'improving' ? '#10B981' : '#EF4444', marginLeft: 6, fontWeight: '500' }}>
                              {' '}Status: {trendArrow} {trend === 'improving' ? 'Improving' : 'Needs attention'}
                            </Text>
                          )}
                          {hasGrades && !trendArrow && (
                            <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6, fontWeight: '500' }}>
                              {' '}Status: On track
                            </Text>
                          )}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Goals */}
              {childGoals.length > 0 && (
                <>
                  {allChildSubjects.length > 0 && (
                    <View style={{ height: 1, backgroundColor: colors.border || '#e5e7eb', marginVertical: 8 }} />
                  )}
                  {childGoals.slice(0, 3).map((goal, idx) => {
                    const goalSubject = allSubjects.find(s => s.id === goal.subject_id);
                    const goalText = goal.title || goal.description || 'Goal';
                    const goalDate = goal.target_date ? new Date(goal.target_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
                    
                    // Determine if goal is on track (simplified - would check actual progress)
                    const isOnTrack = true; // TODO: Calculate based on progress

                    return (
                      <TouchableOpacity
                        key={goal.id || idx}
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border || '#e5e7eb',
                          backgroundColor: 'transparent'
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ 
                              fontSize: 14, 
                              fontWeight: '500', 
                              color: colors.text,
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}>
                              {goalSubject ? goalSubject.name : 'General'} · Goal: {goalText} {goalDate && `by ${goalDate}`}
                              {isOnTrack && (
                                <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 4, fontWeight: '500' }}>
                                  {' '}On track
                                </Text>
                              )}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Subject Grades Modal */}
      {showGradesList && (
        <Modal
          visible={showGradesList}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowGradesList(false);
            setSelectedSubjectForGrades(null);
          }}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}>
            <TouchableOpacity
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              activeOpacity={1}
              onPress={() => {
                setShowGradesList(false);
                setSelectedSubjectForGrades(null);
              }}
            />
            {loadingGradesList ? (
              <View style={{
                backgroundColor: colors.card || '#ffffff',
                borderRadius: 12,
                padding: 32,
                alignItems: 'center',
                maxWidth: 480,
                width: '100%',
              }}>
                <ActivityIndicator size="large" color={colors.indigo} />
                <Text style={{ marginTop: 16, color: colors.textSecondary }}>Loading grades...</Text>
              </View>
            ) : gradesList.length === 0 ? (
              <View style={{
                backgroundColor: colors.card || '#ffffff',
                borderRadius: 12,
                padding: 32,
                maxWidth: 480,
                width: '100%',
              }}>
                <TouchableOpacity
                  style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}
                  onPress={() => {
                    setShowGradesList(false);
                    setSelectedSubjectForGrades(null);
                  }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: colors.text,
                  textAlign: 'center',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  {selectedSubjectForGrades 
                    ? `NO GRADES FOUND FOR ${selectedSubjectForGrades.name.toUpperCase()}.`
                    : 'NO GRADES FOUND.'}
                </Text>
                <Text style={{
                  fontSize: 12,
                  color: colors.textSecondary,
                  textAlign: 'center',
                }}>
                  Add a grade to track progress for this subject.
                </Text>
              </View>
            ) : (
              <View style={{
                backgroundColor: colors.card || '#ffffff',
                borderRadius: 12,
                maxWidth: 480,
                width: '100%',
                maxHeight: '80%',
              }}>
                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 20,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border || '#e5e7eb',
                }}>
                  <Text style={{
                    fontSize: 20,
                    fontWeight: '700',
                    fontFamily: designTokens.fonts.display,
                    color: colors.text,
                  }}>
                    {selectedSubjectForGrades ? `${selectedSubjectForGrades.name} Grades` : 'Grades'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowGradesList(false);
                      setSelectedSubjectForGrades(null);
                    }}
                    style={{ padding: 4 }}
                  >
                    <X size={24} color={colors.text || '#000000'} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ flex: 1, padding: 20 }}>
                  {gradesList.map((gradeItem, index) => {
                    const dateString = gradeItem.created_at 
                      ? new Date(gradeItem.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      : null;
                    const isFromEvent = gradeItem.source === 'events_table';
                    const title = isFromEvent 
                      ? (gradeItem.event_title || gradeItem.event?.title || null)
                      : (gradeItem.assignment?.title || null);
                    const childId = gradeItem.child_id || primaryChildId;
                    const child = childId ? children.find(c => c.id === childId) : null;
                    const childName = child ? (child.first_name || child.name || 'Child') : null;
                    
                    return (
                      <View
                        key={gradeItem.id || index}
                        style={{
                          padding: 16,
                          borderBottomWidth: index < gradesList.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border || '#e5e7eb',
                        }}
                      >
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: childName ? 8 : 0 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '500',
                                  color: colors.text,
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }}>
                                  {title || 'Untitled'}
                                </Text>
                                {dateString && (
                                  <Text style={{
                                    fontSize: 13,
                                    color: colors.textSecondary,
                                    marginTop: 4,
                                    ...(Platform.OS === 'web' && {
                                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                    }),
                                  }}>
                                    {dateString}
                                  </Text>
                                )}
                              </View>
                              <View style={{ alignItems: 'flex-end', marginLeft: 16 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '600',
                                  color: colors.text,
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }}>
                                  {gradeItem.isUngraded 
                                    ? (gradeItem.formattedDueDate ? `Ungraded, due ${gradeItem.formattedDueDate}` : 'Ungraded')
                                    : (gradeItem.grade || 'No Grade')}
                                </Text>
                                {gradeItem.percent_of_total_grade && (
                                  <Text style={{
                                    fontSize: 13,
                                    color: colors.textSecondary,
                                    marginTop: 4,
                                    ...(Platform.OS === 'web' && {
                                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                    }),
                                  }}>
                                    {gradeItem.percent_of_total_grade}% of total grade
                                  </Text>
                                )}
                              </View>
                            </View>
                            {childName && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {child && (
                                  <View style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 4,
                                    backgroundColor: getChildColorFromAvatar(child.avatar),
                                  }} />
                                )}
                                <Text style={{
                                  fontSize: 13,
                                  color: colors.textSecondary,
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }}>
                                  {childName}
                                </Text>
                              </View>
                            )}
                          </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* Report Card Modal */}
      <Modal
        visible={showReportCardModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowReportCardModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          onPress={() => setShowReportCardModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              maxWidth: 600,
              width: '100%',
              maxHeight: '85vh',
              ...Platform.select({
                web: {
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                },
                default: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  elevation: 8,
                },
              }),
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Close Button */}
            <TouchableOpacity
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#f3f4f6',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
              onPress={() => setShowReportCardModal(false)}
              accessibilityLabel="Close modal"
              accessibilityRole="button"
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>

            <ScrollView 
              style={{ flex: 1, backgroundColor: '#ffffff' }}
              contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 24 }}
              showsVerticalScrollIndicator={true}
            >
              {loadingReportCard ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.indigo} />
                  <Text style={{ 
                    marginTop: 16, 
                    fontSize: 14,
                    color: '#6b7280',
                    fontWeight: '400',
                  }}>
                    Loading report card...
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 20 }}>
                  <View style={{
                    padding: 16,
                    backgroundColor: '#fafbfc',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#d1d5db',
                  }}>
                    <Text style={{ 
                      fontSize: 14, 
                      fontWeight: '600', 
                      color: '#374151', 
                      marginBottom: 8,
                      fontFamily: Platform.select({
                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                        default: 'System',
                      }),
                    }}>
                      Student: {primaryChild?.first_name || primaryChild?.name || 'Student'}
                    </Text>
                    <Text style={{ 
                      fontSize: 14, 
                      color: '#6b7280',
                      fontWeight: '400',
                      fontFamily: Platform.select({
                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                        default: 'System',
                      }),
                    }}>
                      School: Homeschool
                    </Text>
                  </View>

                  <View>
                    <Text style={{ 
                      fontSize: 14, 
                      fontWeight: '600', 
                      color: '#374151', 
                      marginBottom: 8,
                      fontFamily: Platform.select({
                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                        default: 'System',
                      }),
                    }}>
                      Term
                    </Text>
                    <View style={{
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#d1d5db',
                      backgroundColor: '#fafbfc',
                      alignSelf: 'flex-start',
                    }}>
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#111827',
                        fontFamily: Platform.select({
                          web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                          default: 'System',
                        }),
                      }}>
                        {selectedTerm}
                      </Text>
                    </View>
                  </View>

                  <View>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: 8,
                      fontFamily: Platform.select({
                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                        default: 'System',
                      }),
                    }}>
                      Grades
                    </Text>
                    {reportCardData.length === 0 ? (
                      <View style={{
                        padding: 16,
                        backgroundColor: '#fef2f2',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        borderStyle: 'dashed'
                      }}>
                        <Text style={{ 
                          fontSize: 14, 
                          color: '#dc2626', 
                          fontStyle: 'italic', 
                          textAlign: 'center',
                          fontWeight: '500',
                          fontFamily: Platform.select({
                            web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                            default: 'System',
                          }),
                        }}>
                          No grades found for this term. Add grades to generate a report card.
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: 12 }}>
                        {reportCardData.map((gradeItem) => (
                          <View key={gradeItem.id} style={{
                            padding: 12,
                            backgroundColor: '#fafbfc',
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: '#d1d5db',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}>
                            <Text style={{ 
                              fontSize: 14, 
                              fontWeight: '500', 
                              color: '#111827',
                              fontFamily: Platform.select({
                                web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                                default: 'System',
                              }),
                            }}>
                              {gradeItem.subjectName}
                            </Text>
                            <Text style={{ 
                              fontSize: 14, 
                              fontWeight: '600', 
                              color: '#111827',
                              fontFamily: Platform.select({
                                web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                                default: 'System',
                              }),
                            }}>
                              {gradeItem.grade}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Behavior Comments */}
                  <View>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: 8,
                      fontFamily: Platform.select({
                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                        default: 'System',
                      }),
                    }}>
                      Behavior Comments
                    </Text>
                    <TextInput
                      value={behaviorComment}
                      onChangeText={setBehaviorComment}
                      placeholder="Enter comments on student behavior for this term..."
                      multiline
                      numberOfLines={6}
                      style={{
                        padding: 12,
                        backgroundColor: '#fafbfc',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#d1d5db',
                        fontSize: 14,
                        color: '#111827',
                        minHeight: 120,
                        paddingTop: 12,
                        textAlignVertical: 'top',
                        fontFamily: Platform.select({
                          web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                          default: 'System',
                        }),
                      }}
                      placeholderTextColor="#9ca3af"
                    />
                    <TouchableOpacity
                      onPress={saveBehaviorComment}
                      style={{
                        marginTop: 12,
                        paddingVertical: 10,
                        paddingHorizontal: 24,
                        borderRadius: 8,
                        backgroundColor: '#B8D7F9',
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Text style={{ 
                        fontSize: 14, 
                        fontWeight: '700', 
                        color: '#1e40af',
                        fontFamily: Platform.select({
                          web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                          default: 'System',
                        }),
                      }}>
                        Save Comment
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
            {/* Export Button */}
            <View style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: colors.border || '#e5e7eb',
              backgroundColor: '#ffffff',
            }}>
              <TouchableOpacity
                onPress={() => setShowReportCardExportModal(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#000000',
                  backgroundColor: 'transparent',
                }}
              >
                <Download size={16} color="#000000" />
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#000000' }}>
                  Export
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report Card Export Modal */}
      <Modal
        visible={showReportCardExportModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowReportCardExportModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          onPress={() => setShowReportCardExportModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              ...Platform.select({
                web: {
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                },
                default: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  elevation: 8,
                },
              }),
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: colors.text || '#000000',
              }}>
                Export Report Card
              </Text>
              <TouchableOpacity
                onPress={() => setShowReportCardExportModal(false)}
                style={{
                  padding: 4,
                }}
              >
                <X size={24} color={colors.text || '#000000'} />
              </TouchableOpacity>
            </View>
            <Text style={{
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 20,
            }}>
              Choose export format:
            </Text>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowReportCardExportModal(false);
                  try {
                    const { exportReportCard } = await import('../../lib/services/exportClient');
                    const result = await exportReportCard(
                      primaryChildId,
                      selectedTerm,
                      reportCardData,
                      behaviorComment,
                      'pdf'
                    );
                    if (!result.success) {
                      if (Platform.OS === 'web') {
                        window.alert(`Error: ${result.error || 'Failed to export report card.'}`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to export report card.');
                      }
                    }
                  } catch (err) {
                    if (Platform.OS === 'web') {
                      window.alert(`Error: ${err.message || 'Failed to export report card.'}`);
                    } else {
                      Alert.alert('Error', err.message || 'Failed to export report card.');
                    }
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  PDF
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowReportCardExportModal(false);
                  try {
                    const { exportReportCard } = await import('../../lib/services/exportClient');
                    const result = await exportReportCard(
                      primaryChildId,
                      selectedTerm,
                      reportCardData,
                      behaviorComment,
                      'docx'
                    );
                    if (!result.success) {
                      if (Platform.OS === 'web') {
                        window.alert(`Error: ${result.error || 'Failed to export report card.'}`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to export report card.');
                      }
                    }
                  } catch (err) {
                    if (Platform.OS === 'web') {
                      window.alert(`Error: ${err.message || 'Failed to export report card.'}`);
                    } else {
                      Alert.alert('Error', err.message || 'Failed to export report card.');
                    }
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  WORD
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Transcript Modal */}
      <Modal
        visible={showTranscriptModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowTranscriptModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          onPress={() => setShowTranscriptModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              maxWidth: 600,
              width: '100%',
              maxHeight: '85vh',
              ...Platform.select({
                web: {
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                },
                default: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  elevation: 8,
                },
              }),
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Close Button */}
            <TouchableOpacity
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#f3f4f6',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
              onPress={() => setShowTranscriptModal(false)}
              accessibilityLabel="Close modal"
              accessibilityRole="button"
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>

            <ScrollView 
              style={{ flex: 1, backgroundColor: '#ffffff' }}
              contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 24 }}
              showsVerticalScrollIndicator={true}
            >
              {loadingTranscript ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.indigo} />
                  <Text style={{ 
                    marginTop: 16, 
                    fontSize: 14,
                    color: '#6b7280',
                    fontWeight: '400',
                  }}>
                    Loading transcript...
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 20 }}>
                  <View style={{
                    padding: 16,
                    backgroundColor: '#fafbfc',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#d1d5db',
                  }}>
                    <Text style={{ 
                      fontSize: 14, 
                      fontWeight: '600', 
                      color: '#374151', 
                      marginBottom: 8,
                      fontFamily: Platform.select({
                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                        default: 'System',
                      }),
                    }}>
                      Student: {primaryChild?.first_name || primaryChild?.name || 'Student'}
                    </Text>
                    <Text style={{ 
                      fontSize: 14, 
                      color: '#6b7280',
                      fontWeight: '400',
                      fontFamily: Platform.select({
                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                        default: 'System',
                      }),
                    }}>
                      School: Homeschool
                    </Text>
                  </View>

                  <View>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: 8,
                      fontFamily: Platform.select({
                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                        default: 'System',
                      }),
                    }}>
                      Courses
                    </Text>
                    {transcriptData.length === 0 ? (
                      <View style={{
                        padding: 16,
                        backgroundColor: '#fef2f2',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        borderStyle: 'dashed'
                      }}>
                        <Text style={{ 
                          fontSize: 14, 
                          color: '#dc2626', 
                          fontStyle: 'italic', 
                          textAlign: 'center',
                          fontWeight: '500',
                          fontFamily: Platform.select({
                            web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                            default: 'System',
                          }),
                        }}>
                          No courses found. Add events with subjects to generate a transcript.
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: 16 }}>
                        {transcriptData.map((termGroup, termIndex) => (
                          <View key={termIndex} style={{
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: '#d1d5db',
                            overflow: 'hidden',
                          }}>
                            {/* Term Header */}
                            <View style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              backgroundColor: '#fafbfc',
                              borderBottomWidth: 1,
                              borderBottomColor: '#d1d5db',
                            }}>
                              {termGroup.dateRange ? (
                                <Text style={{ 
                                  fontSize: 14, 
                                  fontWeight: '600',
                                  color: '#374151',
                                  fontFamily: Platform.select({
                                    web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                                    default: 'System',
                                  }),
                                }}>
                                  {termGroup.term} · {termGroup.dateRange}
                                </Text>
                              ) : (
                                <Text style={{ 
                                  fontSize: 14, 
                                  fontWeight: '600',
                                  color: '#374151',
                                  fontFamily: Platform.select({
                                    web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                                    default: 'System',
                                  }),
                                }}>
                                  {termGroup.term}
                                </Text>
                              )}
                            </View>
                            
                            {/* Subjects under this term */}
                            <View style={{ gap: 0 }}>
                              {termGroup.subjects.map((subject, subjectIndex) => (
                                <View key={subjectIndex} style={{
                                  paddingVertical: 12,
                                  paddingHorizontal: 16,
                                  borderBottomWidth: subjectIndex < termGroup.subjects.length - 1 ? 1 : 0,
                                  borderBottomColor: '#d1d5db',
                                  flexDirection: 'row',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  backgroundColor: '#ffffff',
                                }}>
                                  <Text style={{ 
                                    fontSize: 14, 
                                    color: '#111827',
                                    flex: 1,
                                    fontWeight: '500',
                                    fontFamily: Platform.select({
                                      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                                      default: 'System',
                                    }),
                                  }}>
                                    {subject.subjectName}
                                  </Text>
                                  {subject.grade && (
                                    <Text style={{ 
                                      fontSize: 14, 
                                      color: '#111827',
                                      textAlign: 'right',
                                      marginLeft: 16,
                                      fontWeight: '600',
                                      fontFamily: Platform.select({
                                        web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                                        default: 'System',
                                      }),
                                    }}>
                                      {subject.grade}
                                    </Text>
                                  )}
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
            {/* Export Button */}
            <View style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: colors.border || '#e5e7eb',
              backgroundColor: '#ffffff',
            }}>
              <TouchableOpacity
                onPress={() => setShowTranscriptExportModal(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#000000',
                  backgroundColor: 'transparent',
                }}
              >
                <Download size={16} color="#000000" />
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#000000' }}>
                  Export
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Transcript Export Modal */}
      <Modal
        visible={showTranscriptExportModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTranscriptExportModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          onPress={() => setShowTranscriptExportModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              ...Platform.select({
                web: {
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                },
                default: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  elevation: 8,
                },
              }),
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: colors.text || '#000000',
              }}>
                Export Transcript
              </Text>
              <TouchableOpacity
                onPress={() => setShowTranscriptExportModal(false)}
                style={{
                  padding: 4,
                }}
              >
                <X size={24} color={colors.text || '#000000'} />
              </TouchableOpacity>
            </View>
            <Text style={{
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 20,
            }}>
              Choose export format:
            </Text>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowTranscriptExportModal(false);
                  try {
                    const { exportTranscriptEnhanced } = await import('../../lib/services/exportClient');
                    // Get date range from transcript data or use current school year
                    const now = new Date();
                    const schoolYearStart = new Date(now.getFullYear(), 0, 1); // January 1
                    const schoolYearEnd = new Date(now.getFullYear(), 11, 31); // December 31
                    if (now.getMonth() < 6) { // If before July, use previous year
                      schoolYearStart.setFullYear(now.getFullYear() - 1);
                      schoolYearEnd.setFullYear(now.getFullYear() - 1);
                    }
                    const result = await exportTranscriptEnhanced(
                      primaryChildId,
                      schoolYearStart.toISOString().split('T')[0],
                      schoolYearEnd.toISOString().split('T')[0],
                      'unweighted',
                      'pdf'
                    );
                    if (!result.success) {
                      if (Platform.OS === 'web') {
                        window.alert(`Error: ${result.error || 'Failed to export transcript.'}`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to export transcript.');
                      }
                    }
                  } catch (err) {
                    if (Platform.OS === 'web') {
                      window.alert(`Error: ${err.message || 'Failed to export transcript.'}`);
                    } else {
                      Alert.alert('Error', err.message || 'Failed to export transcript.');
                    }
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  PDF
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#4285f4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowTranscriptExportModal(false);
                  try {
                    const { exportTranscriptEnhanced } = await import('../../lib/services/exportClient');
                    // Get date range from transcript data or use current school year
                    const now = new Date();
                    const schoolYearStart = new Date(now.getFullYear(), 0, 1); // January 1
                    const schoolYearEnd = new Date(now.getFullYear(), 11, 31); // December 31
                    if (now.getMonth() < 6) { // If before July, use previous year
                      schoolYearStart.setFullYear(now.getFullYear() - 1);
                      schoolYearEnd.setFullYear(now.getFullYear() - 1);
                    }
                    const result = await exportTranscriptEnhanced(
                      primaryChildId,
                      schoolYearStart.toISOString().split('T')[0],
                      schoolYearEnd.toISOString().split('T')[0],
                      'unweighted',
                      'csv'
                    );
                    if (!result.success) {
                      if (Platform.OS === 'web') {
                        window.alert(`Error: ${result.error || 'Failed to export transcript.'}`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to export transcript.');
                      }
                    }
                  } catch (err) {
                    if (Platform.OS === 'web') {
                      window.alert(`Error: ${err.message || 'Failed to export transcript.'}`);
                    } else {
                      Alert.alert('Error', err.message || 'Failed to export transcript.');
                    }
                  }
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  CSV
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Deeper Prompt Item Component (handles hover state)
function DeeperPromptItem({ prompt, onPress, isButton = false }) {
  const [isHovered, setIsHovered] = useState(false);
  
  if (isButton) {
    return (
      <TouchableOpacity
        style={styles.coachInsightCTA}
        onPress={onPress}
        {...(Platform.OS === 'web' && {
          onMouseEnter: () => setIsHovered(true),
          onMouseLeave: () => setIsHovered(false),
        })}
      >
        <Text 
          style={[
            styles.coachInsightCTAText,
            isHovered && { color: '#4285f4' }
          ]}
          numberOfLines={1}
        >{prompt}</Text>
        <ChevronRight 
          size={14} 
          color={isHovered ? '#4285f4' : (colors.text || '#1a1a1a')} 
          style={styles.coachInsightCTAArrow} 
        />
      </TouchableOpacity>
    );
  }
  
  return (
    <TouchableOpacity
      style={styles.coachDeeperPrompt}
      onPress={onPress}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      })}
    >
      <Text style={[
        styles.coachDeeperPromptText,
        isHovered && { color: '#4285f4' }
      ]}>{prompt}</Text>
    </TouchableOpacity>
  );
}

// Coach Tab Component
function CoachTab({ familyId, children, selectedChildren, subjects = [] }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [selectedDeeperQuestion, setSelectedDeeperQuestion] = useState(null);
  const [dailyInsight, setDailyInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deeperQuestionAnswers, setDeeperQuestionAnswers] = useState({}); // { categoryId-questionIndex: { answer, date } }
  const [primaryQuestionAnswers, setPrimaryQuestionAnswers] = useState({}); // { categoryId: { answer, date } }
  const [loadingDeeperAnswer, setLoadingDeeperAnswer] = useState(false);
  const [loadingPrimaryAnswer, setLoadingPrimaryAnswer] = useState(false);
  const [showWhyThisMattersModal, setShowWhyThisMattersModal] = useState(false);
  const [showSignalsModal, setShowSignalsModal] = useState(false);
  const [insightData, setInsightData] = useState(null); // Store data for modals
  const [isGenerateButtonHovered, setIsGenerateButtonHovered] = useState(false);

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

  const primaryChildId = displayChild?.id;

  // Load daily insight
  useEffect(() => {
    if (!primaryChildId || !familyId) {
      setLoading(false);
      return;
    }

    const loadDailyInsight = async () => {
      setLoading(true);
      try {
        // Load recent events with subject data to generate insight
        const { data: eventsData } = await supabase
          .from('events')
          .select('id, subject_id, start_ts, event_type, child_id, title, description')
          .eq('family_id', familyId)
          .eq('child_id', primaryChildId)
          .gte('start_ts', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .is('deleted_at', null)
          .order('start_ts', { ascending: false })
          .limit(20);

        const eventCount = (eventsData || []).length;
        const subjectIds = new Set((eventsData || []).map(e => e.subject_id).filter(Boolean));
        const subjectCount = subjectIds.size;

        // Calculate recent activity (last 3 days vs previous 4 days)
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const recentEvents = (eventsData || []).filter(e => new Date(e.start_ts) >= threeDaysAgo).length;
        const earlierEvents = eventCount - recentEvents;
        const activityTrend = recentEvents > earlierEvents ? 'increasing' : recentEvents < earlierEvents ? 'decreasing' : 'steady';

        // Fetch subject names for signal source
        let subjectNames = [];
        if (subjectIds.size > 0) {
          const { data: subjectsData } = await supabase
            .from('subject')
            .select('id, name')
            .in('id', Array.from(subjectIds));
          subjectNames = (subjectsData || []).map(s => s.name).filter(Boolean);
        }

        // Generate insight with signal source
        const childName = displayChild?.first_name || displayChild?.name || 'Your child';
        const subjectList = subjectNames.length > 0 
          ? subjectNames.slice(0, 2).join(' and ') + (subjectNames.length > 2 ? ` and ${subjectNames.length - 2} more` : '')
          : 'multiple subjects';
        
        // Determine progress status and icon based on engagement
        let progressIcon = null;
        if (eventCount >= 10 && subjectCount >= 3) {
          // Strong engagement - multiple events and subjects
          progressIcon = <CheckCircle size={18} color={colors.greenBold || '#16a34a'} />;
        } else if (eventCount >= 5 && subjectCount >= 2) {
          // Good engagement - steady progress
          progressIcon = <TrendingUp size={18} color={colors.blueBold || '#2563eb'} />;
        } else if (eventCount >= 3) {
          // Moderate engagement - on track
          progressIcon = <Target size={18} color={colors.indigo || '#6366f1'} />;
        } else if (eventCount > 0) {
          // Some engagement - building momentum
          progressIcon = <Activity size={18} color={colors.textSecondary || '#6b7280'} />;
        } else {
          // Minimal engagement - neutral
          progressIcon = <Clock size={18} color={colors.textSecondary || '#6b7280'} />;
        }

        // Generate dynamic reassurance message based on data
        let reassurance = "";
        if (eventCount === 0) {
          reassurance = "It's okay to have quieter weeks. Every family's rhythm is different, and rest is part of learning too.";
        } else if (eventCount >= 10 && subjectCount >= 3) {
          reassurance = "This level of engagement shows real consistency. You're building a sustainable learning rhythm.";
        } else if (eventCount >= 5 && subjectCount >= 2) {
          reassurance = "Nothing here suggests you're falling behind—this looks like a normal, healthy learning rhythm.";
        } else if (activityTrend === 'increasing' && recentEvents >= 3) {
          reassurance = "You're building momentum. The recent activity shows engagement is growing, which is a positive sign.";
        } else if (activityTrend === 'decreasing' && eventCount >= 3) {
          reassurance = "A slight dip in activity is normal. What matters is that you're maintaining connection with learning.";
        } else if (subjectCount >= 2) {
          reassurance = "You're covering multiple subjects, which shows good breadth. This balanced approach supports well-rounded learning.";
        } else if (eventCount >= 3) {
          reassurance = "Steady progress is happening. Consistency over time matters more than any single week.";
        } else {
          reassurance = "Every bit of learning counts. Small, consistent steps build into meaningful progress over time.";
        }
        
        const insight = {
          perspective: `${childName} has been showing steady engagement${subjectCount > 0 ? ` across ${subjectCount} subject${subjectCount !== 1 ? 's' : ''}` : ''} this week.`,
          reassurance: reassurance,
          progressIcon: progressIcon,
          signalSource: subjectNames.length > 0 
            ? `Observed during ${subjectList} sessions this week.`
            : eventCount > 0 
              ? `Based on ${eventCount} learning session${eventCount !== 1 ? 's' : ''} this week.`
              : null,
        };

        setDailyInsight(insight);
        // Store data for modals
        setInsightData({
          eventCount,
          subjectCount,
          subjectNames,
          activityTrend,
          recentEvents,
          earlierEvents,
          childName,
        });
      } catch (err) {
        console.error('[CoachTab] Error loading insight:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDailyInsight();
  }, [primaryChildId, familyId, displayChild]);

  // Define categories using useMemo so it's available for useEffect hooks
  const categories = useMemo(() => [
    {
      id: 'emotional',
      name: 'Emotional',
      description: 'How ' + (displayChild?.first_name || 'your child') + ' is feeling, relating, and experiencing learning',
      color: '#A855F7', // Bright purple
      questions: {
        primary: {
          question: "Who does " + (displayChild?.first_name || 'your child') + " seem most energized by when learning this week?",
          insight: (displayChild?.first_name || 'Your child') + " appears most engaged during shared learning blocks this week—especially when " + (displayChild?.first_name || 'they') + " can talk through ideas with you.",
          signalSource: "Observed during recent learning sessions this week",
          reflection: "That doesn't mean independence isn't important—just that connection is currently helping " + (displayChild?.first_name || 'them') + " feel safe and confident.",
          takeaway: "You might notice " + (displayChild?.first_name || 'your child') + " stays more engaged when learning feels collaborative rather than solo.",
        },
        deeper: [
          "Who could be a positive learning role model for " + (displayChild?.first_name || 'your child') + " right now?",
          "When " + (displayChild?.first_name || 'your child') + " struggles, what kind of support helps " + (displayChild?.first_name || 'them') + " feel safe rather than pressured?",
        ],
      },
    },
    {
      id: 'tactical',
      name: 'Tactical',
      description: "What's working right now—and how to build on it",
      color: '#F59E0B', // Bright amber
      questions: {
        primary: {
          question: "What strengths is " + (displayChild?.first_name || 'your child') + " showing right now?",
          insight: (displayChild?.first_name || 'Your child') + " often notices patterns and explains ideas clearly—especially when " + (displayChild?.first_name || 'they') + "'re talking them through with you.",
          signalSource: "Based on " + (displayChild?.first_name || 'your child') + "'s explanations during recent lessons",
          reflection: "These natural strengths can be leveraged to support areas that require more effort.",
          takeaway: "You might notice " + (displayChild?.first_name || 'your child') + " stays more confident when " + (displayChild?.first_name || 'they') + " can explain ideas out loud before writing them down.",
        },
        deeper: [
          "What activities spark the most curiosity for " + (displayChild?.first_name || 'your child') + " lately?",
          "Where could " + (displayChild?.first_name || 'your child') + " explain " + (displayChild?.first_name || 'their') + " thinking before being asked for an answer?",
        ],
      },
    },
    {
      id: 'strategic',
      name: 'Strategic',
      description: 'Longer-term growth and how today connects forward',
      color: '#3B82F6', // Bright blue
      questions: {
        primary: {
          question: "What growth patterns are emerging for " + (displayChild?.first_name || 'your child') + "?",
          insight: (displayChild?.first_name || 'Your child') + " is showing steady progress in problem-solving approaches—you're seeing " + (displayChild?.first_name || 'them') + " try new strategies more often.",
          signalSource: "Noticed in how " + (displayChild?.first_name || 'your child') + " approaches recent challenges",
          reflection: "Growth happens gradually. The patterns you're seeing now will continue to develop.",
          takeaway: "You might notice " + (displayChild?.first_name || 'your child') + " is more willing to experiment when mistakes feel safe rather than high-stakes.",
        },
        deeper: [
          "What innovative approaches has " + (displayChild?.first_name || 'your child') + " tried recently?",
          "How can you support continued growth without pressure?",
        ],
      },
    },
    {
      id: 'predictive',
      name: 'Predictive',
      description: 'What this learning rhythm may lead to next',
      color: '#6366F1', // Bright indigo
      questions: {
        primary: {
          question: "What does the current learning rhythm suggest about next week?",
          insight: "If this pace continues, " + (displayChild?.first_name || 'your child') + " is likely to feel steady—but a little tired—by the end of next week.",
          signalSource: "Based on the learning rhythm you've maintained this week",
          reflection: "This is normal. Consider building in lighter days to maintain energy.",
          takeaway: "You might notice " + (displayChild?.first_name || 'your child') + " benefits from a lighter day mid-week to recharge without losing momentum.",
        },
        deeper: [
          "What patterns typically follow this type of engagement?",
          "How can you prepare for potential energy dips?",
        ],
      },
    },
    {
      id: 'perspective',
      name: 'Perspective',
      description: 'Reassurance through context and zoomed-out insight',
      color: '#EC4899', // Bright pink/rose
      questions: {
        primary: {
          question: "How does this learning journey look from a distance?",
          insight: "Nothing here suggests you're behind.",
          signalSource: "Looking at the bigger picture of " + (displayChild?.first_name || 'your child') + "'s learning patterns",
          reflection: "Many families experience similar patterns. This is part of a healthy learning journey.",
          takeaway: "You might notice that steady, consistent learning often feels slower than it actually is—but it's building something real.",
        },
        deeper: [
          "What does the bigger picture tell you about progress?",
          "How does this compare to typical learning rhythms?",
        ],
      },
    },
  ], [displayChild]);

  // Load answer for deeper question when selected
  useEffect(() => {
    if (!selectedCategory || selectedDeeperQuestion === null || !primaryChildId || !familyId) {
      return;
    }

    const loadDeeperAnswer = async () => {
      const answerKey = `${selectedCategory}-${selectedDeeperQuestion}`;
      const today = new Date().toDateString();
      
      // Check if we have a cached answer from today
      setDeeperQuestionAnswers(prev => {
        const cachedAnswer = prev[answerKey];
        if (cachedAnswer && cachedAnswer.date === today && cachedAnswer.answer) {
          // Already have today's answer, skip loading
          return prev;
        }
        
        // Need to load answer - continue with async function
        (async () => {
          setLoadingDeeperAnswer(true);
          try {
            const category = categories.find(c => c.id === selectedCategory);
            if (!category) return;

            const question = category.questions.deeper[selectedDeeperQuestion];
            if (!question) return;

            // Calculate date range (last 7 days)
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            const dateRange = {
              start: startDate,
              end: endDate,
            };

            // Build context-aware prompt
            const childName = displayChild?.first_name || 'your child';
            const contextPrompt = `As a learning coach, answer this question thoughtfully based on ${childName}'s actual learning data from the past week: ${question}

Provide a personalized, parent-centered response that:
- References specific observations from their learning activities
- Offers reassurance and perspective
- Includes a brief signal source (what data this is based on)
- Gives a practical takeaway

Keep the response warm, non-judgmental, and focused on what the parent can notice or consider.`;

            // Call plannerAIChat to generate answer
            const { data, error } = await plannerAIChat(
              familyId,
              [primaryChildId],
              dateRange,
              [{ role: 'user', content: contextPrompt }]
            );

            if (error) {
              console.error('[CoachTab] Error loading deeper answer:', error);
              // Fallback to a simple reflective answer
              const fallbackAnswer = `This is a reflective question for you to consider. Take a moment to think about what you've observed in ${childName}'s learning journey, and trust your insights.`;
              setDeeperQuestionAnswers(prevState => ({
                ...prevState,
                [answerKey]: { answer: fallbackAnswer, date: today }
              }));
              return;
            }

            if (data) {
              const answer = data.assistant_message || data.response || `This is a reflective question for you to consider. Take a moment to think about what you've observed in ${childName}'s learning journey, and trust your insights.`;
              setDeeperQuestionAnswers(prevState => ({
                ...prevState,
                [answerKey]: { answer, date: today }
              }));
            }
          } catch (err) {
            console.error('[CoachTab] Exception loading deeper answer:', err);
            const childName = displayChild?.first_name || 'your child';
            const fallbackAnswer = `This is a reflective question for you to consider. Take a moment to think about what you've observed in ${childName}'s learning journey, and trust your insights.`;
            setDeeperQuestionAnswers(prevState => ({
              ...prevState,
              [answerKey]: { answer: fallbackAnswer, date: today }
            }));
          } finally {
            setLoadingDeeperAnswer(false);
          }
        })();
        
        return prev;
      });
    };

    loadDeeperAnswer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedDeeperQuestion, primaryChildId, familyId]);

  // Generate answer for primary question (called when button is clicked)
  const handleGeneratePrimaryAnswer = async () => {
    if (!selectedCategory || selectedDeeperQuestion !== null || !primaryChildId || !familyId || loadingPrimaryAnswer) {
      return;
    }

    const answerKey = selectedCategory;
    const today = new Date().toDateString();
    
    // Check if we have a cached answer from today
    const cachedAnswer = primaryQuestionAnswers[answerKey];
    if (cachedAnswer && cachedAnswer.date === today && cachedAnswer.answer) {
      // Already have today's answer, skip loading
      return;
    }

    setLoadingPrimaryAnswer(true);
    try {
      const category = categories.find(c => c.id === selectedCategory);
      if (!category) return;

      const question = category.questions.primary.question;
      if (!question) return;

      // Calculate date range (last 7 days)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const dateRange = {
        start: startDate,
        end: endDate,
      };

      // Build context-aware prompt (same format as deeper questions)
      const childName = displayChild?.first_name || 'your child';
      const contextPrompt = `As a learning coach, answer this question thoughtfully based on ${childName}'s actual learning data from the past week: ${question}

Provide a personalized, parent-centered response that:
- References specific observations from their learning activities
- Offers reassurance and perspective
- Includes a brief signal source (what data this is based on)
- Gives a practical takeaway

Keep the response warm, non-judgmental, and focused on what the parent can notice or consider.`;

      // Call plannerAIChat to generate answer
      const { data, error } = await plannerAIChat(
        familyId,
        [primaryChildId],
        dateRange,
        [{ role: 'user', content: contextPrompt }]
      );

      if (error) {
        console.error('[CoachTab] Error loading primary answer:', error);
        // Fallback to static text
        const category = categories.find(c => c.id === selectedCategory);
        if (category) {
          const fallbackAnswer = category.questions.primary.insight + 
            (category.questions.primary.reflection ? ' ' + category.questions.primary.reflection : '') +
            (category.questions.primary.takeaway ? ' ' + category.questions.primary.takeaway : '');
          setPrimaryQuestionAnswers(prevState => ({
            ...prevState,
            [answerKey]: { answer: fallbackAnswer, date: today }
          }));
        }
        return;
      }

      if (data) {
        const answer = data.assistant_message || data.response || '';
        if (answer) {
          setPrimaryQuestionAnswers(prevState => ({
            ...prevState,
            [answerKey]: { answer, date: today }
          }));
        }
      }
    } catch (err) {
      console.error('[CoachTab] Exception loading primary answer:', err);
      // Fallback to static text
      const category = categories.find(c => c.id === selectedCategory);
      if (category) {
        const fallbackAnswer = category.questions.primary.insight + 
          (category.questions.primary.reflection ? ' ' + category.questions.primary.reflection : '') +
          (category.questions.primary.takeaway ? ' ' + category.questions.primary.takeaway : '');
        setPrimaryQuestionAnswers(prevState => ({
          ...prevState,
          [answerKey]: { answer: fallbackAnswer, date: today }
        }));
      }
    } finally {
      setLoadingPrimaryAnswer(false);
    }
  };

  if (!displayChild) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          icon={Heart}
          title="No child selected"
          description="Select a child from the filters above to view coach insights"
          size="default"
        />
      </View>
    );
  }

  const childName = displayChild.first_name || displayChild.name || 'Your child';

  return (
    <View style={styles.tabContent}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Daily Coach Insight */}
        {dailyInsight && (
          <View style={styles.coachInsightCard}>
            <Text style={styles.coachInsightTitle}>
              Today's perspective for {childName}
            </Text>
            <Text style={styles.coachInsightText}>
              {dailyInsight.perspective}
            </Text>
            <View style={styles.coachInsightReassuranceRow}>
              {dailyInsight.progressIcon && (
                <View style={styles.coachInsightIconContainer}>
                  {dailyInsight.progressIcon}
                </View>
              )}
              <Text style={styles.coachInsightReassurance}>
                {dailyInsight.reassurance}
              </Text>
            </View>
            <View style={styles.coachInsightButtonsRow}>
              <DeeperPromptItem
                prompt="Why this matters"
                onPress={() => setShowWhyThisMattersModal(true)}
                isButton={true}
              />
              <DeeperPromptItem
                prompt="Show me the signals"
                onPress={() => setShowSignalsModal(true)}
                isButton={true}
              />
            </View>
          </View>
        )}

        {/* Divider with Text */}
        <View style={styles.coachCategoryDividerContainer}>
          <View style={styles.coachCategoryDividerLine} />
          <Text style={[
            styles.coachCategoryDividerText,
            selectedCategory && styles.coachCategoryDividerTextFaded
          ]}>
            {selectedCategory 
              ? `Exploring ${categories.find(c => c.id === selectedCategory)?.name || ''} insights`
              : 'Choose a card for deeper insights below'}
          </Text>
          <View style={styles.coachCategoryDividerLine} />
        </View>

        {/* Category Grid */}
        <View style={styles.coachCategoriesGrid}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.coachCategoryTile,
                selectedCategory === category.id && styles.coachCategoryTileActive,
              ]}
              onPress={() => {
                setSelectedCategory(selectedCategory === category.id ? null : category.id);
                setExpandedCategory(null);
                setSelectedDeeperQuestion(null);
              }}
            >
              <Text style={styles.coachCategoryName}>{category.name}</Text>
              <Text style={styles.coachCategoryDescription}>{category.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category Panel */}
        {selectedCategory && (
          <View style={styles.coachCategoryPanel}>
            {(() => {
              const category = categories.find(c => c.id === selectedCategory);
              if (!category) return null;

              return (
                <View>
                  <View style={styles.coachCategoryPanelHeader}>
                    <Text style={styles.coachCategoryPanelTitle}>{category.name}</Text>
                    <TouchableOpacity
                      onPress={() => setSelectedCategory(null)}
                      style={styles.coachCategoryPanelClose}
                    >
                      <X size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Question and Answer */}
                  <View style={styles.coachQuestionSection}>
                    <Text style={styles.coachQuestionPrimary}>
                      {selectedDeeperQuestion !== null 
                        ? category.questions.deeper[selectedDeeperQuestion]
                        : category.questions.primary.question}
                    </Text>
                    <View style={styles.coachInsightBox}>
                      {(loadingDeeperAnswer && selectedDeeperQuestion !== null) || (loadingPrimaryAnswer && selectedDeeperQuestion === null) ? (
                        <View style={styles.coachLoadingContainer}>
                          <ActivityIndicator size="small" color={colors.textSecondary} />
                          <Text style={styles.coachLoadingText}>Generating personalized answer...</Text>
                        </View>
                      ) : selectedDeeperQuestion === null ? (
                        // Primary question - show button if no answer, otherwise show answer
                        (() => {
                          const answerKey = selectedCategory;
                          const cachedAnswer = primaryQuestionAnswers[answerKey];
                          if (cachedAnswer && cachedAnswer.answer) {
                            return (
                              <Text style={styles.coachInsightBoxText}>
                                {cachedAnswer.answer}
                              </Text>
                            );
                          }
                          
                          // Show generate button if no answer yet
                          const buttonBgColor = isGenerateButtonHovered ? '#4285f4' : 'transparent';
                          const buttonBorderColor = isGenerateButtonHovered ? '#4285f4' : '#111827';
                          const buttonTextColor = isGenerateButtonHovered ? '#ffffff' : '#111827';
                          const iconColor = isGenerateButtonHovered ? '#ffffff' : '#111827';
                          
                          return (
                            <TouchableOpacity
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                                backgroundColor: buttonBgColor,
                                borderWidth: 1,
                                borderColor: buttonBorderColor,
                                alignSelf: 'flex-start',
                                ...(Platform.OS === 'web' && {
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }),
                              }}
                              onPress={handleGeneratePrimaryAnswer}
                              disabled={loadingPrimaryAnswer}
                              {...(Platform.OS === 'web' && {
                                onMouseEnter: () => setIsGenerateButtonHovered(true),
                                onMouseLeave: () => setIsGenerateButtonHovered(false),
                              })}
                            >
                              <Sparkles size={16} color={iconColor} />
                              <Text style={{
                                fontSize: 14,
                                fontWeight: '600',
                                color: buttonTextColor,
                                fontFamily: Platform.select({
                                  web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                                  default: 'System',
                                }),
                                ...(Platform.OS === 'web' && {
                                  transition: 'color 0.2s ease',
                                }),
                              }}>
                                Generate personalized answer
                              </Text>
                            </TouchableOpacity>
                          );
                        })()
                      ) : (
                        // Deeper question - show cached or fallback
                        <Text style={styles.coachInsightBoxText}>
                          {(() => {
                            const answerKey = `${selectedCategory}-${selectedDeeperQuestion}`;
                            const cachedAnswer = deeperQuestionAnswers[answerKey];
                            if (cachedAnswer && cachedAnswer.answer) {
                              return cachedAnswer.answer;
                            }
                            // Fallback while loading
                            return "This is a reflective question for you to consider. Take a moment to think about what you've observed in " + (displayChild?.first_name || 'your child') + "'s learning journey, and trust your insights.";
                          })()}
                        </Text>
                      )}
                    </View>
                    {selectedDeeperQuestion !== null && (
                      <TouchableOpacity
                        style={styles.coachBackButton}
                        onPress={() => setSelectedDeeperQuestion(null)}
                      >
                        <Text style={styles.coachBackButtonText}>← Back to main question</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Expand to Deeper */}
                  {!expandedCategory && selectedDeeperQuestion === null && (
                    <TouchableOpacity
                      style={styles.coachExpandButton}
                      onPress={() => setExpandedCategory(selectedCategory)}
                    >
                      <Text style={styles.coachExpandButtonText}>Want to explore more?</Text>
                      <ChevronDown size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}

                  {/* Deeper Prompts */}
                  {expandedCategory === selectedCategory && selectedDeeperQuestion === null && (
                    <View style={styles.coachDeeperSection}>
                      <Text style={styles.coachDeeperIntro}>
                        If you're curious to reflect a bit more:
                      </Text>
                      {category.questions.deeper.map((prompt, idx) => (
                        <DeeperPromptItem 
                          key={idx} 
                          prompt={prompt}
                          onPress={() => {
                            setSelectedDeeperQuestion(idx);
                            setExpandedCategory(null);
                          }}
                        />
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        )}
      </ScrollView>

      {/* Why This Matters Modal */}
      <Modal
        visible={showWhyThisMattersModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowWhyThisMattersModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowWhyThisMattersModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.coachModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.coachModalHeader}>
              <Text style={styles.coachModalTitle}>Why this matters</Text>
              <TouchableOpacity
                onPress={() => setShowWhyThisMattersModal(false)}
                style={styles.coachModalClose}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.coachModalBody} showsVerticalScrollIndicator={false}>
              {insightData && dailyInsight && (
                <>
                  {/* Plain-language explanation */}
                  <View style={styles.coachModalSection}>
                    <Text style={styles.coachModalSectionText}>
                      {insightData.eventCount >= 5 && insightData.subjectCount >= 2
                        ? `Steady engagement across ${insightData.subjectCount} subject${insightData.subjectCount !== 1 ? 's' : ''} often indicates that learning demands are well-matched to ${insightData.childName}'s current capacity.`
                        : insightData.eventCount >= 3
                          ? `Consistent participation in learning activities suggests that ${insightData.childName} is finding a sustainable rhythm.`
                          : insightData.eventCount > 0
                            ? `Regular engagement, even in smaller amounts, shows that learning is becoming part of ${insightData.childName}'s routine.`
                            : `Every family's learning rhythm is unique. Quiet periods are part of the natural ebb and flow of learning.`}
                    </Text>
                  </View>

                  {/* Normalization */}
                  <View style={styles.coachModalSection}>
                    <Text style={styles.coachModalSectionText}>
                      {insightData.activityTrend === 'steady'
                        ? `Many children show this pattern during periods of consolidation rather than rapid growth. That's normal—and healthy.`
                        : insightData.activityTrend === 'increasing'
                          ? `An increase in activity often happens when children feel confident and engaged. This is a positive sign of growing momentum.`
                          : insightData.eventCount >= 3
                            ? `A slight variation in activity is completely normal. What matters is maintaining connection with learning over time.`
                            : `It's common to have quieter weeks. Rest and reflection are valuable parts of the learning process.`}
                    </Text>
                  </View>

                  {/* Reassurance / framing */}
                  <View style={styles.coachModalSection}>
                    <Text style={styles.coachModalSectionText}>
                      {insightData.eventCount >= 5 && insightData.subjectCount >= 2
                        ? `This suggests your current approach is supporting consistency rather than pressure.`
                        : insightData.eventCount >= 3
                          ? `You're creating a learning environment where ${insightData.childName} can engage at a comfortable pace.`
                          : insightData.eventCount > 0
                            ? `Small, consistent steps are building a foundation for learning.`
                            : `Trust your instincts. Every family finds their own rhythm, and that's exactly as it should be.`}
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Show Me the Signals Modal */}
      <Modal
        visible={showSignalsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSignalsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSignalsModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.coachModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.coachModalHeader}>
              <Text style={styles.coachModalTitle}>Signals behind today's perspective</Text>
              <TouchableOpacity
                onPress={() => setShowSignalsModal(false)}
                style={styles.coachModalClose}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.coachModalBody} showsVerticalScrollIndicator={false}>
              {insightData && dailyInsight && (
                <>
                  {/* Engagement signals */}
                  {insightData.eventCount > 0 && (
                    <View style={styles.coachModalSection}>
                      <Text style={styles.coachModalSectionLabel}>Engagement</Text>
                      <View style={styles.coachModalSignalList}>
                        <View style={styles.coachModalSignalRow}>
                          <Text style={styles.coachModalSignalBullet}>•</Text>
                          <Text style={styles.coachModalSignalItem}>
                            {insightData.childName} participated in learning activities on {insightData.eventCount} of the last 7 days
                          </Text>
                        </View>
                        {insightData.subjectCount > 0 && (
                          <View style={styles.coachModalSignalRow}>
                            <Text style={styles.coachModalSignalBullet}>•</Text>
                            <Text style={styles.coachModalSignalItem}>
                              Engagement time remained consistent across {insightData.subjectNames.slice(0, 2).join(' and ')}{insightData.subjectNames.length > 2 ? ` and ${insightData.subjectNames.length - 2} more` : ''}
                            </Text>
                          </View>
                        )}
                        {insightData.activityTrend === 'steady' && (
                          <View style={styles.coachModalSignalRow}>
                            <Text style={styles.coachModalSignalBullet}>•</Text>
                            <Text style={styles.coachModalSignalItem}>
                              No recent drops in completion or attention indicators
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Pace signals */}
                  {insightData.eventCount > 0 && (
                    <View style={styles.coachModalSection}>
                      <Text style={styles.coachModalSectionLabel}>Pace</Text>
                      <View style={styles.coachModalSignalList}>
                        {insightData.activityTrend === 'steady' && (
                          <View style={styles.coachModalSignalRow}>
                            <Text style={styles.coachModalSignalBullet}>•</Text>
                            <Text style={styles.coachModalSignalItem}>
                              Learning pace has remained consistent over the past week
                            </Text>
                          </View>
                        )}
                        {insightData.activityTrend === 'increasing' && (
                          <View style={styles.coachModalSignalRow}>
                            <Text style={styles.coachModalSignalBullet}>•</Text>
                            <Text style={styles.coachModalSignalItem}>
                              Activity has increased in the last 3 days compared to the previous 4 days
                            </Text>
                          </View>
                        )}
                        {insightData.activityTrend === 'decreasing' && insightData.eventCount >= 3 && (
                          <View style={styles.coachModalSignalRow}>
                            <Text style={styles.coachModalSignalBullet}>•</Text>
                            <Text style={styles.coachModalSignalItem}>
                              Slight decrease in recent activity, but overall engagement remains steady
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Consistency signals */}
                  {insightData.subjectCount >= 2 && (
                    <View style={styles.coachModalSection}>
                      <Text style={styles.coachModalSectionLabel}>Consistency</Text>
                      <View style={styles.coachModalSignalList}>
                        <View style={styles.coachModalSignalRow}>
                          <Text style={styles.coachModalSignalBullet}>•</Text>
                          <Text style={styles.coachModalSignalItem}>
                            Multiple subjects covered regularly this week
                          </Text>
                        </View>
                        {insightData.eventCount >= 5 && (
                          <View style={styles.coachModalSignalRow}>
                            <Text style={styles.coachModalSignalBullet}>•</Text>
                            <Text style={styles.coachModalSignalItem}>
                              Consistent participation across different learning activities
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {insightData.eventCount === 0 && (
                    <View style={styles.coachModalSection}>
                      <Text style={styles.coachModalSignalItem}>
                        No learning activities recorded in the past 7 days
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
