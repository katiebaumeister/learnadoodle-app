import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getMe } from '../../lib/apiClient';

export default function ProfilePanel({ user }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data, error } = await getMe();
        if (error) throw error;
        setProfile(data);
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  if (loading) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Profile</Text>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Profile</Text>
      <Text style={styles.sectionSubtitle}>
        Basic account info. Later we can add name, avatar, default view, etc.
      </Text>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role:</Text>
          <Text style={styles.infoValue}>
            {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Parent'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email:</Text>
          <Text style={styles.infoValue}>{profile?.email || user?.email || '—'}</Text>
        </View>
        {profile?.family_id && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Family ID:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {profile.family_id}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 12,
    color: '#6b7280',
  },
  infoCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    marginRight: 8,
    minWidth: 80,
  },
  infoValue: {
    fontSize: 12,
    color: '#111827',
    flex: 1,
  },
});

