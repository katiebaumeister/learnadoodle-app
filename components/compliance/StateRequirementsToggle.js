/**
 * State Requirements Toggle Component
 * Toggle between days-based and hours-based attendance tracking per state
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Calendar, Clock, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function StateRequirementsToggle({ childId, familyId, stateCode, onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [trackingMethod, setTrackingMethod] = useState('hours'); // 'days' or 'hours'

  useEffect(() => {
    loadSettings();
  }, [childId, stateCode]);

  const loadSettings = async () => {
    if (!childId || !stateCode) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('state_attendance_settings')
        .select('*')
        .eq('child_id', childId)
        .eq('state_code', stateCode)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
}

      if (data) {
        setSettings(data);
        setTrackingMethod(data.tracking_method || 'hours');
      } else {
        // Default settings
        setTrackingMethod('hours');
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (method) => {
    if (!childId || !familyId || !stateCode) return;

    setSaving(true);
    try {
      const settingsData = {
        family_id: familyId,
        child_id: childId,
        state_code: stateCode,
        tracking_method: method,
      };

      const { error } = await supabase
        .from('state_attendance_settings')
        .upsert(settingsData, {
          onConflict: 'child_id,state_code',
        });

      if (error) throw error;

      setTrackingMethod(method);
      setSettings({ ...settings, tracking_method: method });
      
      if (onSettingsChange) {
        onSettingsChange(method);
      }
    } catch (error) {
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Settings size={18} color={colors.textSecondary} />
        <Text style={styles.title}>Attendance Tracking Method</Text>
      </View>
      <Text style={styles.description}>
        Choose how to track attendance for {stateCode} requirements
      </Text>

      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.toggleOption,
            trackingMethod === 'days' && styles.toggleOptionActive,
            saving && styles.toggleOptionDisabled,
          ]}
          onPress={() => handleToggle('days')}
          disabled={saving}
        >
          <Calendar size={24} color={trackingMethod === 'days' ? colors.white : colors.textSecondary} />
          <Text
            style={[
              styles.toggleOptionText,
              trackingMethod === 'days' && styles.toggleOptionTextActive,
            ]}
          >
            Days-Based
          </Text>
          <Text
            style={[
              styles.toggleOptionSubtext,
              trackingMethod === 'days' && styles.toggleOptionSubtextActive,
            ]}
          >
            Track by number of days
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleOption,
            trackingMethod === 'hours' && styles.toggleOptionActive,
            saving && styles.toggleOptionDisabled,
          ]}
          onPress={() => handleToggle('hours')}
          disabled={saving}
        >
          <Clock size={24} color={trackingMethod === 'hours' ? colors.white : colors.textSecondary} />
          <Text
            style={[
              styles.toggleOptionText,
              trackingMethod === 'hours' && styles.toggleOptionTextActive,
            ]}
          >
            Hours-Based
          </Text>
          <Text
            style={[
              styles.toggleOptionSubtext,
              trackingMethod === 'hours' && styles.toggleOptionSubtextActive,
            ]}
          >
            Track by number of hours
          </Text>
        </TouchableOpacity>
      </View>

      {settings && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {trackingMethod === 'days'
              ? `Minimum requirement: ${settings.minimum_days || 'Not set'} days`
              : `Minimum requirement: ${settings.minimum_hours || 'Not set'} hours`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleOption: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 8,
  },
  toggleOptionActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  toggleOptionDisabled: {
    opacity: 0.6,
  },
  toggleOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  toggleOptionTextActive: {
    color: colors.white,
  },
  toggleOptionSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  toggleOptionSubtextActive: {
    color: colors.white,
    opacity: 0.9,
  },
  infoBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 6,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

