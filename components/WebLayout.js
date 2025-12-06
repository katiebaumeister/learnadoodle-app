import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Platform, View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FiltersProvider } from '../contexts/FiltersContext';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import WebContent from './WebContent';
import SettingsModal from './settings/SettingsModal';
import SearchModal from './SearchModal';
import GlobalNewMenu from './GlobalNewMenu';
import LayoutShell from './LayoutShell';
import LeftRail from './LeftRail';
import GeistSidebar from './GeistSidebar';
import RightToolbar from './RightToolbar';
import ToolContent from './ToolContent';
import TaskCreateModal from './TaskCreateModal';
import AddSubjectModal from './AddSubjectModal';
import EditChildModal from './EditChildModal';
import PlanYearWizard from './year/PlanYearWizard';
// Removed: SummarizeProgressModal, PackWeekModal, CatchUpModal imports
// These modals are now handled by IntelligenceHub
import AnalyticsDashboard from './analytics/AnalyticsDashboard';
import ProgressReport from './analytics/ProgressReport';
import ScheduleSettingsModal from './modals/ScheduleSettingsModal';
import AIToolsModal from './AIToolsModal';
import SyllabusUpload from './SyllabusUpload';
import LoadingScreen from './LoadingScreen';
import { ToastProvider } from './Toast';
import { supabase } from '../lib/supabase';
import { PlannerDiffProvider } from '../app/state/usePlannerDiffStore';
import PlannerDiffModal from '../app/components/schedule/PlannerDiffModal';
import { PlannerHealthProvider } from '../app/state/usePlannerHealthStore';
import { ConstraintsProvider } from '../app/state/useConstraintsStore';

export default function WebLayout({ navigation, routeParams }) {
  const { user } = useAuth();
  const { openSearch } = useGlobalSearch();
  const [activeTab, setActiveTab] = useState('home');
  const [activeSubtab, setActiveSubtab] = useState(null);
  const [activeTopNav, setActiveTopNav] = useState('home');
  const [activeChildId, setActiveChildId] = useState(null);
  const [activeChildSection, setActiveChildSection] = useState('affirmation');
  const [showSyllabusUpload, setShowSyllabusUpload] = useState(false);
  const [showAuthSettings, setShowAuthSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState('profile');
  const [showDoodleSearchModal, setShowDoodleSearchModal] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEditChildModal, setShowEditChildModal] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [taskModalDate, setTaskModalDate] = useState(new Date());
  const [newMenuPosition, setNewMenuPosition] = useState({ x: 320, y: 88 });
  const [children, setChildren] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [familyId, setFamilyId] = useState(null);
  const [rightSidebarContent, setRightSidebarContent] = useState(null);
  const [activeRightTool, setActiveRightTool] = useState(null);
  const prevActiveTabRef = useRef(null);
  // Removed: showYearWizard, showSummarizeProgressModal, showPackWeekModal, showCatchUpModal
  // These modals are now handled by IntelligenceHub
  const [showAnalyticsDashboard, setShowAnalyticsDashboard] = useState(false);
  const [showProgressReport, setShowProgressReport] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAIToolsModal, setShowAIToolsModal] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [homeLoading, setHomeLoading] = useState(false);
  
  const activeChildName = useMemo(() => {
    if (!activeSubtab || !children?.length) return null;
    const child = children.find((c) => String(c.id) === String(activeSubtab));
    return child?.first_name || child?.name || null;
  }, [activeSubtab, children]);

  // Fetch user role
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;
      try {
        const { getMe } = await import('../lib/apiClient');
        const { data: meData, error: meError } = await getMe();
        
        // Handle 401 errors gracefully (backend might not be running or auth not ready)
        const isAuthError = meError?.status === 401 || meError?.response?.status === 401;
        
        if (!meError && meData) {
          setUserRole(meData.role || 'parent');
        } else if (!isAuthError) {
          // Only log non-auth errors
          console.warn('[WebLayout] getMe error (non-critical):', meError);
        }
        
        // Always fallback to profile table (works even if backend is down)
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (profileData) {
          setUserRole(profileData.role || 'parent');
        } else {
          setUserRole('parent'); // Default fallback
        }
      } catch (error) {
        // Silent fallback - don't log errors here
        setUserRole('parent');
      }
    };
    fetchUserRole();
  }, [user]);

  const fetchFamilyMembers = useCallback(async () => {
    if (!user) return;
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .maybeSingle();
      if (profileData?.family_id) {
        setFamilyId(profileData.family_id);
        try {
          const { data: childrenData, error: childrenError } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', profileData.family_id)
            .eq('archived', false);
          
          if (childrenError) {
            // Try without archived filter if that fails
            if (childrenError.code === '400' || childrenError.code === 'PGRST301' || childrenError.code === '42703') {
              const { data: allData } = await supabase
                .from('children')
                .select('*')
                .eq('family_id', profileData.family_id);
              setChildren(allData || []);
            } else {
              console.warn('[WebLayout] Error fetching children:', childrenError);
              setChildren([]);
            }
          } else {
            setChildren(childrenData || []);
          }
          
          // Also fetch subjects for diff modal
          try {
            const { data: subjectsData } = await supabase
              .from('subject')
              .select('id, name')
              .eq('family_id', profileData.family_id)
              .order('name');
            setSubjects(subjectsData || []);
          } catch (subjectsErr) {
            console.warn('[WebLayout] Error fetching subjects:', subjectsErr);
            setSubjects([]);
          }
        } catch (err) {
          console.warn('[WebLayout] Exception fetching children:', err);
          setChildren([]);
        }
      } else {
        setChildren([]);
      }
    } catch (error) {
      console.error('[WebLayout] Unable to load family children', error);
      setChildren([]);
    }
  }, [user]);

  useEffect(() => {
    fetchFamilyMembers();
  }, [fetchFamilyMembers]);

  // Listen for children refresh events
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRefreshChildren = () => {
      fetchFamilyMembers();
    };
    window.addEventListener('refreshChildren', handleRefreshChildren);
    return () => {
      window.removeEventListener('refreshChildren', handleRefreshChildren);
    };
  }, []);

  useEffect(() => {
    // Handle child tabs from sidebar (child-{id})
    if (activeTab && activeTab.startsWith('child-')) {
      const childId = activeTab.replace('child-', '');
      setActiveChildId(childId);
    } else if (activeSubtab) {
      setActiveChildId(activeSubtab);
    } else {
      setActiveChildId(null);
      setActiveChildSection('affirmation');
    }
  }, [activeTab, activeSubtab]);

  useEffect(() => {
    if (activeTab === 'home') {
      setActiveTopNav((prev) => (prev === 'family' ? prev : 'home'));
    } else if (activeTab === 'explore') {
      setActiveTopNav('explore');
    } else if ((activeTab === 'calendar' || activeTab === 'planner') && activeTopNav !== 'family') {
      setActiveTopNav('planner');
    } else if ((activeTab === 'children-list' || (activeTab && activeTab.startsWith('child-'))) && activeChildId) {
      setActiveTopNav('family');
    }
  }, [activeTab, activeChildId, activeTopNav]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => setShowAddChildModal(true);
    window.addEventListener('openAddChildModal', handler);
    return () => window.removeEventListener('openAddChildModal', handler);
  }, []);

  const handleChildAdded = () => {
    fetchFamilyMembers();
  };

  const updateUrlParams = (updates) => {
    if (Platform.OS !== 'web') return;
    const url = new URL(window.location.href);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    window.history.replaceState({}, '', url.toString());
  };

  const handleTabChange = useCallback((tab, subtab = null) => {
    setActiveTab(tab);
    if (typeof subtab !== 'undefined') {
      setActiveSubtab(subtab);
    } else {
      setActiveSubtab(null);
    }
  }, []);

  // Helper to navigate to Intelligence Hub with query params
  const navigateToIntelligence = useCallback((params = {}) => {
    handleTabChange('intelligence');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const queryString = new URLSearchParams(params).toString();
      window.history.replaceState({}, '', `?tab=intelligence&${queryString}`);
    }
  }, [handleTabChange]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => {
      // Navigate to Intelligence Hub → Plan the Year instead
      navigateToIntelligence({ tab: 'planner-ai', tool: 'planYear' });
    };
    window.addEventListener('openYearWizard', handler);
    return () => window.removeEventListener('openYearWizard', handler);
  }, [navigateToIntelligence]);

  // Navigation handler for global search - expose via window for GlobalSearchModal
  const handleSearchNavigate = useCallback((tab, subtab = null, params = {}) => {
    handleTabChange(tab, subtab);
    
    // Handle child section navigation
    if (tab === 'children-list' && params.section) {
      setActiveChildSection(params.section);
    }
    
    if (params.eventId && Platform.OS === 'web') {
      updateUrlParams({ eventId: params.eventId });
    }
    if (params.subjectId && Platform.OS === 'web') {
      updateUrlParams({ subjectId: params.subjectId });
    }
    if (params.section && Platform.OS === 'web') {
      updateUrlParams({ section: params.section });
    }
  }, [handleTabChange]);

  // Expose navigation handler globally for GlobalSearchModal
  useEffect(() => {
    if (Platform.OS === 'web') {
      window.__ldSearchNavigate = handleSearchNavigate;
      return () => {
        delete window.__ldSearchNavigate;
      };
    }
  }, [handleSearchNavigate]);

  const handleTopSelect = useCallback(
    (key) => {
      setActiveTopNav(key);
      switch (key) {
        case 'home':
          handleTabChange('home');
          break;
        case 'explore':
          handleTabChange('explore');
          break;
        case 'planner':
          updateUrlParams({ view: null });
          handleTabChange('planner');
          break;
        case 'materials':
          handleTabChange('materials');
          break;
        case 'records':
          handleTabChange('records');
          break;
        case 'intelligence':
          handleTabChange('intelligence');
          break;
        case 'coach':
          handleTabChange('coach');
          break;
        case 'profile':
          handleTabChange('profile');
          break;
        default:
          handleTabChange('home');
      }
    },
    [handleTabChange]
  );

  const handleChildSelect = useCallback(
    (childId) => {
      setActiveTopNav('family');
      setActiveChildId(childId);
      setActiveChildSection('affirmation');
      handleTabChange(`child-${childId}`);
    },
    [handleTabChange]
  );

  const handleChildSectionSelect = useCallback(
    (childId, section) => {
      setActiveTopNav('family');
      setActiveChildId(childId);
      setActiveChildSection(section);
      const childTabId = `child-${childId}`;
      if (activeTab !== childTabId) {
        handleTabChange(childTabId);
      }
    },
    [activeTab, handleTabChange]
  );

  const handleOpenNewMenu = useCallback((anchor) => {
    if (Platform.OS === 'web') {
      if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
        // Align menu left edge with button left edge for better visual connection
        const offsetX = anchor.x;
        // Position menu directly below the button with minimal gap for visual connection
        const offsetY = anchor.y + (anchor.height ?? 40) + 1; // 1px gap for tight visual connection
        setNewMenuPosition({ x: offsetX, y: offsetY });
      } else {
        const x = Math.max(window.innerWidth - 320, 320);
        setNewMenuPosition({ x, y: 88 });
      }
    }
    setShowNewMenu(true);
  }, []);

  const leftRailTopActive = ['home', 'explore', 'planner', 'materials', 'records', 'intelligence', 'coach', 'profile'].includes(activeTopNav)
    ? activeTopNav
    : null;

  // Clear right tool when switching away from calendar screens
  // Also ensure right tool is closed when planner first opens
  useEffect(() => {
    const prevTab = prevActiveTabRef.current;
    prevActiveTabRef.current = activeTab;
    
    if (activeTab !== 'calendar' && activeTab !== 'planner') {
      setActiveRightTool(null);
      setRightSidebarContent(null);
    } else if (activeTab === 'planner' && prevTab !== 'planner') {
      // Ensure right pane is closed when switching TO planner (not when already on it)
      setActiveRightTool(null);
      setRightSidebarContent(null);
    }
  }, [activeTab]);

  // Update right sidebar content when active tool changes
  useEffect(() => {
    if (activeRightTool) {
      // ToolContent will handle rendering
      setRightSidebarContent(null);
    } else {
      // If no tool is active, clear the right sidebar content
      // WebContent will manage it via onRightSidebarRender
      setRightSidebarContent(null);
    }
  }, [activeRightTool]);

  // Determine if we're on a calendar screen
  const isCalendarScreen = activeTab === 'calendar' || activeTab === 'planner';

  // Show full-screen loading when home tab is loading
  const showFullScreenLoading = activeTab === 'home' && homeLoading;


  return (
    <ToastProvider>
      <FiltersProvider>
        {showFullScreenLoading && (
          <LoadingScreen message="Loading your home" timeout={10000} />
        )}
        <LayoutShell
        left={
          <GeistSidebar
            topActive={leftRailTopActive}
            onSelectTop={handleTopSelect}
            childrenList={children}
            activeChildId={activeChildId}
            activeChildSection={activeChildSection}
            onSelectChild={handleChildSelect}
            onSelectChildSection={handleChildSectionSelect}
            onOpenNew={handleOpenNewMenu}
            onOpenSearch={openSearch}
            onAvatarPress={() => setShowAuthSettings(true)}
            user={user}
            userRole={userRole}
          />
        }
        right={
          isCalendarScreen && (activeRightTool ? (
            <PlannerHealthProvider>
              <ToolContent
              toolKey={activeRightTool}
              familyId={familyId}
              children={children}
              onClose={() => setActiveRightTool(null)}
              onOpenKanban={() => {
                // Navigate to kanban view if needed
                console.log('Open kanban');
              }}
              onScheduleRules={() => {
                setActiveRightTool(activeRightTool === 'schedule_rules' ? null : 'schedule_rules');
              }}
              onBlackouts={() => {
                setActiveRightTool(activeRightTool === 'blackouts' ? null : 'blackouts');
              }}
              onCalendarIntegration={() => {
                setActiveRightTool(activeRightTool === 'calendar' ? null : 'calendar');
              }}
              onWeeklyObjectives={() => {
                setActiveRightTool(activeRightTool === 'objectives' ? null : 'objectives');
              }}
              // Pack Week and Catch Up navigate to Intelligence (keep visible)
              onPackWeek={() => {
                const currentChildOrAll = selectedCalendarChildren && selectedCalendarChildren.length > 0
                  ? selectedCalendarChildren[0]
                  : 'all';
                navigateToIntelligence({
                  tab: 'planner-ai',
                  tool: 'packWeek',
                  child: currentChildOrAll,
                  timeframe: 'thisWeek'
                });
              }}
              onCatchUp={() => {
                const currentChildOrAll = selectedCalendarChildren && selectedCalendarChildren.length > 0
                  ? selectedCalendarChildren[0]
                  : 'all';
                navigateToIntelligence({
                  tab: 'planner-ai',
                  tool: 'catchUp',
                  child: currentChildOrAll,
                  timeframe: 'thisWeek'
                });
              }}
              // Heavy AI tools removed - now only accessible via Intelligence Hub
              onPlanYear={undefined}
              onHeatmap={undefined}
              onSummarizeProgress={undefined}
              onAnalytics={undefined}
              onWhatIfAnalysis={undefined}
            />
            </PlannerHealthProvider>
          ) : rightSidebarContent)
        }
        rightToolbar={
          isCalendarScreen ? (
            <RightToolbar
              onTasks={() => {
                setActiveRightTool(activeRightTool === 'tasks' ? null : 'tasks');
              }}
              onBacklog={() => {
                setActiveRightTool(activeRightTool === 'backlog' ? null : 'backlog');
              }}
              onScheduleRules={() => {
                setActiveRightTool(activeRightTool === 'schedule_rules' ? null : 'schedule_rules');
              }}
              onBlackouts={() => {
                setActiveRightTool(activeRightTool === 'blackouts' ? null : 'blackouts');
              }}
              onCalendarIntegration={() => {
                setActiveRightTool(activeRightTool === 'calendar' ? null : 'calendar');
              }}
              onWeeklyObjectives={() => {
                setActiveRightTool(activeRightTool === 'objectives' ? null : 'objectives');
              }}
              onSearch={() => {
                setActiveRightTool(activeRightTool === 'search' ? null : 'search');
              }}
              onCompleted={() => {
                setActiveRightTool(activeRightTool === 'completed' ? null : 'completed');
              }}
              onRebalance={() => {
                setActiveRightTool(activeRightTool === 'rebalance' ? null : 'rebalance');
              }}
              onHealth={() => {
                setActiveRightTool(activeRightTool === 'health' ? null : 'health');
              }}
              onWhatIfAnalysis={() => {
                setActiveRightTool(activeRightTool === 'whatif' ? null : 'whatif');
              }}
              // Pack Week and Catch Up navigate to Intelligence (keep visible)
              onPackWeek={() => {
                // Get current child filter from WebContent's selectedCalendarChildren
                // For now, default to 'all' - WebContent will pass this via props if needed
                navigateToIntelligence({
                  tab: 'planner-ai',
                  tool: 'packWeek',
                  child: 'all',
                  timeframe: 'thisWeek'
                });
              }}
              onCatchUp={() => {
                navigateToIntelligence({
                  tab: 'planner-ai',
                  tool: 'catchUp',
                  child: 'all',
                  timeframe: 'thisWeek'
                });
              }}
              // Heavy AI tools removed - now only accessible via Intelligence Hub
              onPlanYear={undefined}
              onHeatmap={undefined}
              onSummarizeProgress={undefined}
              onWhatIfAnalysis={undefined}
              onAnalytics={undefined}
              onSettings={() => {
                setShowSettingsModal(true);
              }}
              onAITools={() => {
                setShowAIToolsModal(true);
              }}
              activeTool={activeRightTool}
            />
          ) : null
        }
        fullWidth={activeTab === 'planner' || activeTab === 'calendar-planning'}
      >
        <WebContent
          activeTab={activeTab}
          activeSubtab={activeSubtab}
          activeChildSection={activeChildSection}
          user={user}
          onChildAdded={handleChildAdded}
          navigation={navigation}
          showSyllabusUpload={showSyllabusUpload}
          onSyllabusProcessed={(data) => {
            console.log('Syllabus processed:', data);
            setShowSyllabusUpload(false);
          }}
          onCloseSyllabusUpload={() => setShowSyllabusUpload(false)}
          onTabChange={handleTabChange}
          onSubtabChange={setActiveSubtab}
          pendingDoodlePrompt={null}
          onHomeLoadingChange={setHomeLoading}
          onConsumeDoodlePrompt={() => {}}
          showAddChildModal={showAddChildModal}
          onCloseAddChildModal={() => setShowAddChildModal(false)}
          showAddSubjectModal={showAddSubjectModal}
          onCloseAddSubjectModal={() => setShowAddSubjectModal(false)}
          onRightSidebarRender={setRightSidebarContent}
          onOpenSettings={(section = 'profile') => {
            setSettingsInitialSection(section);
            setShowAuthSettings(true);
          }}
          onEditChild={(child) => {
            setEditingChild(child);
            setShowEditChildModal(true);
          }}
          onAddSyllabus={() => setShowSyllabusUpload(true)}
        />
      </LayoutShell>

      <SettingsModal
        visible={showAuthSettings}
        onClose={() => {
          setShowAuthSettings(false);
          setSettingsInitialSection('profile'); // Reset to default when closing
        }}
        user={user}
        initialSection={settingsInitialSection}
      />

      {/* Doodle bot search modal - only opened via floating icon */}
      {showDoodleSearchModal && (
        <SearchModal visible={showDoodleSearchModal} onClose={() => setShowDoodleSearchModal(false)} />
      )}

      <GlobalNewMenu
        visible={showNewMenu}
        onClose={() => setShowNewMenu(false)}
        position={newMenuPosition}
        currentContext={activeTab}
        onAddChild={() => setShowAddChildModal(true)}
        onAddSubject={() => setShowAddSubjectModal(true)}
        onAddActivity={() => {
          setTaskModalDate(new Date());
          setShowTaskModal(true);
          setShowNewMenu(false);
        }}
        onAddSyllabus={() => setShowSyllabusUpload(true)}
        onAIGenerate={() => setShowAIToolsModal(true)}
      />

      {/* Year Planning Wizard - Now handled by IntelligenceHub */}
      {/* Removed: PlanYearWizard instance - use IntelligenceHub → Planner AI → Plan the Year */}

      {/* Global Task Create Modal - available from any screen */}
      <TaskCreateModal
        visible={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        defaultDate={taskModalDate}
        familyId={familyId}
        familyMembers={children.map(child => ({
          id: child.id,
          name: child.first_name || child.name || 'Unknown',
          role: 'child'
        }))}
        lists={[
          { id: 'inbox', name: 'Inbox' },
          ...children.map(child => ({
            id: `child:${child.id}`,
            name: child.first_name || child.name || 'Unknown'
          }))
        ]}
        onCreated={async (task) => {
          // Refresh calendar data if we're on a calendar screen
          if (activeTab === 'calendar' || activeTab === 'planner') {
            // Trigger a refresh by changing and changing back the tab
            // Or we could emit an event that WebContent listens to
            if (Platform.OS === 'web') {
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
          }
        }}
      />

      {/* AI Modals - Now handled by IntelligenceHub */}
      {/* Removed: SummarizeProgressModal, PackWeekModal, CatchUpModal instances */}
      {/* These are now accessible via IntelligenceHub → Planner AI tab */}
      
      {/* Analytics Dashboard Modal */}
      {showAnalyticsDashboard && (
        <View style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            width: '90%',
            maxWidth: 1000,
            height: '90%',
            backgroundColor: '#ffffff',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <AnalyticsDashboard
              familyId={familyId}
              childId={activeChildId}
              children={children}
              onClose={() => setShowAnalyticsDashboard(false)}
              onShowReport={() => {
                setShowAnalyticsDashboard(false);
                setShowProgressReport(true);
              }}
            />
          </View>
        </View>
      )}
      
      {/* Progress Report Modal */}
      {showProgressReport && (
        <View style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            width: '90%',
            maxWidth: 1000,
            height: '90%',
            backgroundColor: '#ffffff',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <ProgressReport
              familyId={familyId}
              childId={activeChildId}
              children={children}
              onClose={() => setShowProgressReport(false)}
            />
          </View>
        </View>
      )}

      <ScheduleSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        familyId={familyId}
        children={children}
        onOpenFullEditor={({ scope, childId }) => {
          setShowSettingsModal(false);
          setActiveRightTool('schedule_rules');
          // ensure right toolbar knows which scope? we only set active filter?
        }}
      />

      {/* Add Subject Modal - Global Access */}
      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => setShowAddSubjectModal(false)}
        onSubjectAdded={() => {
          // Refresh subjects if needed
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
          }
        }}
        familyId={familyId}
      />

      <AIToolsModal
        visible={showAIToolsModal}
        onClose={() => setShowAIToolsModal(false)}
        familyId={familyId}
        children={children}
        // All AI tools now navigate to Intelligence Hub
        onPlanYear={() => {
          setShowAIToolsModal(false);
          navigateToIntelligence({ tab: 'planner-ai', tool: 'planYear' });
        }}
        onHeatmap={() => {
          setShowAIToolsModal(false);
          navigateToIntelligence({ tab: 'analytics' });
        }}
        onPackWeek={() => {
          setShowAIToolsModal(false);
          navigateToIntelligence({ tab: 'planner-ai', tool: 'packWeek', timeframe: 'thisWeek' });
        }}
        onCatchUp={() => {
          setShowAIToolsModal(false);
          navigateToIntelligence({ tab: 'planner-ai', tool: 'catchUp', timeframe: 'thisWeek' });
        }}
        onSummarizeProgress={() => {
          setShowAIToolsModal(false);
          navigateToIntelligence({ tab: 'insights', tool: 'summarize' });
        }}
        onAnalytics={() => {
          setShowAIToolsModal(false);
          navigateToIntelligence({ tab: 'analytics' });
        }}
        onWhatIfAnalysis={() => {
          setShowAIToolsModal(false);
          navigateToIntelligence({ tab: 'planner-ai', tool: 'whatIf' });
        }}
      />

      {/* Edit Child Modal */}
      <EditChildModal
        visible={showEditChildModal}
        onClose={() => {
          setShowEditChildModal(false);
          setEditingChild(null);
        }}
        child={editingChild}
        familyId={familyId}
        onChildUpdated={(updatedChild) => {
          // Refresh children list
          fetchFamilyMembers();
          // Dispatch global event to refresh children in other components
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshChildren'));
          }
        }}
        onChildDeleted={() => {
          // Refresh children list
          fetchFamilyMembers();
          // Dispatch global event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshChildren'));
          }
          // Navigate away if we're on the deleted child's page
          if (activeTab && activeTab.startsWith('child-') && editingChild) {
            const childId = activeTab.replace('child-', '');
            if (childId === editingChild.id) {
              handleTabChange('children-list');
            }
          }
        }}
      />

      {/* Syllabus Upload Modal */}
      <SyllabusUpload
        visible={showSyllabusUpload}
        onClose={() => setShowSyllabusUpload(false)}
        onSyllabusProcessed={(data) => {
          console.log('Syllabus processed:', data);
          setShowSyllabusUpload(false);
          // Refresh calendar and other data if needed
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
            window.dispatchEvent(new CustomEvent('refreshSyllabi'));
          }
        }}
        child={activeTab && activeTab.startsWith('child-') ? children.find(c => c.id === activeTab.replace('child-', '')) : null}
        familyId={familyId}
      />
      </FiltersProvider>
      
      {/* Planner Diff Modal */}
      <PlannerDiffProvider>
        <PlannerDiffModal
          children={children}
          subjects={subjects}
          onAccept={() => {
            // Refresh calendar after accepting changes
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
              window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
            }
          }}
          onUndoComplete={() => {
            // Refresh after undoing
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
              window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
            }
          }}
        />
      </PlannerDiffProvider>
      
      {/* Constraints Provider */}
      <ConstraintsProvider>
        {/* Constraints timeline is rendered in PlannerWeek */}
      </ConstraintsProvider>
    </ToastProvider>
  );
}