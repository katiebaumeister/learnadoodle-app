import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import WeeklyTemplateEditor from './WeeklyTemplateEditor';
import OverridesDrawer from './OverridesDrawer';
import PreviewHeatmap from './PreviewHeatmap';
import ConflictsList from './ConflictsList';
import PageHeader from './PageHeader';
import { Download } from 'lucide-react';

/**
 * Full-screen Schedule Rules management view
 * Replaces the modal version with a dedicated page
 */
const ScheduleRulesView = ({ familyId, children, hideHeader = false }) => {
  const [activeTab, setActiveTab] = useState('rules'); // 'rules', 'overrides', 'preview'
  const [rules, setRules] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedScope, setSelectedScope] = useState('family');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [specificityCascade, setSpecificityCascade] = useState(false);

  // Load data when component mounts or scope changes
  useEffect(() => {
    if (familyId) {
      loadCascadeSetting();
      loadRules();
      loadOverrides();
      loadPreviewData();
    }
  }, [familyId, selectedScope, selectedChildId]);

  const loadCascadeSetting = async () => {
    try {
      const { data, error } = await supabase
        .from('family_settings')
        .select('specificity_cascade')
        .eq('family_id', familyId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('Error loading cascade setting:', error);
        return;
      }

      setSpecificityCascade(data?.specificity_cascade || false);
    } catch (error) {
      console.error('Error loading cascade setting:', error);
    }
  };

  const handleCascadeToggle = async (newValue) => {
    try {
      const { error } = await supabase.rpc('set_specificity_cascade', {
        p_family: familyId,
        p_value: newValue,
      });

      if (error) throw error;

      setSpecificityCascade(newValue);

      // Refresh cache for next 14 days
      const fromDate = new Date();
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 14);

      await supabase.rpc('refresh_calendar_days_cache', {
        p_family_id: familyId,
        p_from_date: fromDate.toISOString().split('T')[0],
        p_to_date: toDate.toISOString().split('T')[0],
      });

      // Reload preview data
      loadPreviewData();
      
      showAlert('Success', 'Specificity policy updated');
    } catch (error) {
      console.error('Error toggling cascade:', error);
      showAlert('Error', 'Failed to update specificity policy');
    }
  };

  const loadRules = async () => {
    try {
      setLoading(true);
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      
      console.log('Loading rules for:', { selectedScope, scopeId, familyId, selectedChildId });
      
      const { data, error } = await supabase
        .from('schedule_rules')
        .select('*')
        .eq('scope_type', selectedScope)
        .eq('scope_id', scopeId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading rules:', error);
        setRules([]);
        return;
      }
      
      console.log('Loaded rules:', data);
      setRules(data || []);
    } catch (error) {
      console.error('Error loading rules:', error);
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOverrides = async () => {
    try {
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      const fromDate = new Date();
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 30); // Next 30 days

      const { data, error } = await supabase
        .from('schedule_overrides')
        .select('*')
        .eq('scope_type', selectedScope)
        .eq('scope_id', scopeId)
        .eq('is_active', true)
        .gte('date', fromDate.toISOString().split('T')[0])
        .lte('date', toDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) {
        console.log('Error loading overrides:', error);
        setOverrides([]);
        return;
      }
      setOverrides(data || []);
    } catch (error) {
      console.error('Error loading overrides:', error);
    }
  };

  const loadPreviewData = async () => {
    try {
      if (selectedScope === 'child' && selectedChildId) {
        const fromDate = new Date();
        const toDate = new Date();
        toDate.setDate(toDate.getDate() + 14); // Next 14 days

        // Call our availability API function
        const { data, error } = await supabase
          .rpc('get_child_availability', {
            p_child_id: selectedChildId,
            p_from_date: fromDate.toISOString().split('T')[0],
            p_to_date: toDate.toISOString().split('T')[0]
          });

        if (error) throw error;
        setPreviewData(data || []);
      }
    } catch (error) {
      console.error('Error loading preview data:', error);
    }
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleRuleSaved = () => {
    loadRules();
    loadPreviewData();
    showAlert('Success', 'Schedule rule saved successfully');
  };

  const handleOverrideSaved = () => {
    loadOverrides();
    loadPreviewData();
    showAlert('Success', 'Override saved successfully');
  };

  const handleConflictResolved = () => {
    loadPreviewData();
    setConflicts([]);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'rules':
        return (
          <WeeklyTemplateEditor
            familyId={familyId}
            children={children}
            selectedScope={selectedScope}
            selectedChildId={selectedChildId}
            onScopeChange={(scope, childId) => {
              setSelectedScope(scope);
              setSelectedChildId(childId);
            }}
            onRuleSaved={handleRuleSaved}
            existingRules={rules}
          />
        );
      
      case 'overrides':
        return (
          <OverridesDrawer
            familyId={familyId}
            children={children}
            selectedScope={selectedScope}
            selectedChildId={selectedChildId}
            onScopeChange={(scope, childId) => {
              setSelectedScope(scope);
              setSelectedChildId(childId);
            }}
            onOverrideSaved={handleOverrideSaved}
            existingOverrides={overrides}
          />
        );
      
      case 'preview':
        return (
          <View style={styles.previewContainer}>
            <PreviewHeatmap
              previewData={previewData}
              selectedChildId={selectedChildId}
              selectedScope={selectedScope}
            />
            {conflicts.length > 0 && (
              <ConflictsList
                conflicts={conflicts}
                onConflictResolved={handleConflictResolved}
                familyId={familyId}
              />
            )}
          </View>
        );
      
      default:
        return null;
    }
  };

  if (!familyId) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Loading...</Text>
          <Text style={styles.emptyStateText}>Please wait while we load your schedule rules.</Text>
        </View>
      </View>
    );
  }

  const scheduleActions = [
    {
      label: 'Export Rules',
      icon: Download,
      onPress: () => {
        if (Platform.OS === 'web') {
          window.alert('Export rules coming soon!');
        }
      }
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      {!hideHeader && (
        <PageHeader
          title="Schedule Rules Manager"
          subtitle="Set teaching hours and scheduling constraints"
          actions={scheduleActions}
        />
      )}

      {/* Specificity Cascade Toggle */}
      <View style={styles.cascadeContainer}>
        <View style={styles.cascadeToggle}>
          <Text style={styles.cascadeLabel}>Specificity Cascade</Text>
          <TouchableOpacity
            style={[
              styles.toggleSwitch,
              specificityCascade && styles.toggleSwitchActive
            ]}
            onPress={() => handleCascadeToggle(!specificityCascade)}
          >
            <View style={[
              styles.toggleThumb,
              specificityCascade && styles.toggleThumbActive
            ]} />
          </TouchableOpacity>
          <Text style={styles.cascadeHelper}>
            {specificityCascade 
              ? "Child rules override family rules" 
              : "All rules use Add-Remove math"}
          </Text>
        </View>
      </View>

      {/* Scope Switcher */}
      <View style={styles.scopeSwitcher}>
        <TouchableOpacity
          style={[
            styles.scopeButton,
            selectedScope === 'family' && styles.scopeButtonActive
          ]}
          onPress={() => {
            setSelectedScope('family');
            setSelectedChildId(null);
          }}
        >
          <Text style={[
            styles.scopeButtonText,
            selectedScope === 'family' && styles.scopeButtonTextActive
          ]}>
            Family
          </Text>
        </TouchableOpacity>
        
        {children.map(child => (
          <TouchableOpacity
            key={child.id}
            style={[
              styles.scopeButton,
              selectedScope === 'child' && selectedChildId === child.id && styles.scopeButtonActive
            ]}
            onPress={() => {
              setSelectedScope('child');
              setSelectedChildId(child.id);
            }}
          >
            <Text style={[
              styles.scopeButtonText,
              selectedScope === 'child' && selectedChildId === child.id && styles.scopeButtonTextActive
            ]}>
              {child.first_name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabNavigation}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rules' && styles.tabActive]}
          onPress={() => setActiveTab('rules')}
        >
          <Text style={[styles.tabText, activeTab === 'rules' && styles.tabTextActive]}>
            Weekly Rules
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overrides' && styles.tabActive]}
          onPress={() => setActiveTab('overrides')}
        >
          <Text style={[styles.tabText, activeTab === 'overrides' && styles.tabTextActive]}>
            Overrides
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'preview' && styles.tabActive]}
          onPress={() => setActiveTab('preview')}
        >
          <Text style={[styles.tabText, activeTab === 'preview' && styles.tabTextActive]}>
            Preview
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.contentScroll} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        {renderTabContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  cascadeContainer: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
    backgroundColor: '#f9fafb',
  },
  cascadeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cascadeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  toggleSwitch: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e1e5e9',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: '#3b82f6',
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    marginLeft: 18,
  },
  cascadeHelper: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  scopeSwitcher: {
    flexDirection: 'row',
    paddingHorizontal: 32,
    paddingVertical: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  scopeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  scopeButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  scopeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  scopeButtonTextActive: {
    color: '#1e40af',
  },
  tabNavigation: {
    flexDirection: 'row',
    paddingHorizontal: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  tab: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#3b82f6',
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 32,
    paddingBottom: 80,
  },
  previewContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default ScheduleRulesView;

