/**
 * AI Workload Balancing Tab Component
 * Balance workload by cognitive load with pattern analysis
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar,
  Brain,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { balanceWorkload, optimizeSchedule, analyzeCognitivePatterns } from '../../lib/services/aiWorkloadClient';

export default function WorkloadBalancingTab({ familyId, children = [] }) {
  const [selectedChildId, setSelectedChildId] = useState(children.length > 0 ? children[0].id : null);
  const [dateRangeStart, setDateRangeStart] = useState(new Date().toISOString().split('T')[0]);
  const [dateRangeEnd, setDateRangeEnd] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [targetLoad, setTargetLoad] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [balanceData, setBalanceData] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [optimizing, setOptimizing] = useState(false);

  const handleAnalyze = async () => {
    if (!selectedChildId) return;

    setLoading(true);
    try {
      const { data, error } = await balanceWorkload(
        selectedChildId,
        dateRangeStart,
        dateRangeEnd,
        targetLoad
      );

      if (error) {
        console.error('Error analyzing workload:', error);
        return;
      }

      setBalanceData(data);
    } catch (err) {
      console.error('Exception analyzing workload:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzePatterns = async () => {
    if (!selectedChildId) return;

    setAnalyzing(true);
    try {
      const { data, error } = await analyzeCognitivePatterns(selectedChildId, 30);

      if (error) {
        console.error('Error analyzing patterns:', error);
        return;
      }

      setPatterns(data);
    } catch (err) {
      console.error('Exception analyzing patterns:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleOptimize = async () => {
    if (!selectedChildId) return;

    setOptimizing(true);
    try {
      const { data, error } = await optimizeSchedule(
        selectedChildId,
        dateRangeStart,
        dateRangeEnd,
        targetLoad
      );

      if (error) {
        console.error('Error optimizing schedule:', error);
        return;
      }

      // Reload balance data
      await handleAnalyze();
    } catch (err) {
      console.error('Exception optimizing schedule:', err);
    } finally {
      setOptimizing(false);
    }
  };

  const getLoadColor = (load) => {
    switch (load) {
      case 'low':
        return colors.green;
      case 'medium':
        return colors.blue;
      case 'high':
        return colors.red;
      default:
        return colors.textSecondary;
    }
  };

  const getLoadScore = (load) => {
    switch (load) {
      case 'low':
        return 1;
      case 'medium':
        return 2;
      case 'high':
        return 3;
      default:
        return 2;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <BarChart3 size={20} color={colors.indigo} />
            <Text style={styles.headerTitle}>Workload Balancing</Text>
          </View>
        </View>

        {/* Child Selector */}
        {children.length > 0 && (
          <View style={styles.childSelector}>
            <Text style={styles.selectorLabel}>Child:</Text>
            {children.map(child => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childButton,
                  selectedChildId === child.id && styles.childButtonActive
                ]}
                onPress={() => setSelectedChildId(child.id)}
              >
                <Text style={[
                  styles.childButtonText,
                  selectedChildId === child.id && styles.childButtonTextActive
                ]}>
                  {child.first_name || child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          <View style={styles.controlGroup}>
            <Text style={styles.controlLabel}>Date Range:</Text>
            <View style={styles.dateInputs}>
              <TextInput
                style={styles.dateInput}
                value={dateRangeStart}
                onChangeText={setDateRangeStart}
                placeholder="Start date"
              />
              <Text style={styles.dateSeparator}>to</Text>
              <TextInput
                style={styles.dateInput}
                value={dateRangeEnd}
                onChangeText={setDateRangeEnd}
                placeholder="End date"
              />
            </View>
          </View>

          <View style={styles.controlGroup}>
            <Text style={styles.controlLabel}>Target Load:</Text>
            <View style={styles.loadOptions}>
              {['low', 'medium', 'high'].map(load => (
                <TouchableOpacity
                  key={load}
                  style={[
                    styles.loadOption,
                    targetLoad === load && styles.loadOptionActive,
                    targetLoad === load && { backgroundColor: getLoadColor(load) + '20', borderColor: getLoadColor(load) }
                  ]}
                  onPress={() => setTargetLoad(load)}
                >
                  <Text style={[
                    styles.loadOptionText,
                    targetLoad === load && { color: getLoadColor(load), fontWeight: '600' }
                  ]}>
                    {load.charAt(0).toUpperCase() + load.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.analyzeButton]}
              onPress={handleAnalyze}
              disabled={loading || !selectedChildId}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <BarChart3 size={16} color={colors.white} />
                  <Text style={styles.actionButtonText}>Analyze</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.patternsButton]}
              onPress={handleAnalyzePatterns}
              disabled={analyzing || !selectedChildId}
            >
              {analyzing ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Brain size={16} color={colors.white} />
                  <Text style={styles.actionButtonText}>Patterns</Text>
                </>
              )}
            </TouchableOpacity>

            {balanceData && (
              <TouchableOpacity
                style={[styles.actionButton, styles.optimizeButton]}
                onPress={handleOptimize}
                disabled={optimizing || !selectedChildId}
              >
                {optimizing ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <RefreshCw size={16} color={colors.white} />
                    <Text style={styles.actionButtonText}>Optimize</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Balance Summary */}
      {balanceData && (
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Balance Summary</Text>
          <View style={styles.summaryCards}>
            <View style={styles.summaryCard}>
              <AlertTriangle size={20} color={colors.red} />
              <Text style={styles.summaryNumber}>{balanceData.summary?.overloaded_days || 0}</Text>
              <Text style={styles.summaryLabel}>Overloaded</Text>
            </View>
            <View style={styles.summaryCard}>
              <CheckCircle size={20} color={colors.green} />
              <Text style={styles.summaryNumber}>{balanceData.summary?.balanced_days || 0}</Text>
              <Text style={styles.summaryLabel}>Balanced</Text>
            </View>
            <View style={styles.summaryCard}>
              <TrendingUp size={20} color={colors.blue} />
              <Text style={styles.summaryNumber}>{balanceData.summary?.underloaded_days || 0}</Text>
              <Text style={styles.summaryLabel}>Underloaded</Text>
            </View>
          </View>

          {balanceData.balance_score !== undefined && (
            <View style={styles.balanceScore}>
              <Text style={styles.balanceScoreLabel}>Balance Score:</Text>
              <View style={styles.balanceScoreBar}>
                <View 
                  style={[
                    styles.balanceScoreFill,
                    { width: `${balanceData.balance_score * 100}%`, backgroundColor: colors.indigo }
                  ]}
                />
              </View>
              <Text style={styles.balanceScoreValue}>
                {Math.round(balanceData.balance_score * 100)}%
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Patterns */}
      {patterns && (
        <View style={styles.patternsSection}>
          <Text style={styles.sectionTitle}>Cognitive Load Patterns</Text>
          {patterns.patterns && Object.entries(patterns.patterns).map(([patternType, patternData]) => (
            <View key={patternType} style={styles.patternCard}>
              <Text style={styles.patternTitle}>{patternType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
              <Text style={styles.patternData}>{JSON.stringify(patternData, null, 2)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Daily Loads */}
      {balanceData && (
        <ScrollView style={styles.dailyLoadsSection}>
          <Text style={styles.sectionTitle}>Daily Load Breakdown</Text>
          {balanceData.overloaded_days && balanceData.overloaded_days.length > 0 && (
            <View style={styles.loadGroup}>
              <Text style={styles.loadGroupTitle}>Overloaded Days</Text>
              {balanceData.overloaded_days.map((day, idx) => (
                <View key={idx} style={[styles.dayCard, styles.overloadedDay]}>
                  <Text style={styles.dayDate}>{day.date}</Text>
                  <Text style={styles.dayLoad}>Load: {day.current_load} (target: {day.target_load})</Text>
                  <Text style={styles.dayMinutes}>{day.total_minutes} minutes</Text>
                </View>
              ))}
            </View>
          )}

          {balanceData.underloaded_days && balanceData.underloaded_days.length > 0 && (
            <View style={styles.loadGroup}>
              <Text style={styles.loadGroupTitle}>Underloaded Days</Text>
              {balanceData.underloaded_days.map((day, idx) => (
                <View key={idx} style={[styles.dayCard, styles.underloadedDay]}>
                  <Text style={styles.dayDate}>{day.date}</Text>
                  <Text style={styles.dayLoad}>Load: {day.current_load} (target: {day.target_load})</Text>
                  <Text style={styles.dayMinutes}>{day.total_minutes} minutes</Text>
                </View>
              ))}
            </View>
          )}

          {balanceData.suggestions && balanceData.suggestions.length > 0 && (
            <View style={styles.suggestionsSection}>
              <Text style={styles.sectionTitle}>Suggestions</Text>
              {balanceData.suggestions.map((suggestion, idx) => (
                <View key={idx} style={styles.suggestionCard}>
                  <Text style={styles.suggestionText}>{suggestion.reason}</Text>
                  <Text style={styles.suggestionDetail}>
                    Move "{suggestion.assignment_title}" from {suggestion.from_date} to {suggestion.to_date}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  childSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  childButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  childButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  childButtonTextActive: {
    color: colors.white,
    fontWeight: '500',
  },
  controls: {
    gap: 16,
  },
  controlGroup: {
    gap: 8,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  dateInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  dateSeparator: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  loadOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  loadOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadOptionActive: {
    borderWidth: 2,
  },
  loadOptionText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  analyzeButton: {
    backgroundColor: colors.indigo,
  },
  patternsButton: {
    backgroundColor: colors.purple,
  },
  optimizeButton: {
    backgroundColor: colors.green,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  summarySection: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  summaryCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  balanceScore: {
    gap: 8,
  },
  balanceScoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  balanceScoreBar: {
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  balanceScoreFill: {
    height: '100%',
    borderRadius: 4,
  },
  balanceScoreValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.indigo,
  },
  patternsSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  patternCard: {
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  patternTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  patternData: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  dailyLoadsSection: {
    flex: 1,
    padding: 16,
  },
  loadGroup: {
    marginBottom: 24,
  },
  loadGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  dayCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  overloadedDay: {
    backgroundColor: colors.red + '20',
    borderColor: colors.red,
  },
  underloadedDay: {
    backgroundColor: colors.blue + '20',
    borderColor: colors.blue,
  },
  dayDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  dayLoad: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  dayMinutes: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  suggestionsSection: {
    marginTop: 24,
  },
  suggestionCard: {
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  suggestionDetail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

