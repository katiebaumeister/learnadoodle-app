import React, { useState, useEffect, useRef } from 'react';
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
import { colors, shadows } from '../theme/colors';
import AvailabilityScopeSwitcher from './availability/AvailabilityScopeSwitcher';
import WeeklyRhythmGrid from './availability/WeeklyRhythmGrid';
import DayExceptionsStrip from './availability/DayExceptionsStrip';
import BreaksAndBlackoutsPanel from './availability/BreaksAndBlackoutsPanel';
import ABDayPatternManager from './scheduling/ABDayPatternManager';
import PageHeader from './PageHeader';

/**
 * Unified Availability Builder
 * Replaces the multi-tab Schedule Rules interface with a single unified experience
 */
const AvailabilityBuilder = ({ familyId, children, hideHeader = false }) => {
  const [selectedScope, setSelectedScope] = useState('family');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [rules, setRules] = useState([]);
  const [familyRules, setFamilyRules] = useState([]); // Store family rules to detect if child is using them
  const [overrides, setOverrides] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Visual state for weekly rhythm (independent of DB until saved)
  const [weeklyRhythmBlocks, setWeeklyRhythmBlocks] = useState([]);
  
  // Use ref to track cache key without triggering re-renders
  const dataCacheKeyRef = useRef(null);

  // Load data when component mounts or scope changes
  useEffect(() => {
    if (!familyId) return;
    
    const currentCacheKey = `${familyId}-${selectedScope}-${selectedChildId || 'family'}`;
    
    // Only reload if the scope actually changed
    if (currentCacheKey !== dataCacheKeyRef.current) {
      dataCacheKeyRef.current = currentCacheKey;
      loadAllData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, selectedScope, selectedChildId]);

  const loadAllData = async () => {
    await Promise.all([
      loadRules(),
      loadFamilyRules(), // Always load family rules to check if child is using them
      loadOverrides(),
      loadBlackouts(),
    ]);
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
        .order('updated_at', { ascending: false });

      if (error) {
        setRules([]);
        return;
      }
      
      setRules(data || []);
      
      // If viewing a child and they have no rules, copy family rules
      if (selectedScope === 'child' && (!data || data.length === 0) && familyRules.length > 0) {
        const familyBlocks = transformRulesToBlocks(familyRules);
        setWeeklyRhythmBlocks(familyBlocks);
      } else {
        // Transform rules into visual blocks for the grid
        const blocks = transformRulesToBlocks(data || []);
        setWeeklyRhythmBlocks(blocks);
      }
    } catch (error) {
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFamilyRules = async () => {
    try {
      const { data, error } = await supabase
        .from('schedule_rules')
        .select('*')
        .eq('scope_type', 'family')
        .eq('scope_id', familyId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) {
        setFamilyRules([]);
        return;
      }
      
      setFamilyRules(data || []);
    } catch (error) {
      setFamilyRules([]);
    }
  };

  const loadOverrides = async () => {
    try {
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      const fromDate = new Date();
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 30); // Next 30 days

      // NOTE: schedule_overrides removed - returning empty array
      // const { data, error } = await supabase
      //   .from('schedule_overrides')
      //   .select('*')
      //   .eq('scope_type', selectedScope)
      //   .eq('scope_id', scopeId)
      //   .eq('is_active', true)
      //   .gte('date', fromDate.toISOString().split('T')[0])
      //   .lte('date', toDate.toISOString().split('T')[0])
      //   .order('date', { ascending: true });
      const { data, error } = { data: [], error: null };

      if (error) {
        setOverrides([]);
        return;
      }
      setOverrides(data || []);
    } catch (error) {
    }
  };

  const loadBlackouts = async () => {
    try {
      if (!familyId) return;
      
      const query = supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId)
        .order('starts_on', { ascending: true });

      // If child scope, filter to child-specific or family-wide blackouts
      if (selectedScope === 'child' && selectedChildId) {
        query.or(`child_id.eq.${selectedChildId},child_id.is.null`);
      }

      const { data, error } = await supabase
        .from('blackout_periods')
        .select('*')
        .eq('family_id', familyId)
        .order('starts_on', { ascending: true });

      if (error) {
        setBlackouts([]);
        return;
      }
      
      // Filter based on scope
      let filtered = data || [];
      if (selectedScope === 'child' && selectedChildId) {
        filtered = filtered.filter(b => !b.child_id || b.child_id === selectedChildId);
      } else if (selectedScope === 'family') {
        filtered = filtered.filter(b => !b.child_id);
      }
      
      setBlackouts(filtered);
    } catch (error) {
      setBlackouts([]);
    }
  };

  // Transform schedule_rules into visual blocks
  const transformRulesToBlocks = (rulesData) => {
    const blocks = [];
    
    rulesData.forEach(rule => {
      // Check both rule_type and rule_kind for compatibility
      const isTeachRule = 
        rule.rule_type === 'availability_teach' || 
        rule.rule_kind === 'teach';
      
      if (isTeachRule && rule.rrule?.byweekday) {
        const days = rule.rrule.byweekday;
        days.forEach(dayId => {
          blocks.push({
            id: `${rule.id}-${dayId}`,
            kind: 'learn',
            day: dayIdToDayOfWeek(dayId),
            start: rule.start_time || '09:00',
            end: rule.end_time || '15:00',
            source: rule.scope_type,
            ruleId: rule.id,
          });
        });
      }
    });
    
    return blocks;
  };

  // Convert day ID (0-6) to day of week code
  const dayIdToDayOfWeek = (dayId) => {
    const mapping = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
    return mapping[dayId] || 'MO';
  };

  const handleScopeChange = (scope, childId) => {
    setSelectedScope(scope);
    setSelectedChildId(childId);
    setHasUnsavedChanges(false);
  };

  const handleWeeklyRhythmChange = (blocks) => {
    setWeeklyRhythmBlocks(blocks);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const scopeId = selectedScope === 'family' ? familyId : selectedChildId;
      
      // Transform visual blocks back to schedule_rules
      await saveWeeklyRhythmBlocks(scopeId);
      
      // Refresh cache
      const fromDate = new Date();
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 90);
      
      await supabase.rpc('refresh_calendar_days_cache', {
        p_family_id: familyId,
        p_from_date: fromDate.toISOString().split('T')[0],
        p_to_date: toDate.toISOString().split('T')[0],
      });
      
      // Reload all data
      await loadAllData();
      
      setHasUnsavedChanges(false);
      showAlert('Success', 'Availability saved successfully');
    } catch (error) {
      showAlert('Error', 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const saveWeeklyRhythmBlocks = async (scopeId) => {
    // Group blocks by time range and days
    const blockGroups = {};
    
    weeklyRhythmBlocks.forEach(block => {
      const key = `${block.start}-${block.end}`;
      if (!blockGroups[key]) {
        blockGroups[key] = [];
      }
      blockGroups[key].push(block);
    });
    
    // Deactivate all existing rules for this scope
    const { error: deactivateError } = await supabase
      .from('schedule_rules')
      .update({ is_active: false })
      .eq('scope_type', selectedScope)
      .eq('scope_id', scopeId);
    
    if (deactivateError) {
      throw deactivateError;
    }
    
    // Create new rules from grouped blocks
    const insertPromises = [];
    for (const [timeKey, blocks] of Object.entries(blockGroups)) {
      const [start, end] = timeKey.split('-');
      const dayIds = blocks.map(b => dayOfWeekToDayId(b.day));
      
      // Group consecutive days if possible
      const dayGroups = groupConsecutiveDays(dayIds);
      
      dayGroups.forEach(dayGroup => {
        const rrule = {
          freq: 'WEEKLY',
          byweekday: dayGroup,
          interval: 1
        };
        
        insertPromises.push(
          supabase
            .from('schedule_rules')
            .insert({
              scope_type: selectedScope,
              scope_id: scopeId,
              rule_type: 'availability_teach',
              rule_kind: 'teach',
              title: `${selectedScope === 'family' ? 'Family' : 'Child'} Teaching Time`,
              start_date: new Date().toISOString().split('T')[0],
              end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              start_time: start,
              end_time: end,
              rrule: rrule,
              source: 'manual',
              is_active: true
            })
        );
      });
    }
    
    const results = await Promise.all(insertPromises);
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      throw errors[0].error;
    }
  };

  const dayOfWeekToDayId = (dayOfWeek) => {
    const mapping = { 'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6 };
    return mapping[dayOfWeek] || 1;
  };

  const groupConsecutiveDays = (dayIds) => {
    // Simple grouping - could be improved to detect consecutive days
    // For now, return each day as a separate group
    return dayIds.map(id => [id]);
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  if (!familyId) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Loading...</Text>
          <Text style={styles.emptyStateText}>Please wait while we load your availability settings.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      {!hideHeader && (
        <PageHeader
          title="Availability"
          subtitle="When does learning usually happen? When are we off?"
          actions={[
            {
              label: hasUnsavedChanges ? 'Save Changes' : 'Saved',
              onPress: hasUnsavedChanges ? handleSave : null,
              disabled: !hasUnsavedChanges || saving,
            },
          ]}
        />
      )}

      {/* Main Content */}
      <ScrollView 
        style={styles.contentScroll} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        {/* Choose Person Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Choose person</Text>
            <AvailabilityScopeSwitcher
              selectedScope={selectedScope}
              selectedChildId={selectedChildId}
              children={children}
              onScopeChange={handleScopeChange}
            />
          </View>
        </View>

        {/* Child Using Family Schedule Message */}
        {selectedScope === 'child' && selectedChildId && rules.length === 0 && familyRules.length > 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardText}>
              We've copied the family learning hours. You can adjust just for {children.find(c => c.id === selectedChildId)?.first_name || children.find(c => c.id === selectedChildId)?.name || 'this child'} here.
            </Text>
          </View>
        )}

        {/* Learning Hours Section Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Learning Hours</Text>
            <Text style={styles.sectionSubtitle}>
              Set your regular weekly learning time. Drag to adjust blocks or add new ones.
            </Text>
          </View>
          <WeeklyRhythmGrid
            blocks={weeklyRhythmBlocks}
            onBlocksChange={handleWeeklyRhythmChange}
            selectedScope={selectedScope}
            selectedChildId={selectedChildId}
          />
        </View>

        {/* One-Off Adjustments Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>One-Off Adjustments</Text>
            <Text style={styles.sectionSubtitle}>
              Use this when a single day is different — shorter, longer, or completely off.
            </Text>
          </View>
          <DayExceptionsStrip
            familyId={familyId}
            selectedScope={selectedScope}
            selectedChildId={selectedChildId}
            existingOverrides={overrides}
            onOverrideSaved={loadOverrides}
          />
        </View>

        {/* Time Off Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Time Off</Text>
            <Text style={styles.sectionSubtitle}>
              Vacations, travel, testing week, holidays, etc.
            </Text>
          </View>
          <BreaksAndBlackoutsPanel
            familyId={familyId}
            children={children}
            selectedScope={selectedScope}
            selectedChildId={selectedChildId}
            blackouts={blackouts}
            onBlackoutCreated={loadBlackouts}
            onBlackoutDeleted={loadBlackouts}
          />
        </View>

        {/* A/B Day Patterns Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>A/B Day Patterns</Text>
            <Text style={styles.sectionSubtitle}>
              Configure rotating block schedules (A/B days, rotating blocks, custom patterns)
            </Text>
          </View>
          <ABDayPatternManager
            familyId={familyId}
            childId={selectedScope === 'child' ? selectedChildId : null}
            children={children}
          />
        </View>

        {/* AI Integration Note */}
        <View style={styles.aiNote}>
          <Text style={styles.aiNoteText}>
            AI tools like Fix My Week and Plan Ahead use this availability when planning.
          </Text>
          <TouchableOpacity
            style={styles.aiToolsButton}
            onPress={() => {
              // Navigate to AI tools - this would need to be passed as a prop
              showAlert('AI Tools', 'AI tools would open here');
            }}
          >
            <Text style={styles.aiToolsButtonText}>→ Open AI Tools</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    gap: 20,
    paddingBottom: 32,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    }),
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: colors.blueSoft || '#e0f2fe',
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.blueBold || '#3b82f6',
    padding: 16,
    ...shadows.sm,
  },
  infoCardText: {
    fontSize: 14,
    color: colors.blueBold || '#0369a1',
    lineHeight: 20,
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
    color: colors.text,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  aiNote: {
    backgroundColor: colors.blueSoft || '#e0f2fe',
    borderRadius: colors.radiusMd,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.blueBold || '#3b82f6',
    marginTop: 24,
  },
  aiNoteText: {
    fontSize: 13,
    color: colors.blueBold || '#0369a1',
    lineHeight: 20,
    marginBottom: 12,
  },
  aiToolsButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
    borderRadius: colors.radiusMd,
    ...shadows.sm,
  },
  aiToolsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});

export default AvailabilityBuilder;

