import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Linking } from 'react-native';
import { Calendar, Check, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';

import {
  getGoogleCalendarStatus,
  startGoogleCalendarOAuth,
  disconnectGoogleCalendar,
  syncGoogleCalendar,
} from '../lib/apiClient';
import { useToast } from './Toast';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 10;

export default function GoogleCalendarConnect({ familyId, style, onConnected, onDisconnected }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollAttempts = useRef(0);
  const pollTimer = useRef(null);
  const [status, setStatus] = useState({ connected: false, account_email: null, expires_at: null, last_synced_at: null });
  const [error, setError] = useState(null);

  const clearPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setPolling(false);
    pollAttempts.current = 0;
  }, []);

  const loadStatus = useCallback(async (showToast = false) => {
    if (!familyId) {
      setStatus({ connected: false });
      setLoading(false);
      return false;
    }

    try {
      const { data, error: apiError } = await getGoogleCalendarStatus();
      if (apiError) {
        if (showToast) {
          toast.push(apiError.message || 'Failed to load Google Calendar status', 'error');
        }
        setError(apiError.message || 'Failed to load status');
        setStatus({ connected: false });
        return false;
      }
      setStatus(data || { connected: false });
      setError(null);
      return data?.connected ?? false;
    } finally {
      setLoading(false);
    }
  }, [familyId, toast]);

  useEffect(() => {
    loadStatus(false);
    return () => clearPolling();
  }, [loadStatus, clearPolling]);

  useEffect(() => {
    if (!polling) return;
    if (pollTimer.current) return;

    pollAttempts.current = 0;
    pollTimer.current = setInterval(async () => {
      pollAttempts.current += 1;
      const connected = await loadStatus(false);
      if (connected) {
        clearPolling();
        setConnecting(false);
        toast.push('Google Calendar connected', 'success');
        onConnected?.();
      } else if (pollAttempts.current >= MAX_POLL_ATTEMPTS) {
        clearPolling();
        setConnecting(false);
        toast.push('Google connection timeout. Close the popup and try again.', 'warning');
      }
    }, POLL_INTERVAL_MS);
  }, [polling, loadStatus, clearPolling, toast, onConnected]);

  const openOAuthPopup = useCallback((url) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, 'google-oauth', 'width=520,height=640');
    } else {
      Linking.openURL(url);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { data, error: apiError } = await startGoogleCalendarOAuth({ familyId });
      if (apiError || !data?.auth_url) {
        const message = apiError?.message || 'Failed to start Google connection';
        toast.push(message, 'error');
        setConnecting(false);
        return;
      }
      openOAuthPopup(data.auth_url);
      setPolling(true);
    } catch (err) {
      console.error('Google connect error:', err);
      toast.push('Failed to initiate Google connection', 'error');
      setConnecting(false);
    }
  }, [familyId, toast, openOAuthPopup]);

  const handleDisconnect = useCallback(async () => {
    setConnecting(true);
    try {
      const { error: apiError } = await disconnectGoogleCalendar();
      if (apiError) {
        toast.push(apiError.message || 'Failed to disconnect Google', 'error');
      } else {
        toast.push('Disconnected from Google Calendar', 'info');
        setStatus({ connected: false });
        onDisconnected?.();
      }
    } finally {
      setConnecting(false);
    }
  }, [toast, onDisconnected]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data, error: apiError } = await syncGoogleCalendar();
      if (apiError) {
        toast.push(apiError.message || 'Failed to sync events', 'error');
        return;
      }
      const syncedCount = data?.synced ?? 0;
      const failures = data?.failures ?? 0;
      toast.push(`Synced ${syncedCount} event${syncedCount === 1 ? '' : 's'}` + (failures ? ` (${failures} failed)` : ''), failures ? 'warning' : 'success');
      loadStatus(false);
    } finally {
      setSyncing(false);
    }
  }, [toast, loadStatus]);

  if (loading) {
    return (
      <View style={[styles.card, style]}>
        <View style={styles.row}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={styles.statusText}>Checking Google connection…</Text>
        </View>
      </View>
    );
  }

  const connected = Boolean(status?.connected);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={[styles.iconCircle, connected ? styles.iconCircleConnected : styles.iconCircleDisconnected]}>
            <Calendar size={16} color={connected ? '#0f172a' : '#4b5563'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Google Calendar</Text>
            {connected ? (
              <Text style={styles.subtitle}>
                Connected as {status.account_email || 'Google user'}
              </Text>
            ) : (
              <Text style={styles.subtitle}>Sync planner events with your Google Calendar</Text>
            )}
          </View>
        </View>
        { connected && status.last_synced_at ? (
          <Text style={styles.metaText}>Last sync {new Date(status.last_synced_at).toLocaleString()}</Text>
        ) : null }
      </View>

      {error && (
        <View style={styles.errorRow}>
          <AlertTriangle size={14} color="#b91c1c" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {connected ? (
          <>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, syncing && styles.buttonDisabled]}
              onPress={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <RefreshCw size={16} color="#ffffff" />
                  <Text style={styles.buttonText}>Sync upcoming week</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, connecting && styles.buttonDisabled]}
              onPress={handleDisconnect}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <>
                  <XCircle size={16} color="#0f172a" />
                  <Text style={styles.secondaryButtonText}>Disconnect</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.primaryButton, connecting && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Check size={16} color="#ffffff" />
                <Text style={styles.buttonText}>Connect Google Calendar</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {!connected && (
        <Text style={styles.helperText}>
          You&apos;ll be redirected to Google to grant access. After connecting, your scheduled events will be pushed to your primary Google calendar.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    gap: 12,
  },
  header: {
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  iconCircleConnected: {
    backgroundColor: '#bbf7d0',
  },
  iconCircleDisconnected: {
    backgroundColor: '#e2e8f0',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 14,
    color: '#475569',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#991b1b',
  },
});
