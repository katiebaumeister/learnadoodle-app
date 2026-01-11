import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { colors, shadows } from '../theme/colors';
import { supabase } from '../lib/supabase';
import AvailabilityBuilder from './AvailabilityBuilder';

/**
 * Full-screen Availability management view
 * Uses the unified Availability Builder instead of tabs
 */
const ScheduleRulesView = ({ familyId, children, hideHeader = false }) => {
  // Always use specificity cascade mode (child rules override family rules)
  // This is the default behavior - family schedule is the base, children can tweak it
  useEffect(() => {
    if (!familyId) return;
    // Ensure specificity_cascade is set to true (child rules override family)
    ensureSpecificityCascadeEnabled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  const ensureSpecificityCascadeEnabled = async () => {
    try {
      // Check if setting exists
      const { data, error: checkError } = await supabase
        .from('family_settings')
        .select('specificity_cascade')
        .eq('family_id', familyId)
        .single();

      // If no setting exists or it's false, set it to true
      if (checkError?.code === 'PGRST116' || (data && !data.specificity_cascade)) {
        await supabase.rpc('set_specificity_cascade', {
          p_family: familyId,
          p_value: true,
        });
      }
    } catch (error) {
      // Silently handle errors - this is not critical
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
      {/* Availability Builder */}
      <AvailabilityBuilder
        familyId={familyId}
        children={children}
        hideHeader={hideHeader}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
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
});

export default ScheduleRulesView;

