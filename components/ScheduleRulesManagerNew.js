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
  Switch,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, shadows } from '../theme/colors';
import { X, Plus, Calendar, Clock, Users, Settings } from 'lucide-react';

const ScheduleRulesManager = ({ visible, onClose, familyId, children }) => {
  const [activeTab, setActiveTab] = useState('rules'); // 'rules', 'overrides', 'preview'
  const [rules, setRules] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedScope, setSelectedScope] = useState('family');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [specificityCascade, setSpecificityCascade] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load data when component mounts or scope changes
  useEffect(() => {
    if (visible && familyId) {
      loadRules();
      loadOverrides();
      loadPreviewData();
      loadFamilySettings();
    }
  }, [visible, familyId, selectedScope, selectedChildId]);

  const loadFamilySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('family_settings')
        .select('specificity_cascade')
        .eq('family_id', familyId)
        .maybeSingle();
      
      if (!error && data) {
        setSpecificityCascade(data.specificity_cascade);
      }
    } catch (error) {
      console.error('Error loading family settings:', error);
    }
  };

  const loadRules = async () => {
    try {
      setLoading(true);
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      
      const { data, error } = await supabase
        .from('schedule_rules')
        .select('*')
        .eq('scope_type', selectedScope)
        .eq('scope_id', scopeId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false }); // Order by latest updated instead of priority

      if (error) {
        console.error('Error loading rules:', error);
        setRules([]);
        return;
      }
      
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
      if (!selectedChildId) return;
      
      const fromDate = new Date();
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 7); // Next 7 days

      const { data, error } = await supabase.rpc('get_child_availability', {
        _child: selectedChildId,
        _from: fromDate.toISOString().split('T')[0],
        _to: toDate.toISOString().split('T')[0]
      });

      if (error) {
        console.error('Error loading preview data:', error);
        setPreviewData([]);
        return;
      }
      
      setPreviewData(data || []);
    } catch (error) {
      console.error('Error loading preview data:', error);
    }
  };

  const saveCascadeToggle = async (next) => {
    setSpecificityCascade(next);
    const { error } = await supabase.rpc('set_specificity_cascade', { 
      p_family: familyId, 
      p_value: next 
    });
    
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Specificity cascade updated');
      // Recompute cache so preview reflects new precedence
      await refreshCache();
    }
  };

  const refreshCache = async () => {
    try {
      const fromDate = new Date();
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 60); // Next 60 days

      await supabase.rpc('refresh_calendar_days_cache', {
        p_family_id: familyId,
        p_from_date: fromDate.toISOString().split('T')[0],
        p_to_date: toDate.toISOString().split('T')[0]
      });
      
      // Reload preview data
      loadPreviewData();
    } catch (error) {
      console.error('Error refreshing cache:', error);
    }
  };

  const softCheckWarnings = async () => {
    try {
      const { data, error } = await supabase.rpc('detect_rule_conflicts', { 
        _family: familyId 
      });
      
      if (error) return { warnings: [], error };
      
      // Simple warning logic - if any rules are masked, warn
      const warnings = [];
      if (data && data.length > 0) {
        const maskedRules = data.filter(rule => rule.masked_minutes > 0);
        if (maskedRules.length > 0) {
          warnings.push(`${maskedRules.length} rule(s) have time that may be masked by Off rules`);
        }
      }
      
      return { warnings, error: null };
    } catch (error) {
      return { warnings: [], error };
    }
  };

  const renderHeader = () => (
    <View style={styles.modalHeader}>
      <View style={styles.headerContent}>
        <Text style={styles.modalTitle}>Schedule Rules Manager</Text>
        <Text style={styles.modalSubtitle}>
          Set teaching hours and off times. Add–Remove math is active.
        </Text>
      </View>
      
      <View style={styles.headerActions}>
        <View style={styles.cascadeToggle}>
          <Text style={styles.cascadeLabel}>Specificity Cascade</Text>
          <Switch
            value={specificityCascade}
            onValueChange={saveCascadeToggle}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={specificityCascade ? colors.accentContrast : colors.muted}
          />
        </View>
        
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
        >
          <X size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTabNavigation = () => (
    <View style={styles.tabNavigation}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'rules' && styles.activeTab]}
        onPress={() => setActiveTab('rules')}
      >
        <Text style={[styles.tabText, activeTab === 'rules' && styles.activeTabText]}>
          Weekly Rules
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.tab, activeTab === 'overrides' && styles.activeTab]}
        onPress={() => setActiveTab('overrides')}
      >
        <Text style={[styles.tabText, activeTab === 'overrides' && styles.activeTabText]}>
          Overrides
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.tab, activeTab === 'preview' && styles.activeTab]}
        onPress={() => setActiveTab('preview')}
      >
        <Text style={[styles.tabText, activeTab === 'preview' && styles.activeTabText]}>
          Preview
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderRulesTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.rulesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Add-Remove Rules</Text>
          <Text style={styles.sectionDescription}>
            "Teach" rules add available time. "Off" rules block time. 
            {specificityCascade && ' Specificity Cascade: Child > Family, Off > Teach, latest wins.'}
          </Text>
        </View>

        <View style={styles.rulesList}>
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onUpdate={loadRules}
              onDelete={loadRules}
            />
          ))}
          
          {rules.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No rules yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Add rules to define when teaching happens
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.addRuleButton}
          onPress={() => {/* TODO: Open add rule modal */}}
        >
          <Plus size={16} color={colors.accent} />
          <Text style={styles.addRuleButtonText}>Add Rule</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderOverridesTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.overridesSection}>
        <Text style={styles.sectionTitle}>One-Time Changes</Text>
        <Text style={styles.sectionDescription}>
          Overrides apply after Add-Remove math and always take precedence.
        </Text>
        
        <View style={styles.overridesList}>
          {overrides.map((override) => (
            <OverrideCard
              key={override.id}
              override={override}
              onUpdate={loadOverrides}
              onDelete={loadOverrides}
            />
          ))}
          
          {overrides.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No overrides</Text>
              <Text style={styles.emptyStateSubtext}>
                Add overrides for one-time schedule changes
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );

  const renderPreviewTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.previewSection}>
        <Text style={styles.sectionTitle}>Availability Preview</Text>
        <Text style={styles.sectionDescription}>
          Shows effective availability after Add-Remove math and overrides.
        </Text>
        
        {previewData && previewData.length > 0 ? (
          <View style={styles.previewGrid}>
            {previewData.map((day) => (
              <View key={day.date} style={styles.previewDay}>
                <Text style={styles.previewDate}>{day.date}</Text>
                <View style={styles.previewStatus}>
                  {day.day_status === 'off' ? (
                    <Text style={styles.offStatus}>OFF</Text>
                  ) : (
                    <View style={styles.teachStatus}>
                      <Text style={styles.teachStatusText}>
                        {JSON.parse(day.available_blocks).map(block => 
                          `${block.start}–${block.end}`
                        ).join(', ')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No preview data</Text>
            <Text style={styles.emptyStateSubtext}>
              Select a child to see availability preview
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {renderHeader()}
          {renderTabNavigation()}
          
          <ScrollView style={styles.modalScroll}>
            {activeTab === 'rules' && renderRulesTab()}
            {activeTab === 'overrides' && renderOverridesTab()}
            {activeTab === 'preview' && renderPreviewTab()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// Simple Rule Card Component
const RuleCard = ({ rule, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  
  return (
    <View style={styles.ruleCard}>
      <View style={styles.ruleHeader}>
        <View style={styles.ruleInfo}>
          <Text style={styles.ruleTitle}>{rule.title}</Text>
          <View style={styles.ruleMeta}>
            <Text style={styles.ruleKind}>
              {rule.rule_kind === 'teach' ? '+ Add Teaching Time' : '− Block Time (Off)'}
            </Text>
            <Text style={styles.ruleTime}>
              {rule.start_time} - {rule.end_time}
            </Text>
          </View>
        </View>
        
        <View style={styles.ruleActions}>
          <TouchableOpacity
            style={styles.ruleActionButton}
            onPress={() => setEditing(!editing)}
          >
            <Settings size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </View>
      
      {editing && (
        <View style={styles.ruleEditForm}>
          <Text style={styles.editFormText}>Edit form would go here</Text>
        </View>
      )}
    </View>
  );
};

// Simple Override Card Component
const OverrideCard = ({ override, onUpdate, onDelete }) => {
  return (
    <View style={styles.overrideCard}>
      <Text style={styles.overrideTitle}>{override.override_kind}</Text>
      <Text style={styles.overrideDate}>{override.date}</Text>
      {override.start_time && (
        <Text style={styles.overrideTime}>
          {override.start_time} - {override.end_time}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    width: '90%',
    maxWidth: 800,
    maxHeight: '90%',
    ...shadows.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cascadeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cascadeLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  closeButton: {
    padding: 8,
    borderRadius: 6,
  },
  tabNavigation: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  activeTabText: {
    color: colors.accent,
    fontWeight: '600',
  },
  modalScroll: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  rulesSection: {
    padding: 20,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  rulesList: {
    marginBottom: 20,
  },
  ruleCard: {
    backgroundColor: colors.panel,
    borderRadius: colors.radiusMd,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ruleInfo: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  ruleMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  ruleKind: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
  ruleTime: {
    fontSize: 12,
    color: colors.muted,
  },
  ruleActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ruleActionButton: {
    padding: 8,
    borderRadius: 6,
  },
  ruleEditForm: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editFormText: {
    fontSize: 14,
    color: colors.muted,
  },
  addRuleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  addRuleButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  overridesSection: {
    padding: 20,
  },
  overridesList: {
    marginTop: 16,
  },
  overrideCard: {
    backgroundColor: colors.panel,
    borderRadius: colors.radiusMd,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overrideTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  overrideDate: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 2,
  },
  overrideTime: {
    fontSize: 12,
    color: colors.muted,
  },
  previewSection: {
    padding: 20,
  },
  previewGrid: {
    marginTop: 16,
  },
  previewDay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.panel,
    borderRadius: colors.radiusMd,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewDate: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  previewStatus: {
    alignItems: 'flex-end',
  },
  offStatus: {
    fontSize: 12,
    color: colors.redBold,
    fontWeight: '600',
  },
  teachStatus: {
    alignItems: 'flex-end',
  },
  teachStatusText: {
    fontSize: 12,
    color: colors.greenBold,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.muted,
    fontWeight: '500',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
});

export default ScheduleRulesManager;
