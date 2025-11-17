import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { ChevronLeft, ChevronRight, Download, TrendingUp, Clock, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';
import KpiRow from '../reports/KpiRow';
import { buildPlannerLink, buildDocumentsLink } from '../../lib/url';

export default function Reports({ familyId, onNavigate }) {
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [to, setTo] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  });
  const [summary, setSummary] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load children for names
      const { data: kids } = await supabase
        .from('children')
        .select('id, first_name')
        .eq('family_id', familyId)
        .eq('archived', false)
        .order('first_name');

      setChildren(kids || []);

      // Build summary by aggregating get_child_attendance per child
      const fromISO = from.toISOString().split('T')[0];
      const toISO = to.toISOString().split('T')[0];
      const byChild = [];
      for (const kid of (kids || [])) {
        const { data: att, error } = await supabase.rpc('get_child_attendance', {
          p_child_id: kid.id,
          p_start_date: fromISO,
          p_end_date: toISO,
        });
        if (error) continue;
        const arr = Array.isArray(att) ? att : [];
        const minutes = arr.reduce((sum, d) => sum + (d.minutes_present || 0), 0);
        const present_days = arr.filter(d => d.status === 'present').length;
        const absent_days = arr.filter(d => d.status === 'absent').length;
        const tardy_days = arr.filter(d => d.status === 'tardy').length;
        const excused_days = arr.filter(d => d.status === 'excused').length;
        byChild.push({
          child_id: kid.id,
          present_days,
          absent_days,
          tardy_days,
          excused_days,
          minutes_present: minutes,
        });
      }
      const totalDays = byChild.reduce((sum, c) => sum + c.present_days + c.absent_days + c.tardy_days + c.excused_days, 0);
      const totalPresent = byChild.reduce((sum, c) => sum + c.present_days, 0);
      const pct_present = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;
      setSummary({ pct_present, by_child: byChild });
    } catch (error) {
      console.error('Error loading reports data:', error);
      Alert.alert('Error', 'Failed to load reports data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (familyId) {
      loadData();
    }
  }, [familyId, from.toISOString(), to.toISOString()]);

  const exportCsv = async () => {
    try {
      const rows = [['child_id', 'child_name', 'present_days', 'absent_days', 'tardy_days', 'excused_days', 'minutes_present']];
      
      for (const child of summary?.by_child ?? []) {
        const childName = children.find(c => c.id === child.child_id)?.first_name || 'Unknown';
        rows.push([
          child.child_id,
          childName,
          child.present_days || 0,
          child.absent_days || 0,
          child.tardy_days || 0,
          child.excused_days || 0,
          child.minutes_present || 0
        ]);
      }

      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_summary_${from.getFullYear()}_${(from.getMonth() + 1).toString().padStart(2, '0')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      Alert.alert('Error', 'Failed to export CSV');
    }
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(from);
    newDate.setMonth(newDate.getMonth() + direction);
    setFrom(newDate);
    
    const newTo = new Date(newDate);
    newTo.setMonth(newTo.getMonth() + 1);
    newTo.setDate(0);
    setTo(newTo);
  };

  const formatMonth = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getTotalMinutes = () => {
    return (summary?.by_child ?? []).reduce((total, child) => total + (child.minutes_present || 0), 0);
  };

  const getChildName = (childId) => {
    return children.find(c => c.id === childId)?.first_name || 'Unknown';
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
      </View>

      {/* KPI Row */}
      <KpiRow
        familyId={familyId}
        childId={null}
        onNavigate={(view, filters) => {
          if (onNavigate) {
            if (view === 'planner') {
              onNavigate(buildPlannerLink(filters));
            } else if (view === 'documents') {
              onNavigate(buildDocumentsLink(filters));
            }
          }
        }}
      />

      {/* Header Actions */}
      <View style={styles.header}>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => navigateMonth(-1)}
          >
            <ChevronLeft size={16} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.monthDisplay}>
            <Text style={styles.monthText}>{formatMonth(from)}</Text>
          </View>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => navigateMonth(1)}
          >
            <ChevronRight size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportButton} onPress={exportCsv}>
            <Download size={16} color={colors.text} />
            <Text style={styles.exportText}>Export CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : (
        <>
          {/* Summary Cards */}
          <View style={styles.summaryGrid}>
            <SummaryCard
              title="Attendance % (family)"
              value={`${summary?.pct_present ?? 0}%`}
              icon={<TrendingUp size={20} color={colors.greenBold} />}
              color={colors.greenSoft}
            />
            <SummaryCard
              title="Minutes done (sum)"
              value={`${getTotalMinutes()}m`}
              icon={<Clock size={20} color={colors.blueBold} />}
              color={colors.blueSoft}
            />
            <SummaryCard
              title="Active children"
              value={`${children.length}`}
              icon={<Users size={20} color={colors.orangeBold} />}
              color={colors.orangeSoft}
            />
          </View>

          {/* By Child Table */}
          <View style={styles.tableContainer}>
            <Text style={styles.tableTitle}>By child</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.childColumn]}>Child</Text>
                <Text style={[styles.tableHeaderCell, styles.metricColumn]}>Present</Text>
                <Text style={[styles.tableHeaderCell, styles.metricColumn]}>Absent</Text>
                <Text style={[styles.tableHeaderCell, styles.metricColumn]}>Tardy</Text>
                <Text style={[styles.tableHeaderCell, styles.metricColumn]}>Minutes</Text>
              </View>
              
              {(summary?.by_child ?? []).map((child, index) => (
                <View key={child.child_id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, styles.childColumn]} numberOfLines={1}>
                    {getChildName(child.child_id)}
                  </Text>
                  <Text style={[styles.tableCell, styles.metricColumn]}>
                    {child.present_days || 0}
                  </Text>
                  <Text style={[styles.tableCell, styles.metricColumn]}>
                    {child.absent_days || 0}
                  </Text>
                  <Text style={[styles.tableCell, styles.metricColumn]}>
                    {child.tardy_days || 0}
                  </Text>
                  <Text style={[styles.tableCell, styles.metricColumn]}>
                    {child.minutes_present || 0}
                  </Text>
                </View>
              ))}
              
              {(!summary?.by_child || summary.by_child.length === 0) && (
                <View style={styles.emptyTable}>
                  <Text style={styles.emptyTableText}>No attendance data for this period</Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// Summary Card Component
function SummaryCard({ title, value, icon, color }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: color }]}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryTitle}>{title}</Text>
        {icon}
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  monthDisplay: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  monthText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  exportText: {
    fontSize: 14,
    color: colors.text,
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.muted,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  summaryCard: {
    flex: 1,
    minWidth: '30%',
    borderRadius: 12,
    padding: 16,
    ...shadows.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
    flex: 1,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  tableContainer: {
    margin: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  table: {
    padding: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  childColumn: {
    flex: 2,
  },
  metricColumn: {
    flex: 1,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowAlt: {
    backgroundColor: colors.panel,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  tableCell: {
    fontSize: 14,
    color: colors.text,
  },
  emptyTable: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTableText: {
    fontSize: 14,
    color: colors.muted,
    fontStyle: 'italic',
  },
});
