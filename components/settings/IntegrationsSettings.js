import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, TextInput } from 'react-native';
import { Calendar, ExternalLink, Copy, CheckCircle, X, AlertCircle, RefreshCw } from 'lucide-react';
import { getMe } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';

export default function IntegrationsSettings({ user }) {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [youtubeQuota, setYoutubeQuota] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (user) {
      loadUserInfo();
      loadIntegrations();
    }
  }, [user]);

  const loadUserInfo = async () => {
    try {
      const { data, error } = await getMe();
      if (!error && data) {
        setUserRole(data.role || 'parent');
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get integration status
      const statusRes = await fetch(`${apiBase}/api/integrations/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!statusRes.ok) throw new Error('Failed to fetch integration status');
      const statusData = await statusRes.json();
      setIntegrations(statusData);

      // Get YouTube quota
      const quotaRes = await fetch(`${apiBase}/api/integrations/youtube/quota`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        setYoutubeQuota(quotaData);
      }
    } catch (error) {
      console.error('Error loading integrations:', error);
      toast.push('Failed to load integrations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${apiBase}/api/google/calendar/oauth/start`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to start OAuth');
      const data = await res.json();

      // Open OAuth URL in new window/tab
      if (Platform.OS === 'web' && data.auth_url) {
        window.open(data.auth_url, '_blank', 'width=600,height=700');
        toast.push('Complete Google Calendar connection in the popup window', 'info');
      }
    } catch (error) {
      console.error('Error connecting Google:', error);
      toast.push('Failed to connect Google Calendar', 'error');
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${apiBase}/api/google/calendar/credential`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to disconnect');
      toast.push('Google Calendar disconnected', 'success');
      loadIntegrations();
    } catch (error) {
      console.error('Error disconnecting Google:', error);
      toast.push('Failed to disconnect Google Calendar', 'error');
    }
  };

  const handleGenerateIcsUrl = async () => {
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${apiBase}/api/integrations/apple/generate_ics_url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error('Failed to generate ICS URL');
      const data = await res.json();

      // Update integrations list
      loadIntegrations();

      toast.push('ICS URL generated. Copy it and subscribe in Apple Calendar.', 'success');
    } catch (error) {
      console.error('Error generating ICS URL:', error);
      toast.push('Failed to generate ICS URL', 'error');
    }
  };

  const handleCopyUrl = async (url) => {
    if (Platform.OS === 'web' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.push('URL copied to clipboard', 'success');
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  // Only show to parents
  if (userRole && userRole !== 'parent') {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedContainer}>
          <AlertCircle size={48} color="#9ca3af" />
          <Text style={styles.restrictedText}>Integrations are only available to parents.</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const googleIntegration = integrations.find(i => i.provider === 'google');
  const appleIntegration = integrations.find(i => i.provider === 'apple');
  const youtubeIntegration = integrations.find(i => i.provider === 'youtube');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Manage Integrations</Text>
        <Text style={styles.subtitle}>Connect external calendars and monitor API usage</Text>
      </View>

      {/* Google Calendar */}
      <View style={styles.integrationCard}>
        <View style={styles.integrationHeader}>
          <View style={styles.integrationInfo}>
            <Calendar size={24} color="#4285f4" />
            <View style={styles.integrationTitle}>
              <Text style={styles.integrationName}>Google Calendar</Text>
              <Text style={styles.integrationDescription}>Sync events to your Google Calendar</Text>
            </View>
          </View>
          <View style={styles.integrationStatus}>
            {googleIntegration?.connected ? (
              <>
                <CheckCircle size={20} color="#10b981" />
                <Text style={styles.statusText}>Connected</Text>
              </>
            ) : (
              <>
                <X size={20} color="#9ca3af" />
                <Text style={styles.statusText}>Not connected</Text>
              </>
            )}
          </View>
        </View>

        {googleIntegration?.connected && googleIntegration.account_email && (
          <Text style={styles.accountEmail}>Connected as: {googleIntegration.account_email}</Text>
        )}

        <View style={styles.integrationActions}>
          {googleIntegration?.connected ? (
            <TouchableOpacity
              style={[styles.button, styles.buttonDanger]}
              onPress={handleDisconnectGoogle}
            >
              <X size={16} color="#ffffff" />
              <Text style={styles.buttonText}>Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleConnectGoogle}
            >
              <ExternalLink size={16} color="#ffffff" />
              <Text style={styles.buttonText}>Connect Google Calendar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Apple Calendar (ICS) */}
      <View style={styles.integrationCard}>
        <View style={styles.integrationHeader}>
          <View style={styles.integrationInfo}>
            <Calendar size={24} color="#007aff" />
            <View style={styles.integrationTitle}>
              <Text style={styles.integrationName}>Apple Calendar</Text>
              <Text style={styles.integrationDescription}>Subscribe via ICS URL</Text>
            </View>
          </View>
          <View style={styles.integrationStatus}>
            {appleIntegration?.connected ? (
              <>
                <CheckCircle size={20} color="#10b981" />
                <Text style={styles.statusText}>Active</Text>
              </>
            ) : (
              <>
                <X size={20} color="#9ca3af" />
                <Text style={styles.statusText}>Not set up</Text>
              </>
            )}
          </View>
        </View>

        {appleIntegration?.ics_url ? (
          <>
            <Text style={styles.icsInstructions}>
              Copy this URL and subscribe to it in Apple Calendar using File → New Calendar Subscription
            </Text>
            <View style={styles.icsUrlContainer}>
              <TextInput
                style={styles.icsUrlInput}
                value={appleIntegration.ics_url}
                editable={false}
                selectTextOnFocus
              />
              <TouchableOpacity
                style={styles.copyButton}
                onPress={() => handleCopyUrl(appleIntegration.ics_url)}
              >
                {copiedUrl === appleIntegration.ics_url ? (
                  <CheckCircle size={20} color="#10b981" />
                ) : (
                  <Copy size={20} color="#3b82f6" />
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.integrationActions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleGenerateIcsUrl}
            >
              <Calendar size={16} color="#ffffff" />
              <Text style={styles.buttonText}>Generate ICS URL</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* YouTube Quota */}
      {youtubeIntegration && youtubeQuota && (
        <View style={styles.integrationCard}>
          <View style={styles.integrationHeader}>
            <View style={styles.integrationInfo}>
              <ExternalLink size={24} color="#ff0000" />
              <View style={styles.integrationTitle}>
                <Text style={styles.integrationName}>YouTube Data API</Text>
                <Text style={styles.integrationDescription}>Quota usage monitoring</Text>
              </View>
            </View>
          </View>

          <View style={styles.quotaInfo}>
            <View style={styles.quotaRow}>
              <Text style={styles.quotaLabel}>Daily Quota Limit:</Text>
              <Text style={styles.quotaValue}>{youtubeQuota.quota_limit.toLocaleString()}</Text>
            </View>
            <View style={styles.quotaRow}>
              <Text style={styles.quotaLabel}>Usage Today:</Text>
              <Text style={styles.quotaValue}>
                {youtubeQuota.usage_today.toLocaleString()} ({youtubeQuota.usage_percent.toFixed(1)}%)
              </Text>
            </View>
            <View style={styles.quotaBar}>
              <View
                style={[
                  styles.quotaBarFill,
                  { width: `${Math.min(youtubeQuota.usage_percent, 100)}%` }
                ]}
              />
            </View>
            <Text style={styles.quotaNote}>
              Quota resets daily. Current usage is an estimate. Actual usage may vary.
            </Text>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Integrations are only visible and manageable by parents. Tutors and children cannot access or modify these settings.
        </Text>
      </View>
    </ScrollView>
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
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  restrictedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    minHeight: 300,
  },
  restrictedText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 16,
    textAlign: 'center',
  },
  integrationCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  integrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  integrationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  integrationTitle: {
    flex: 1,
  },
  integrationName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  integrationDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  integrationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  accountEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  integrationActions: {
    marginTop: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  buttonPrimary: {
    backgroundColor: '#3b82f6',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  icsInstructions: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  icsUrlContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  icsUrlInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: {
        outlineWidth: 0,
        outlineColor: 'transparent',
      },
    }),
  },
  copyButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quotaInfo: {
    marginTop: 8,
  },
  quotaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quotaLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  quotaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  quotaBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 8,
  },
  quotaBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  quotaNote: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    textAlign: 'center',
  },
});

