import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function CapacityMeter({ 
  childId, 
  subjectId, 
  weekStart, 
  weekEnd,
  onRefresh 
}) {
  const [capacity, setCapacity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (childId && weekStart && weekEnd) {
      loadCapacity();
    }
  }, [childId, subjectId, weekStart, weekEnd, onRefresh]);

  const loadCapacity = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('compute_week_capacity', {
        p_child: childId,
        p_subject: subjectId,
        p_week_start: weekStart,
        p_week_end: weekEnd
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setCapacity(data[0]);
      }
    } catch (error) {
      console.error('Error loading capacity:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !capacity) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading capacity...</Text>
      </View>
    );
  }

  const { total_available_minutes, total_conflict_minutes, total_capacity_minutes, planned_minutes } = capacity;
  
  const percentage = total_capacity_minutes > 0 
    ? Math.round((planned_minutes / total_capacity_minutes) * 100) 
    : 0;

  const getColor = (pct) => {
    if (pct < 70) return colors.muted;
    if (pct < 100) return colors.greenBold;
    return colors.redBold;
  };

  const getBackgroundColor = (pct) => {
    if (pct < 70) return colors.panel;
    if (pct < 100) return colors.greenSoft;
    return colors.redSoft;
  };

  const barColor = getColor(percentage);
  const bgColor = getBackgroundColor(percentage);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Week Capacity</Text>
          <Text style={styles.summary}>
            Planned {planned_minutes} / {total_capacity_minutes} min
            {total_conflict_minutes > 0 && ` (Conflicts ${total_conflict_minutes}m)`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowDetails(!showDetails)}>
          <Info size={16} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.barContainer}>
        <View style={[styles.barBackground, { backgroundColor: bgColor }]}>
          <View 
            style={[
              styles.barFill, 
              { 
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: barColor 
              }
            ]} 
          />
        </View>
        <Text style={[styles.percentage, { color: barColor }]}>
          {percentage}%
        </Text>
      </View>

      {/* Details (expandable) */}
      {showDetails && (
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Available:</Text>
            <Text style={styles.detailValue}>{total_available_minutes}m</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Conflicts:</Text>
            <Text style={styles.detailValue}>{total_conflict_minutes}m</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Net Capacity:</Text>
            <Text style={styles.detailValue}>{total_capacity_minutes}m</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Planned:</Text>
            <Text style={[styles.detailValue, { fontWeight: '600' }]}>{planned_minutes}m</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Remaining:</Text>
            <Text style={[styles.detailValue, { color: colors.greenBold }]}>
              {Math.max(0, total_capacity_minutes - planned_minutes)}m
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  summary: {
    fontSize: 12,
    color: colors.muted,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  barBackground: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentage: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 45,
    textAlign: 'right',
  },
  details: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  detailValue: {
    fontSize: 12,
    color: colors.text,
  },
});

