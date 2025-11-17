import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import RightToolbar from './RightToolbar';
import ToolContent from './ToolContent';
import TaskCreateModal from './TaskCreateModal';
import PlanYearWizard from './year/PlanYearWizard';
import SummarizeProgressModal from './ai/SummarizeProgressModal';
import PackWeekModal from './ai/PackWeekModal';
import CatchUpModal from './ai/CatchUpModal';
import AnalyticsDashboard from './analytics/AnalyticsDashboard';
import ProgressReport from './analytics/ProgressReport';
import PlannerSettingsModal from './PlannerSettingsModal';
import AIToolsModal from './AIToolsModal';
import { ToastProvider } from './Toast';
import { supabase } from '../lib/supabase';

export default function WebLayout({ navigation, routeParams }) {
  const { user } = useAuth();
  const { openSearch } = useGlobalSearch();
  const [activeTab, setActiveTab] = useState('home');
  const [activeSubtab, setActiveSubtab] = useState(null);
  const [activeTopNav, setActiveTopNav] = useState('home');
  const [activeChildId, setActiveChildId] = useState(null);
  const [activeChildSection, setActiveChildSection] = useState('overview');
  const [showSyllabusUpload, setShowSyllabusUpload] = useState(false);
  const [showAuthSettings, setShowAuthSettings] = useState(false);
  const [showDoodleSearchModal, setShowDoodleSearchModal] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskModalDate, setTaskModalDate] = useState(new Date());
  const [newMenuPosition, setNewMenuPosition] = useState({ x: 320, y: 88 });
  const [children, setChildren] = useState([]);
  const [familyId, setFamilyId] = useState(null);
  const [rightSidebarContent, setRightSidebarContent] = useState(null);
  const [activeRightTool, setActiveRightTool] = useState(null);
  const [showYearWizard, setShowYearWizard] = useState(false);
  const [showSummarizeProgressModal, setShowSummarizeProgressModal] = useState(false);
  const [showPackWeekModal, setShowPackWeekModal] = useState(false);
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);
  const [showAnalyticsDashboard, setShowAnalyticsDashboard] = useState(false);
  const [showProgressReport, setShowProgressReport] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAIToolsModal, setShowAIToolsModal] = useState(false);
  const [userRole, setUserRole] = useState(null);
  
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
        if (!meError && meData) {
          setUserRole(meData.role || 'parent');
        } else {
          // Fallback: get from profile
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          if (profileData) {
            setUserRole(profileData.role || 'parent');
          }
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        setUserRole('parent'); // Default fallback
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
        const { data: childrenData } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', profileData.family_id)
          .eq('archived', false);
        setChildren(childrenData || []);
      } else {
        setChildren([]);
      }
    } catch (error) {
      console.error('Unable to load family children', error);
    }
  }, [user]);

  useEffect(() => {
    fetchFamilyMembers();
  }, [fetchFamilyMembers]);

  useEffect(() => {
    if (activeSubtab) {
      setActiveChildId(activeSubtab);
    } else {
      setActiveChildId(null);
      setActiveChildSection('overview');
    }
  }, [activeSubtab]);

  useEffect(() => {
    if (activeTab === 'home') {
      setActiveTopNav((prev) => (prev === 'family' ? prev : 'home'));
    } else if (activeTab === 'explore') {
      setActiveTopNav('explore');
    } else if ((activeTab === 'calendar' || activeTab === 'planner' || activeTab === 'ai-planner') && activeTopNav !== 'family') {
      setActiveTopNav('planner');
    } else if (activeTab === 'children-list' && activeChildId) {
      setActiveTopNav('family');
    }
  }, [activeTab, activeChildId, activeTopNav]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => setShowAddChildModal(true);
    window.addEventListener('openAddChildModal', handler);
    return () => window.removeEventListener('openAddChildModal', handler);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => setShowYearWizard(true);
    window.addEventListener('openYearWizard', handler);
    return () => window.removeEventListener('openYearWizard', handler);
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

  const handleTabChange = (tab, subtab = null) => {
    setActiveTab(tab);
    if (typeof subtab !== 'undefined') {
      setActiveSubtab(subtab);
    } else {
      setActiveSubtab(null);
    }
  };

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
        case 'records':
          handleTabChange('records');
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
      setActiveChildSection('overview');
      handleTabChange('children-list', childId);
    },
    [handleTabChange]
  );

  const handleChildSectionSelect = useCallback(
    (childId, section) => {
      setActiveTopNav('family');
      setActiveChildId(childId);
      setActiveChildSection(section);
      if (activeTab !== 'children-list' || activeSubtab !== childId) {
        handleTabChange('children-list', childId);
      }
    },
    [activeTab, activeSubtab, handleTabChange]
  );

  const handleOpenNewMenu = useCallback((anchor) => {
    if (Platform.OS === 'web') {
      if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
        const offsetX = anchor.x + 16;
        const offsetY = anchor.y + (anchor.height ?? 0) / 2;
        setNewMenuPosition({ x: offsetX, y: offsetY });
      } else {
        const x = Math.max(window.innerWidth - 320, 320);
        setNewMenuPosition({ x, y: 88 });
      }
    }
    setShowNewMenu(true);
  }, []);

  const leftRailTopActive = ['home', 'explore', 'planner', 'records'].includes(activeTopNav)
    ? activeTopNav
    : null;

  // Clear right tool when switching away from calendar screens
  useEffect(() => {
    if (activeTab !== 'calendar' && activeTab !== 'planner' && activeTab !== 'ai-planner') {
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
  const isCalendarScreen = activeTab === 'calendar' || activeTab === 'planner' || activeTab === 'ai-planner';

  return (
    <ToastProvider>
      <FiltersProvider>
        <LayoutShell
        left={
          <LeftRail
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
              onPlanYear={() => {
                setShowYearWizard(true);
              }}
              onHeatmap={() => {
                setActiveRightTool(activeRightTool === 'heatmap' ? null : 'heatmap');
              }}
              onPackWeek={() => {
                setShowPackWeekModal(true);
              }}
              onCatchUp={() => {
                setShowCatchUpModal(true);
              }}
              onSummarizeProgress={() => {
                setShowSummarizeProgressModal(true);
              }}
              onAnalytics={() => {
                setShowAnalyticsDashboard(true);
              }}
              onWhatIfAnalysis={() => {
                setActiveRightTool(activeRightTool === 'whatif' ? null : 'whatif');
              }}
            />
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
              onWhatIfAnalysis={() => {
                setActiveRightTool(activeRightTool === 'whatif' ? null : 'whatif');
              }}
              onPlanYear={() => {
                setShowYearWizard(true);
              }}
              onHeatmap={() => {
                setActiveRightTool(activeRightTool === 'heatmap' ? null : 'heatmap');
              }}
              onPackWeek={() => {
                setShowPackWeekModal(true);
              }}
              onCatchUp={() => {
                setShowCatchUpModal(true);
              }}
              onSummarizeProgress={() => {
                setShowSummarizeProgressModal(true);
              }}
              onAnalytics={() => {
                setShowAnalyticsDashboard(true);
              }}
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
          onConsumeDoodlePrompt={() => {}}
          showAddChildModal={showAddChildModal}
          onCloseAddChildModal={() => setShowAddChildModal(false)}
          onRightSidebarRender={setRightSidebarContent}
        />
      </LayoutShell>

      <SettingsModal
        visible={showAuthSettings}
        onClose={() => setShowAuthSettings(false)}
        user={user}
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
        onAddActivity={() => {
          setTaskModalDate(new Date());
          setShowTaskModal(true);
          setShowNewMenu(false);
        }}
        onAddLessonPlan={() => {
          if (Platform.OS === 'web') window.alert('Add lesson plan coming soon!');
        }}
        onAddSyllabus={() => setShowSyllabusUpload(true)}
        onAddAttendance={() => {
          if (Platform.OS === 'web') window.alert('Add attendance coming soon!');
        }}
        onCopyFromTemplate={() => {
          if (Platform.OS === 'web') window.alert('Copy from template coming soon!');
        }}
        onImportFromFile={() => {
          if (Platform.OS === 'web') window.alert('Import from file coming soon!');
        }}
        onAIGenerate={() => handleTabChange('ai-planner')}
        onPlanYear={() => setShowYearWizard(true)}
      />

      {/* Year Planning Wizard */}
      <PlanYearWizard
        familyId={familyId}
        children={children}
        visible={showYearWizard}
        onClose={() => setShowYearWizard(false)}
        onComplete={(yearPlan) => {
          console.log('Year plan created:', yearPlan);
          setShowYearWizard(false);
          // Refresh calendar data after year plan creation
          if (Platform.OS === 'web') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
            // Also switch to calendar tab if not already there
            if (activeTab !== 'calendar' && activeTab !== 'planner') {
              setActiveTab('calendar');
            }
          }
        }}
      />

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
          if (activeTab === 'calendar' || activeTab === 'planner' || activeTab === 'ai-planner') {
            // Trigger a refresh by changing and changing back the tab
            // Or we could emit an event that WebContent listens to
            if (Platform.OS === 'web') {
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
          }
        }}
      />

      {/* AI Modals */}
      <SummarizeProgressModal
        visible={showSummarizeProgressModal}
        familyId={familyId}
        onClose={() => setShowSummarizeProgressModal(false)}
      />
      
      <PackWeekModal
        visible={showPackWeekModal}
        familyId={familyId}
        children={children}
        onClose={() => setShowPackWeekModal(false)}
      />
      
      <CatchUpModal
        visible={showCatchUpModal}
        familyId={familyId}
        onClose={() => setShowCatchUpModal(false)}
      />
      
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

      <PlannerSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        familyId={familyId}
        children={children}
      />

      <AIToolsModal
        visible={showAIToolsModal}
        onClose={() => setShowAIToolsModal(false)}
        familyId={familyId}
        children={children}
        onPlanYear={() => {
          setShowAIToolsModal(false);
          setShowYearWizard(true);
        }}
        onHeatmap={() => {
          setShowAIToolsModal(false);
          setActiveRightTool(activeRightTool === 'heatmap' ? null : 'heatmap');
        }}
        onPackWeek={() => {
          setShowPackWeekModal(true);
        }}
        onCatchUp={() => {
          setShowCatchUpModal(true);
        }}
        onSummarizeProgress={() => {
          setShowSummarizeProgressModal(true);
        }}
        onAnalytics={() => {
          setShowAnalyticsDashboard(true);
        }}
        onWhatIfAnalysis={() => {
          setShowAIToolsModal(false);
          setActiveRightTool(activeRightTool === 'whatif' ? null : 'whatif');
        }}
      />
      </FiltersProvider>
    </ToastProvider>
  );
}