import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { previewInvite, acceptInvite } from '../lib/apiClient';
import { Users, UserCheck, AlertCircle, CheckCircle } from 'lucide-react';

export default function InviteAcceptancePage({ token, onAcceptComplete }) {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadInvitePreview();
  }, [token]);

  const loadInvitePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await previewInvite(token);
      if (err || !data) {
        setError(err?.message || 'Failed to load invite details');
        return;
      }
      setInviteData(data);
    } catch (err) {
      setError(err.message || 'Failed to load invite');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!user || !session) {
      // Redirect to login with invite token preserved
      const currentUrl = window.location.href;
      window.location.href = `/?invite=${token}`;
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      const { data, error: err } = await acceptInvite(token);
      if (err || !data || !data.success) {
        setError(err?.message || data?.error || 'Failed to accept invite');
        return;
      }

      // Success! Redirect based on role
      const role = data.role;
      if (role === 'child') {
        // Redirect to child dashboard (if you have one)
        window.location.href = '/';
      } else if (role === 'tutor') {
        // Redirect to tutor dashboard (if you have one)
        window.location.href = '/';
      } else {
        // Parent - redirect to home
        window.location.href = '/';
      }

      if (onAcceptComplete) {
        onAcceptComplete(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading invite details...</Text>
        </View>
      </View>
    );
  }

  if (error && !inviteData) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Invite Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => (window.location.href = '/')}
          >
            <Text style={styles.buttonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const roleLabels = {
    parent: 'Parent',
    tutor: 'Tutor',
    child: 'Child',
  };

  const roleDescriptions = {
    parent: 'You\'ll have full access to manage the family and all children.',
    tutor: 'You\'ll be able to view and update learning for specific children.',
    child: 'You\'ll have access to your own learning dashboard.',
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Users size={48} color="#3b82f6" />
          <Text style={styles.title}>You've been invited!</Text>
        </View>

        {inviteData && (
          <View style={styles.inviteDetails}>
            {inviteData.family_name && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Family:</Text>
                <Text style={styles.detailValue}>{inviteData.family_name}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Role:</Text>
              <View style={styles.roleBadge}>
                <UserCheck size={16} color="#3b82f6" />
                <Text style={styles.roleText}>{roleLabels[inviteData.role] || inviteData.role}</Text>
              </View>
            </View>

            {inviteData.role === 'tutor' && inviteData.child_names && inviteData.child_names.length > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Access to:</Text>
                <View style={styles.childrenList}>
                  {inviteData.child_names.map((child) => (
                    <View key={child.id} style={styles.childChip}>
                      <Text style={styles.childChipText}>{child.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {inviteData.expires_at && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expires:</Text>
                <Text style={styles.expiresText}>
                  {new Date(inviteData.expires_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </Text>
              </View>
            )}

            <Text style={styles.description}>
              {roleDescriptions[inviteData.role] || 'You\'ll be added to this family.'}
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <AlertCircle size={20} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!user || !session ? (
          <View style={styles.authPrompt}>
            <Text style={styles.authPromptText}>
              Please sign in or create an account to accept this invite.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                // Preserve invite token in URL
                const currentUrl = new URL(window.location.href);
                window.location.href = `/?invite=${token}`;
              }}
            >
              <Text style={styles.buttonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.acceptButton, accepting && styles.buttonDisabled]}
            onPress={handleAccept}
            disabled={accepting}
          >
            {accepting ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.buttonText}>Accepting...</Text>
              </>
            ) : (
              <>
                <CheckCircle size={20} color="#ffffff" />
                <Text style={styles.buttonText}>Accept Invite</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
    padding: 24,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  inviteDetails: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  childrenList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  childChip: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  childChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  expiresText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginTop: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ef4444',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    flex: 1,
  },
  authPrompt: {
    width: '100%',
    alignItems: 'center',
  },
  authPromptText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 200,
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

