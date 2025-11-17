import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import WeeklyTemplateEditor from './WeeklyTemplateEditor';
import OverridesDrawer from './OverridesDrawer';
import PreviewHeatmap from './PreviewHeatmap';
import ConflictsList from './ConflictsList';

const ScheduleRulesManager = ({ visible, onClose, familyId, children }) => {
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
    if (visible && familyId) {
      loadCascadeSetting();
      loadRules();
      loadOverrides();
      loadPreviewData();
    }
  }, [visible, familyId, selectedScope, selectedChildId]);

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
        console.error('Error details:', { code: error.code, message: error.message, details: error.details });
        // For now, set empty array to prevent UI errors
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
        // For now, set empty array to prevent UI errors
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

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Schedule Rules Manager</Text>
          <View style={styles.headerActions}>
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
            </View>
            <TouchableOpacity 
              onPress={onClose}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>×</Text>
            </TouchableOpacity>
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
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={true}>
          {renderTabContent()}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    width: '90%',
    maxWidth: 600,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cascadeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cascadeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
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
  modalCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '400',
  },
  modalContent: {
    padding: 16,
    paddingBottom: 80,
    backgroundColor: '#ffffff',
  },
  modalScroll: {
    flex: 1,
    overflow: 'auto',
  },
  scopeSwitcher: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
    flexShrink: 0,
  },
  scopeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  scopeButtonTextActive: {
    color: '#1e40af',
  },
  tabNavigation: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#3b82f6',
  },
  previewContainer: {
    padding: 12,
  },
});

export default ScheduleRulesManager;