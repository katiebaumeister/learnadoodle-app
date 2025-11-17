import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { ChevronLeft, ChevronRight, Download, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';

export default function Attendance({ familyId }) {
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [rows, setRows] = useState([]);
  const [children, setChildren] = useState([]);
  const [selectedChildIds, setSelectedChildIds] = useState(null);
  const [loading, setLoading] = useState(false);

  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load children
      const { data: kids } = await supabase
        .from('children')
        .select('id, first_name')
        .eq('family_id', familyId)
        .eq('archived', false)
        .order('first_name');

      setChildren(kids || []);

      // Load attendance data using get_child_attendance per child and merge
      const rangeFrom = monthStart.toISOString().split('T')[0];
      const rangeTo = monthEnd.toISOString().split('T')[0];
      const targetChildren = (selectedChildIds && selectedChildIds.length)
        ? kids.filter(k => selectedChildIds.includes(k.id))
        : (kids || []);

      const allRows = [];
      for (const kid of targetChildren) {
        const { data: att, error } = await supabase.rpc('get_child_attendance', {
          p_child_id: kid.id,
          p_start_date: rangeFrom,
          p_end_date: rangeTo,
        });
        if (error) {
          console.warn('get_child_attendance error', error.message);
          continue;
        }
        const arr = Array.isArray(att) ? att : [];
        arr.forEach(row => {
          allRows.push({
            child_id: kid.id,
            day: row.date,
            status: row.status,
            minutes_present: row.minutes_present,
          });
        });
      }

      setRows(allRows);
    } catch (error) {
      console.error('Error loading attendance data:', error);
      Alert.alert('Error', 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (familyId) {
      loadData();
    }
  }, [familyId, monthStart.toISOString(), JSON.stringify(selectedChildIds)]);

  const setQuick = async (childId, dayISO, status) => {
    try {
      // Map UI intents to exceptions API
      let mappedStatus = status;
      let minutes = 0;
      if (status === 'present') {
        // Represent manual present as 'excused' with full-day minutes override
        mappedStatus = 'excused';
        minutes = 300;
      } else if (status === 'absent') {
        minutes = 0;
      }

      await supabase.rpc('upsert_attendance_exception', {
        p_family_id: familyId,
        p_child_id: childId,
        p_date: dayISO,
        p_status: mappedStatus,
        p_minutes_present: minutes,
        p_notes: null,
      });
      await loadData();
    } catch (error) {
      console.error('Error setting attendance:', error);
      Alert.alert('Error', 'Failed to update attendance');
    }
  };

  const exportCsv = () => {
    const header = ['date', 'child', 'status', 'minutes', 'notes'];
    const byId = new Map(children.map(c => [c.id, c.first_name]));
    const csv = [header.join(',')].concat(
      rows.map(r => [r.day, (byId.get(r.child_id) ?? r.child_id), r.status, r.minutes_present, ''].join(','))
    ).join('\n');
    
    // Create and download CSV
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${monthStart.getFullYear()}_${(monthStart.getMonth() + 1).toString().padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'present': return { bg: colors.greenSoft, text: colors.greenBold };
      case 'absent': return { bg: colors.redSoft, text: colors.redBold };
      case 'tardy': return { bg: colors.yellowSoft, text: colors.yellowBold };
      case 'excused': return { bg: colors.blueSoft, text: colors.blueBold };
      default: return { bg: colors.panel, text: colors.muted };
    }
  };

  const formatMonth = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatDay = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  };

  // Group rows by day
  const days = {};
  for (const r of rows) {
    if (!days[r.day]) days[r.day] = [];
    days[r.day].push(r);
  }

  // Generate calendar days
  const calendarDays = [];
  const firstDay = new Date(monthStart);
  const lastDay = new Date(monthEnd);
  
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    calendarDays.push(new Date(d));
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Attendance</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
          >
            <ChevronLeft size={16} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.monthDisplay}>
            <Text style={styles.monthText}>{formatMonth(monthStart)}</Text>
          </View>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
          >
            <ChevronRight size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportButton} onPress={exportCsv}>
            <Download size={16} color={colors.text} />
            <Text style={styles.exportText}>Export CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Child filter */}
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          {children.map(child => {
            const active = selectedChildIds?.includes(child.id) ?? false;
            return (
              <TouchableOpacity
                key={child.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => {
                  setSelectedChildIds(prev => {
                    if (!prev) return [child.id];
                    return prev.includes(child.id) 
                      ? prev.filter(id => id !== child.id) 
                      : [...prev, child.id];
                  });
                }}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {child.first_name}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.filterChip}
            onPress={() => setSelectedChildIds(null)}
          >
            <Text style={styles.filterChipText}>All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Month grid */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((day, i) => {
          const iso = day.toISOString().split('T')[0];
          const dayRows = days[iso] ?? [];
          
          return (
            <View key={iso} style={styles.dayCard}>
              <Text style={styles.dayHeader}>{formatDay(day)}</Text>
              
              {/* Attendance rows */}
              <View style={styles.attendanceList}>
                {dayRows.map(row => {
                  const child = children.find(c => c.id === row.child_id);
                  const statusColors = getStatusColor(row.status);
                  
                  return (
                    <View key={row.child_id} style={styles.attendanceRow}>
                      <Text style={styles.childName} numberOfLines={1}>
                        {child?.first_name || 'Child'}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                        <Text style={[styles.statusText, { color: statusColors.text }]}>
                          {row.status}{row.minutes_present ? ` • ${row.minutes_present}m` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Quick action buttons */}
              <View style={styles.quickActions}>
                {children.slice(0, 2).map(child => (
                  <View key={child.id} style={styles.actionGroup}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => setQuick(child.id, iso, 'present')}
                    >
                      <Check size={12} color={colors.greenBold} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => setQuick(child.id, iso, 'absent')}
                    >
                      <X size={12} color={colors.redBold} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
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
  filterSection: {
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blueBold,
  },
  filterChipText: {
    fontSize: 13,
    color: colors.text,
  },
  filterChipTextActive: {
    color: colors.blueBold,
    fontWeight: '500',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  dayCard: {
    width: '30%',
    minHeight: 120,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  dayHeader: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  attendanceList: {
    flex: 1,
    marginBottom: 8,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  childName: {
    fontSize: 11,
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
});
