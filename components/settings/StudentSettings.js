import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { Shield, Eye, EyeOff, Clock, Bell, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import InviteChildButton from './InviteChildButton';
import { colors } from '../../theme/colors';

export default function StudentSettings({ childId, childName }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadSettings();
  }, [childId]);

  const loadSettings = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('student_settings')
        .select('*')
        .eq('child_id', childId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
      } else {
        // Create default settings
        const { data: childData } = await supabase
          .from('children')
          .select('family_id')
          .eq('id', childId)
          .single();

        if (childData) {
          const { data: newSettings, error: insertError } = await supabase
            .from('student_settings')
            .insert({
              family_id: childData.family_id,
              child_id: childId,
            })
            .select()
            .single();

          if (!insertError && newSettings) {
            setSettings(newSettings);
          }
        }
      }
    } catch (error) {
      toast.push('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (field, value) => {
    if (!settings || !childId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('student_settings')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('child_id', childId);

      if (error) throw error;

      setSettings({ ...settings, [field]: value });
      toast.push('Settings updated', 'success');
    } catch (error) {
      toast.push('Failed to update setting', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Settings not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Invite Child to Log In */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Shield size={20} color={colors.accent} />
          <Text style={styles.sectionTitle}>Child Login Access</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Invite {childName} to create their own account and log in to see their learning dashboard.
        </Text>
        <InviteChildButton 
          childId={childId} 
          childName={childName}
          onInviteCreated={() => {
            toast.push('Invite created! Share the link with your child.', 'success');
          }}
        />
      </View>

      {/* Existing settings sections */}
      <View style={styles.header}>
        <Shield size={24} color="#3b82f6" />
        <Text style={styles.title}>Student Settings</Text>
        <Text style={styles.subtitle}>Control what {childName || 'your student'} can see and do</Text>
      </View>

      {/* Visibility Controls */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Eye size={20} color="#6b7280" />
          <Text style={styles.sectionTitle}>Visibility</Text>
        </View>

        <SettingRow
          label="Can see grades"
          description="Allow student to view their grades"
          value={settings.can_see_grades}
          onValueChange={(value) => updateSetting('can_see_grades', value)}
          disabled={saving}
        />

        <SettingRow
          label="Can see upcoming plans"
          description="Show future scheduled events"
          value={settings.can_see_upcoming_plans}
          onValueChange={(value) => updateSetting('can_see_upcoming_plans', value)}
          disabled={saving}
        />

        <SettingRow
          label="Can see transcripts"
          description="Allow access to transcript records"
          value={settings.can_see_transcripts}
          onValueChange={(value) => updateSetting('can_see_transcripts', value)}
          disabled={saving}
        />

        <SettingRow
          label="Can see portfolio"
          description="View uploaded work samples"
          value={settings.can_see_portfolio}
          onValueChange={(value) => updateSetting('can_see_portfolio', value)}
          disabled={saving}
        />
      </View>

      {/* Access Controls */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Clock size={20} color="#6b7280" />
          <Text style={styles.sectionTitle}>Access</Text>
        </View>

        <SettingRow
          label="Login allowed"
          description="Enable student account access"
          value={settings.login_allowed}
          onValueChange={(value) => updateSetting('login_allowed', value)}
          disabled={saving}
        />

        {settings.login_allowed && (
          <>
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Login window:</Text>
              <Text style={styles.timeValue}>
                {settings.login_start_time} - {settings.login_end_time}
              </Text>
            </View>
            <Text style={styles.timeHint}>
              Student can only log in during these hours
            </Text>
          </>
        )}
      </View>

      {/* Notification Controls */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Bell size={20} color="#6b7280" />
          <Text style={styles.sectionTitle}>Notifications</Text>
        </View>

        <SettingRow
          label="Notifications enabled"
          description="Receive reminders and updates"
          value={settings.notifications_enabled}
          onValueChange={(value) => updateSetting('notifications_enabled', value)}
          disabled={saving}
        />

        {settings.notifications_enabled && (
          <>
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Quiet hours:</Text>
              <Text style={styles.timeValue}>
                {settings.notification_quiet_start} - {settings.notification_quiet_end}
              </Text>
            </View>
            <Text style={styles.timeHint}>
              No notifications during these hours
            </Text>
          </>
        )}
      </View>

      {/* Reflection Settings */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MessageSquare size={20} color="#6b7280" />
          <Text style={styles.sectionTitle}>Reflections</Text>
        </View>

        <SettingRow
          label="Reflection prompts enabled"
          description="Show prompts after completing activities"
          value={settings.reflection_prompts_enabled}
          onValueChange={(value) => updateSetting('reflection_prompts_enabled', value)}
          disabled={saving}
        />

        {settings.reflection_prompts_enabled && (
          <View style={styles.frequencyRow}>
            <Text style={styles.frequencyLabel}>Frequency:</Text>
            <Text style={styles.frequencyValue}>
              {settings.reflection_frequency === 'daily' ? 'Daily' :
               settings.reflection_frequency === 'weekly' ? 'Weekly' :
               'After each event'}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function SettingRow({ label, description, value, onValueChange, disabled }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  timeLabel: {
    fontSize: 14,
    color: '#374151',
  },
  timeValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  timeHint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  frequencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  frequencyLabel: {
    fontSize: 14,
    color: '#374151',
  },
  frequencyValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    textTransform: 'capitalize',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 40,
  },
});

