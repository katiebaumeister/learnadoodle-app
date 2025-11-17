import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TrendingUp, Upload, BarChart3 } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getCapacity, compareToSyllabusWeek, getLightEvidenceSubjects } from '../../lib/apiClient';
import { getWeekStart } from '../../lib/apiClient';

export default function KpiRow({ familyId, childId, onNavigate }) {
  const [kpis, setKpis] = useState({
    syllabusPace: null,
    evidenceCoverage: null,
    capacity: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (familyId) {
      loadKPIs();
    }
  }, [familyId, childId]);

  const loadKPIs = async () => {
    setLoading(true);
    try {
      const weekStart = getWeekStart(new Date());

      // Load all KPIs in parallel
      const [paceResult, evidenceResult, capacityResult] = await Promise.all([
        compareToSyllabusWeek({ familyId, childId, weekStart }),
        getLightEvidenceSubjects({ familyId, childId }),
        getCapacity({ familyId, weekStart }),
      ]);

      // Calculate syllabus pace (average % of expected minutes done)
      let pace = null;
      if (paceResult.data && paceResult.data.length > 0) {
        const total = paceResult.data.reduce((sum, item) => {
          const expected = item.expected_weekly_minutes || 0;
          const done = item.done_minutes || 0;
          return sum + (expected > 0 ? (done / expected) * 100 : 100);
        }, 0);
        pace = paceResult.data.length > 0 ? total / paceResult.data.length : 0;
      }

      // Calculate evidence coverage (subjects meeting target / total subjects)
      let coverage = null;
      if (evidenceResult.data && evidenceResult.data.length > 0) {
        const meetingTarget = evidenceResult.data.filter(item => 
          (item.file_count || 0) >= (item.target || 4)
        ).length;
        coverage = evidenceResult.data.length > 0 
          ? (meetingTarget / evidenceResult.data.length) * 100 
          : 100;
      }

      setKpis({
        syllabusPace: pace,
        evidenceCoverage: coverage,
        capacity: capacityResult.data,
      });
    } catch (err) {
      console.error('Error loading KPIs:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading KPIs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Syllabus Pace KPI */}
      <TouchableOpacity
        style={styles.kpiCard}
        onPress={() => onNavigate?.('planner', { childId, view: 'week' })}
      >
        <View style={styles.kpiHeader}>
          <TrendingUp size={20} color={colors.primary} />
          <Text style={styles.kpiTitle}>Syllabus Pace</Text>
        </View>
        <Text style={styles.kpiValue}>
          {kpis.syllabusPace !== null ? `${Math.round(kpis.syllabusPace)}%` : 'N/A'}
        </Text>
        <Text style={styles.kpiSubtext}>of expected weekly minutes done</Text>
      </TouchableOpacity>

      {/* Evidence Coverage KPI */}
      <TouchableOpacity
        style={styles.kpiCard}
        onPress={() => onNavigate?.('documents', { childId })}
      >
        <View style={styles.kpiHeader}>
          <Upload size={20} color={colors.greenBold} />
          <Text style={styles.kpiTitle}>Evidence Coverage</Text>
        </View>
        <Text style={styles.kpiValue}>
          {kpis.evidenceCoverage !== null ? `${Math.round(kpis.evidenceCoverage)}%` : 'N/A'}
        </Text>
        <Text style={styles.kpiSubtext}>subjects meeting upload target</Text>
      </TouchableOpacity>

      {/* Capacity Meter KPI */}
      <TouchableOpacity
        style={styles.kpiCard}
        onPress={() => onNavigate?.('planner', { childId, view: 'week' })}
      >
        <View style={styles.kpiHeader}>
          <BarChart3 size={20} color={colors.blueBold} />
          <Text style={styles.kpiTitle}>Capacity</Text>
        </View>
        <Text style={styles.kpiValue}>
          {kpis.capacity?.utilization_percent !== null 
            ? `${Math.round(kpis.capacity.utilization_percent)}%` 
            : 'N/A'}
        </Text>
        <Text style={styles.kpiSubtext}>
          {kpis.capacity 
            ? `${kpis.capacity.scheduled_minutes || 0} / ${kpis.capacity.available_minutes || 0} min`
            : 'scheduled vs available'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    padding: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  kpiSubtext: {
    fontSize: 11,
    color: colors.muted,
  },
});

