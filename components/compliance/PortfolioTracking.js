/**
 * Portfolio Tracking Component
 * State-specific portfolio requirement tracking
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { FileText, CheckCircle, AlertCircle, Award, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function PortfolioTracking({ childId, familyId, stateCode }) {
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [selectedRequirement, setSelectedRequirement] = useState(null);

  useEffect(() => {
    if (stateCode) {
      loadPortfolioData();
    }
  }, [childId, familyId, stateCode]);

  const loadPortfolioData = async () => {
    if (!childId || !familyId || !stateCode) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Load portfolio requirements for state
      const { data: reqs, error: reqsError } = await supabase
        .from('portfolio_requirements')
        .select('*')
        .eq('state_code', stateCode)
        .order('requirement_type', { ascending: true });

      if (reqsError && reqsError.code !== 'PGRST116') {
      }

      // Load tracking data
      const { data: track, error: trackError } = await supabase
        .from('family_portfolio_tracking')
        .select(`
          *,
          requirement:requirement_id (
            id,
            requirement_title,
            requirement_description
          )
        `)
        .eq('child_id', childId)
        .eq('state_code', stateCode);

      if (trackError && trackError.code !== 'PGRST116') {
      }

      // Merge requirements with tracking
      const merged = (reqs || []).map((req) => {
        const trackItem = (track || []).find((t) => t.requirement_id === req.id);
        return {
          ...req,
          tracking: trackItem || null,
        };
      });

      setRequirements(merged);
      setTracking(track || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const updateTrackingStatus = async (requirementId, status) => {
    if (!childId || !familyId || !stateCode) return;

    try {
      const trackingData = {
        family_id: familyId,
        child_id: childId,
        requirement_id: requirementId,
        state_code: stateCode,
        status: status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('family_portfolio_tracking')
        .upsert(trackingData, {
          onConflict: 'child_id,requirement_id,state_code',
        });

      if (error) throw error;

      await loadPortfolioData();
    } catch (error) {
      alert('Failed to update tracking status');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return colors.greenBold;
      case 'in_progress':
        return colors.blueBold;
      case 'not_applicable':
        return colors.textSecondary;
      default:
        return colors.orangeBold;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  if (!stateCode) {
    return (
      <View style={styles.emptyState}>
        <AlertCircle size={48} color={colors.textSecondary} />
        <Text style={styles.emptyText}>Select a state to view portfolio requirements</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <FileText size={20} color={colors.indigo} />
        <Text style={styles.title}>Portfolio Requirements - {stateCode}</Text>
      </View>

      {requirements.length === 0 ? (
        <View style={styles.emptyState}>
          <FileText size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No portfolio requirements found</Text>
          <Text style={styles.emptySubtext}>
            Portfolio requirements may not be configured for {stateCode}
          </Text>
        </View>
      ) : (
        requirements.map((requirement) => {
          const trackingItem = requirement.tracking;
          const status = trackingItem?.status || 'pending';
          const statusColor = getStatusColor(status);

          return (
            <View key={requirement.id} style={styles.requirementCard}>
              <View style={styles.requirementHeader}>
                <View style={styles.requirementInfo}>
                  <Text style={styles.requirementTitle}>{requirement.requirement_title}</Text>
                  <Text style={styles.requirementType}>{requirement.requirement_type}</Text>
                  {requirement.requirement_description && (
                    <Text style={styles.requirementDescription}>
                      {requirement.requirement_description}
                    </Text>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusText}>{status.replace('_', ' ')}</Text>
                </View>
              </View>

              {trackingItem && (
                <View style={styles.trackingInfo}>
                  <Text style={styles.trackingLabel}>
                    Evidence Count: {trackingItem.evidence_count || 0}
                  </Text>
                  {trackingItem.completed_at && (
                    <Text style={styles.trackingDate}>
                      Completed: {new Date(trackingItem.completed_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.statusButtons}>
                {['pending', 'in_progress', 'completed', 'not_applicable'].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusButton,
                      status === s && styles.statusButtonActive,
                    ]}
                    onPress={() => updateTrackingStatus(requirement.id, s)}
                  >
                    <Text
                      style={[
                        styles.statusButtonText,
                        status === s && styles.statusButtonTextActive,
                      ]}
                    >
                      {s.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  requirementCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.border,
  },
  requirementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  requirementInfo: {
    flex: 1,
    marginRight: 12,
  },
  requirementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  requirementType: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  requirementDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.white,
    textTransform: 'capitalize',
  },
  trackingInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trackingLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  trackingDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  statusButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    textTransform: 'capitalize',
  },
  statusButtonTextActive: {
    color: colors.white,
  },
});

