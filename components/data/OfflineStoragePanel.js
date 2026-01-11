/**
 * Offline Storage Panel Component
 * Manages local device storage and offline capabilities
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Database, Download, Upload, Trash2, Wifi, WifiOff, HardDrive, Info } from 'lucide-react';
import { colors } from '../../theme/colors';
import { 
  isOfflineStorageAvailable, 
  clearFamilyData,
  getSyncStatus 
} from '../../lib/services/offlineStorage';
import { supabase } from '../../lib/supabase';

export default function OfflineStoragePanel({ familyId }) {
  const [offlineEnabled, setOfflineEnabled] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkStorageStatus();
  }, [familyId]);

  const checkStorageStatus = async () => {
    setLoading(true);
    try {
      const available = await isOfflineStorageAvailable();
      setStorageAvailable(available);
      
      if (available) {
        try {
          const status = await getSyncStatus(familyId);
          setSyncStatus({
            pendingCount: status.totalPending || 0,
            failedCount: 0 // This would need to be tracked separately
          });
        } catch (error) {
        }
        
        // Check if offline mode is enabled (could be stored in user preferences)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: prefs } = await supabase
              .from('user_settings')
              .select('offline_mode_enabled')
              .eq('user_id', user.id)
              .single();
            
            setOfflineEnabled(prefs?.offline_mode_enabled || false);
          }
        } catch (error) {
        }
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOffline = async (enabled) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update user settings
      await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          offline_mode_enabled: enabled,
          updated_at: new Date().toISOString()
        });

      setOfflineEnabled(enabled);
      Alert.alert(
        enabled ? 'Offline Mode Enabled' : 'Offline Mode Disabled',
        enabled 
          ? 'Your data will be cached locally for offline access. Changes will sync when you reconnect.'
          : 'Offline caching has been disabled. You will need an internet connection to access your data.'
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to update offline mode setting');
    }
  };

  const handleClearLocalData = () => {
    Alert.alert(
      'Clear Local Storage',
      'This will delete all locally cached data. You will need to re-download data when you reconnect. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearFamilyData(familyId);
              Alert.alert('Success', 'Local storage cleared');
              await checkStorageStatus();
            } catch (error) {
              Alert.alert('Error', 'Failed to clear local storage');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Checking storage status...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Storage Status */}
      <View style={styles.section}>
        <View style={styles.header}>
          <HardDrive size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Local Storage</Text>
        </View>
        
        <View style={styles.statusBox}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Storage Available:</Text>
            <View style={[styles.statusBadge, storageAvailable && styles.statusBadgeSuccess]}>
              <Text style={styles.statusBadgeText}>
                {storageAvailable ? 'Available' : 'Not Available'}
              </Text>
            </View>
          </View>
          
          {storageAvailable && syncStatus && (
            <>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Pending Syncs:</Text>
                <Text style={styles.statusValue}>{syncStatus.pendingCount || 0}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Failed Syncs:</Text>
                <Text style={[styles.statusValue, syncStatus.failedCount > 0 && styles.statusValueError]}>
                  {syncStatus.failedCount || 0}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Offline Mode Toggle */}
      <View style={styles.section}>
        <View style={styles.header}>
          {offlineEnabled ? <WifiOff size={24} color={colors.orangeBold} /> : <Wifi size={24} color={colors.muted} />}
          <Text style={styles.sectionTitle}>Offline Mode</Text>
        </View>
        
        <Text style={styles.sectionDescription}>
          Enable offline mode to cache your data locally. This allows you to access and modify 
          your data even when offline. Changes will automatically sync when you reconnect.
        </Text>

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Enable Offline Caching</Text>
            <Text style={styles.toggleDescription}>
              {offlineEnabled 
                ? 'Data is being cached locally for offline access'
                : 'Data will only be available when online'}
            </Text>
          </View>
          <Switch
            value={offlineEnabled}
            onValueChange={handleToggleOffline}
            disabled={!storageAvailable}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>

        {!storageAvailable && (
          <View style={styles.warningBox}>
            <Info size={16} color={colors.orangeBold} />
            <Text style={styles.warningText}>
              Local storage is not available in this browser. Offline mode requires IndexedDB support.
            </Text>
          </View>
        )}
      </View>

      {/* Storage Management */}
      {storageAvailable && (
        <View style={styles.section}>
          <View style={styles.header}>
            <Database size={24} color={colors.muted} />
            <Text style={styles.sectionTitle}>Storage Management</Text>
          </View>
          
          <Text style={styles.sectionDescription}>
            Manage your locally stored data. Clearing local storage will remove cached data 
            but won't affect your cloud data.
          </Text>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={handleClearLocalData}
          >
            <Trash2 size={20} color={colors.redBold} />
            <Text style={styles.actionButtonText}>Clear Local Cache</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Information */}
      <View style={styles.section}>
        <View style={styles.header}>
          <Info size={24} color={colors.muted} />
          <Text style={styles.sectionTitle}>About Offline Storage</Text>
        </View>
        
        <View style={styles.infoList}>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              Offline mode caches your data locally using browser storage
            </Text>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              Changes made offline are queued and synced when you reconnect
            </Text>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              Local storage is private to your device and browser
            </Text>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              Clearing local cache does not delete your cloud data
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  loadingText: {
    padding: 20,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  section: {
    padding: 20,
    backgroundColor: colors.card,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 16,
  },
  statusBox: {
    padding: 16,
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: colors.text,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statusValueError: {
    color: colors.redBold,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.redSoft,
  },
  statusBadgeSuccess: {
    backgroundColor: colors.greenSoft,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 13,
    color: colors.muted,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.orangeSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.orangeBold,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  infoList: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});

