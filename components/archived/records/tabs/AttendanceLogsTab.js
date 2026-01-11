/**
 * Attendance & Logs Tab
 * Day list, weekly summaries, log editor
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Clock, Calendar, TrendingUp, Edit, Plus, FileText, LogIn } from 'lucide-react';
import { colors } from '../../../../theme/colors';
import AttendanceLogEditorModal from '../AttendanceLogEditorModal';
import ChildAccordion from '../ChildAccordion';
import CheckInOutButton from '../../attendance/CheckInOutButton';
import ManualAttendanceModal from '../../attendance/ManualAttendanceModal';
import AttendanceReportsModal from '../../attendance/AttendanceReportsModal';

export default function AttendanceLogsTab({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  resolvedChildIds,
  onOpenPlanner,
}) {
  const [loading, setLoading] = useState(true);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [weeklySummaries, setWeeklySummaries] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const lastLoadRef = useRef(null);
  
  // Editor modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('create'); // 'create' | 'edit'
  const [editorLog, setEditorLog] = useState(null);
  const [editorDefaultDate, setEditorDefaultDate] = useState(null);
  const [editorDefaultChildId, setEditorDefaultChildId] = useState(null);

  // New modals state
  const [showManualAttendance, setShowManualAttendance] = useState(false);
  const [showAttendanceReports, setShowAttendanceReports] = useState(false);
  const [manualAttendanceDate, setManualAttendanceDate] = useState(null);

  // Create stable string representation of dateRange and resolvedChildIds for dependency comparison
  const dateRangeKey = useMemo(() => {
    if (!dateRange) return '';
    const start = dateRange.start instanceof Date ? dateRange.start.toISOString() : dateRange.start;
    const end = dateRange.end instanceof Date ? dateRange.end.toISOString() : dateRange.end;
    return `${start}|${end}`;
  }, [dateRange?.start, dateRange?.end]);

  const childIdsKey = useMemo(() => {
    return Array.isArray(resolvedChildIds) ? resolvedChildIds.sort().join(',') : '';
  }, [resolvedChildIds]);

  const childrenKey = useMemo(() => {
    return children.map(c => c.id).sort().join(',');
  }, [children]);

  // Memoize loadAttendanceData to prevent infinite loops
  const loadAttendanceData = useCallback(async () => {
    // Prevent rapid successive calls
    const now = Date.now();
    if (lastLoadRef.current && now - lastLoadRef.current < 1000) {
      return;
    }
    lastLoadRef.current = now;
    
    setLoading(true);
    try {
      const { getAttendanceLogs } = await import('../../../lib/services/recordsClient');
      const logs = await getAttendanceLogs(familyId, resolvedChildIds, dateRange);
      
      // Map to display format
      const mapped = logs.map(log => {
        const child = children.find(c => c.id === log.child_id);
        return {
          id: log.id,
          date: log.day_date,
          child_id: log.child_id,
          child_name: child?.first_name || 'Unknown',
          minutes: log.minutes || 0,
          notes: log.note || '',
          status: log.status || 'present',
          event_id: log.event_id,
        };
      });
      
      setAttendanceLogs(mapped);
      
      // Calculate weekly summaries
      const summaries = calculateWeeklySummaries(mapped);
      setWeeklySummaries(summaries);
    } catch (error) {
      setAttendanceLogs([]);
      setWeeklySummaries([]);
    } finally {
      setLoading(false);
    }
  }, [familyId, childIdsKey, dateRangeKey, childrenKey]); // Use stable keys instead of objects/arrays

  useEffect(() => {
    loadAttendanceData();
  }, [loadAttendanceData]);

  const calculateWeeklySummaries = (logs) => {
    // Group logs by week
    const weekMap = {};
    
    logs.forEach(log => {
      const date = new Date(log.date);
      const weekStart = getWeekStart(date);
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weekMap[weekKey]) {
        weekMap[weekKey] = {
          week: `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          hours: 0,
          subjects: new Set(),
          onTrack: true,
        };
      }
      
      weekMap[weekKey].hours += Math.floor((log.minutes || 0) / 60);
    });
    
    // Convert to array and sort by date (newest first)
    return Object.values(weekMap)
      .sort((a, b) => new Date(b.week) - new Date(a.week))
      .map(summary => ({
        ...summary,
        subjects: summary.subjects.size,
        onTrack: summary.hours >= 20, // Consider on track if >= 20 hours/week
      }));
  };

  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  // Get current date from dateRange for default
  const currentDate = dateRange?.start 
    ? (dateRange.start instanceof Date 
        ? dateRange.start.toISOString().split('T')[0] 
        : dateRange.start)
    : new Date().toISOString().split('T')[0];
  
  const defaultChildId = resolvedChildIds && resolvedChildIds.length > 0 
    ? resolvedChildIds[0] 
    : null;

  return (
    <ScrollView style={styles.container}>
      {/* Tab Header */}
      <View style={styles.tabHeader}>
        <View style={[styles.accentDot, { backgroundColor: '#22c55e' }]} />
        <Clock size={20} color="#22c55e" />
        <Text style={styles.tabTitle}>Attendance & Logs</Text>
      </View>

      {/* Header with Action Buttons */}
      <View style={styles.headerRow}>
        <View style={styles.sectionHeader}>
          <Clock size={20} color="#22c55e" />
          <Text style={styles.sectionTitle}>Attendance & Logs</Text>
        </View>
        <View style={styles.headerActions}>
          {resolvedChildIds.length === 1 && (
            <CheckInOutButton
              childId={resolvedChildIds[0]}
              familyId={familyId}
              onStatusChange={() => loadAttendanceData()}
            />
          )}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              setManualAttendanceDate(currentDate);
              setShowManualAttendance(true);
            }}
          >
            <LogIn size={14} color={colors.indigo} />
            <Text style={styles.actionButtonText}>Manual</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              setEditorMode('create');
              setEditorLog(null);
              setEditorDefaultDate(currentDate);
              setEditorDefaultChildId(defaultChildId);
              setIsEditorOpen(true);
            }}
          >
            <Plus size={14} color={colors.white} />
            <Text style={styles.addButtonText}>Add log</Text>
          </TouchableOpacity>
          {resolvedChildIds.length === 1 && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowAttendanceReports(true)}
            >
              <FileText size={14} color={colors.indigo} />
              <Text style={styles.actionButtonText}>Report</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Weekly Summaries */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <TrendingUp size={20} color="#22c55e" />
          <Text style={styles.sectionTitle}>Weekly Summaries</Text>
        </View>
        <View style={styles.summariesGrid}>
          {weeklySummaries.map((summary, idx) => (
            <View key={idx} style={styles.summaryCard}>
              <Text style={styles.summaryWeek}>{summary.week}</Text>
              <Text style={styles.summaryHours}>{summary.hours}h</Text>
              <Text style={styles.summarySubjects}>{summary.subjects} subjects</Text>
              <View style={[styles.statusBadge, summary.onTrack && styles.statusBadgeOnTrack]}>
                <Text style={styles.statusText}>{summary.onTrack ? 'On Track' : 'Off Track'}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Day List - Child-Specific */}
      {resolvedChildIds.length > 1 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Calendar size={20} color="#22c55e" />
            <Text style={styles.sectionTitle}>Per-Child Attendance</Text>
          </View>
          {attendanceLogs.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyContent}>
                <Text style={styles.emptyTitle}>Start logging attendance</Text>
                <Text style={styles.emptyDescription}>
                  Track daily learning hours to meet state requirements and build comprehensive records
                </Text>
                <TouchableOpacity
                  style={styles.emptyCTA}
                  onPress={() => {
                    setEditorMode('create');
                    setEditorLog(null);
                    setEditorDefaultDate(currentDate);
                    setEditorDefaultChildId(defaultChildId);
                    setIsEditorOpen(true);
                  }}
                >
                  <Clock size={16} color={colors.white} />
                  <Text style={styles.emptyCTAText}>Add First Log</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            resolvedChildIds.map(childId => {
              const child = children.find(c => c.id === childId);
              if (!child) return null;
              
              // Filter logs for this child
              const childLogs = attendanceLogs.filter(log => log.child_id === childId);
              const childHours = Math.floor(childLogs.reduce((sum, log) => sum + (log.minutes || 0), 0) / 60);
              
              return (
                <ChildAccordion
                  key={childId}
                  child={child}
                  defaultExpanded={false}
                  summary={{
                    attendanceHours: childHours,
                  }}
                >
                  <View style={styles.childLogsContent}>
                    {(() => {
                      // Group logs by date for this child
                      const logsByDate = {};
                      childLogs.forEach(log => {
                        if (!logsByDate[log.date]) {
                          logsByDate[log.date] = [];
                        }
                        logsByDate[log.date].push(log);
                      });
                      
                      const sortedDates = Object.keys(logsByDate).sort((a, b) => new Date(b) - new Date(a));
                      
                      if (sortedDates.length === 0) {
                        return (
                          <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No attendance logs for this child</Text>
                          </View>
                        );
                      }
                      
                      return sortedDates.map(date => {
                        const dayLogs = logsByDate[date];
                        const today = new Date().toISOString().split('T')[0];
                        const isToday = date === today;
                        
                        return (
                          <View key={date} style={styles.dayBox}>
                            <View style={styles.dayBoxHeader}>
                              <Text style={styles.dayBoxDate}>
                                {isToday ? 'Today' : new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </Text>
                              <TouchableOpacity
                                style={styles.quickAddButton}
                                onPress={() => {
                                  setEditorMode('create');
                                  setEditorLog(null);
                                  setEditorDefaultDate(date);
                                  setEditorDefaultChildId(childId);
                                  setIsEditorOpen(true);
                                }}
                              >
                                <Plus size={12} color="#22c55e" />
                                <Text style={styles.quickAddButtonText}>Add log</Text>
                              </TouchableOpacity>
                            </View>
                            
                            {dayLogs.length > 0 ? (
                              <View style={styles.dayLogsList}>
                                {dayLogs.map(log => (
                                  <TouchableOpacity
                                    key={log.id}
                                    style={styles.logCard}
                                    onPress={() => setSelectedLog(log)}
                                  >
                                    <View style={styles.logHeader}>
                                      <Text style={styles.logMinutes}>{Math.floor(log.minutes / 60)}h {log.minutes % 60}m</Text>
                                    </View>
                                    {log.notes ? (
                                      <Text style={styles.logNotes}>{log.notes}</Text>
                                    ) : null}
                                    <View style={styles.logStatus}>
                                      <Text style={styles.logStatusText}>Status: {log.status}</Text>
                                    </View>
                                    <View style={styles.logActions}>
                                      <TouchableOpacity
                                        style={styles.logAction}
                                        onPress={() => onOpenPlanner?.(log.child_id, log.date)}
                                      >
                                        <Clock size={14} color="#22c55e" />
                                        <Text style={styles.logActionText}>Open in Planner</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.editButton}
                                        onPress={() => {
                                          setEditorMode('edit');
                                          setEditorLog(log);
                                          setEditorDefaultDate(log.date);
                                          setEditorDefaultChildId(log.child_id);
                                          setIsEditorOpen(true);
                                        }}
                                      >
                                        <Edit size={12} color={colors.textSecondary} />
                                        <Text style={styles.editButtonText}>Edit</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.noLogsText}>No logs for this day</Text>
                            )}
                          </View>
                        );
                      });
                    })()}
                  </View>
                </ChildAccordion>
              );
            })
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Calendar size={20} color="#22c55e" />
            <Text style={styles.sectionTitle}>Day List</Text>
          </View>
          <View style={styles.logsList}>
            {attendanceLogs.length === 0 ? (
            <View style={styles.emptyState}>
              {/* Skeleton List */}
              <View style={styles.skeletonList}>
                {[1, 2, 3].map(i => (
                  <View key={i} style={styles.skeletonLogCard}>
                    <View style={styles.skeletonLogHeader}>
                      <View style={styles.skeletonLogLine} />
                      <View style={[styles.skeletonLogLine, { width: 60 }]} />
                    </View>
                    <View style={[styles.skeletonLogLine, { width: '70%' }]} />
                  </View>
                ))}
              </View>
              
              {/* CTA and Why It Matters */}
              <View style={styles.emptyContent}>
                <Text style={styles.emptyTitle}>Start logging attendance</Text>
                <Text style={styles.emptyDescription}>
                  Track daily learning hours to meet state requirements and build comprehensive records
                </Text>
                <TouchableOpacity
                  style={styles.emptyCTA}
                  onPress={() => {
                    setEditorMode('create');
                    setEditorLog(null);
                    setEditorDefaultDate(currentDate);
                    setEditorDefaultChildId(defaultChildId);
                    setIsEditorOpen(true);
                  }}
                >
                  <Clock size={16} color={colors.white} />
                  <Text style={styles.emptyCTAText}>Add First Log</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (() => {
            // Group logs by date
            const logsByDate = {};
            attendanceLogs.forEach(log => {
              if (!logsByDate[log.date]) {
                logsByDate[log.date] = [];
              }
              logsByDate[log.date].push(log);
            });
            
            // Sort dates descending
            const sortedDates = Object.keys(logsByDate).sort((a, b) => new Date(b) - new Date(a));
            
            if (sortedDates.length === 0) {
              return null;
            }
            
            return sortedDates.map(date => {
              const dayLogs = logsByDate[date];
              const today = new Date().toISOString().split('T')[0];
              const isToday = date === today;
              
              return (
                <View key={date} style={styles.dayBox}>
                  <View style={styles.dayBoxHeader}>
                    <Text style={styles.dayBoxDate}>
                      {isToday ? 'Today' : new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                      style={styles.quickAddButton}
                      onPress={() => {
                        setEditorMode('create');
                        setEditorLog(null);
                        setEditorDefaultDate(date);
                        setEditorDefaultChildId(defaultChildId);
                        setIsEditorOpen(true);
                      }}
                    >
                      <Plus size={12} color={colors.indigo} />
                      <Text style={styles.quickAddButtonText}>Add log</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {dayLogs.length > 0 ? (
                    <View style={styles.dayLogsList}>
                      {dayLogs.map(log => (
                        <TouchableOpacity
                          key={log.id}
                          style={styles.logCard}
                          onPress={() => setSelectedLog(log)}
                        >
                          <View style={styles.logHeader}>
                            <View>
                              {log.child_name ? (
                                <Text style={styles.logChild}>{log.child_name}</Text>
                              ) : null}
                            </View>
                            <Text style={styles.logMinutes}>{Math.floor(log.minutes / 60)}h {log.minutes % 60}m</Text>
                          </View>
                          {log.notes ? (
                            <Text style={styles.logNotes}>{log.notes}</Text>
                          ) : null}
                          <View style={styles.logStatus}>
                            <Text style={styles.logStatusText}>Status: {log.status}</Text>
                          </View>
                          <View style={styles.logActions}>
                            <TouchableOpacity
                              style={styles.logAction}
                              onPress={() => onOpenPlanner?.(log.child_id, log.date)}
                            >
                              <Clock size={14} color={colors.indigo} />
                              <Text style={styles.logActionText}>Open in Planner</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.editButton}
                              onPress={() => {
                                setEditorMode('edit');
                                setEditorLog(log);
                                setEditorDefaultDate(log.date);
                                setEditorDefaultChildId(log.child_id);
                                setIsEditorOpen(true);
                              }}
                            >
                              <Edit size={12} color={colors.textSecondary} />
                              <Text style={styles.editButtonText}>Edit</Text>
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noLogsText}>No logs for this day</Text>
                  )}
                </View>
              );
            });
          })()}
        </View>
      </View>
      )}

      {/* Attendance Log Editor Modal */}
      <AttendanceLogEditorModal
        isOpen={isEditorOpen}
        mode={editorMode}
        initialLog={editorLog}
        familyId={familyId}
        defaultDate={editorDefaultDate}
        defaultChildId={editorDefaultChildId}
        children={children}
        onClose={() => setIsEditorOpen(false)}
        onSaved={() => {
          // Re-fetch logs
          loadAttendanceData();
        }}
      />

      {/* Manual Attendance Modal */}
      {resolvedChildIds.length === 1 && (
        <ManualAttendanceModal
          visible={showManualAttendance}
          childId={resolvedChildIds[0]}
          defaultDate={manualAttendanceDate}
          onClose={() => setShowManualAttendance(false)}
          onSaved={() => {
            loadAttendanceData();
            setShowManualAttendance(false);
          }}
        />
      )}

      {/* Attendance Reports Modal */}
      {resolvedChildIds.length === 1 && (
        <AttendanceReportsModal
          visible={showAttendanceReports}
          childId={resolvedChildIds[0]}
          childName={children.find(c => c.id === resolvedChildIds[0])?.first_name}
          dateRange={dateRange}
          onClose={() => setShowAttendanceReports(false)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.indigo,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.indigo,
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  summariesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: '48%',
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryWeek: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  summaryHours: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.indigo,
    marginBottom: 2,
  },
  summarySubjects: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.orange,
  },
  statusBadgeOnTrack: {
    backgroundColor: colors.green,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  logsList: {
    gap: 16,
  },
  dayBox: {
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayBoxDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.background,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.indigo,
  },
  quickAddButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.indigo,
  },
  dayLogsList: {
    gap: 8,
  },
  logCard: {
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noLogsText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  logChild: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  logStatus: {
    marginTop: 8,
  },
  logStatusText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  logMinutes: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.indigo,
  },
  logNotes: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  logSubjects: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  subjectTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.background,
    borderRadius: 4,
  },
  subjectTagText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  logActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  logAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logActionText: {
    fontSize: 13,
    color: '#22c55e',
    fontWeight: '500',
  },
  childLogsContent: {
    gap: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editButtonText: {
    fontSize: 11,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  emptyState: {
    padding: 24,
  },
  skeletonList: {
    gap: 12,
    marginBottom: 24,
  },
  skeletonLogCard: {
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    gap: 8,
  },
  skeletonLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonLogLine: {
    height: 14,
    backgroundColor: colors.background,
    borderRadius: 4,
    width: '40%',
  },
  emptyContent: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 400,
    lineHeight: 20,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  emptyCTAText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
});

