import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Download, Filter, Calendar, GraduationCap, FileText } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { getGrades } from '../../lib/services/recordsClient';
import GeistCard from '../GeistCard';

export default function TranscriptBuilder({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [grades, setGrades] = useState([]);
  const [filteredGrades, setFilteredGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYears, setSelectedYears] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadGrades();
  }, [childId]);

  useEffect(() => {
    applyFilters();
  }, [grades, selectedYears]);

  const loadGrades = async () => {
    try {
      setLoading(true);
      const allGrades = await getGrades(childId);
      setGrades(allGrades);
      
      // Extract unique years from term labels
      const years = new Set();
      allGrades.forEach(grade => {
        if (grade.term_label) {
          // Extract year from term label (e.g., "2024-2025 Semester 1" -> "2024-2025")
          const match = grade.term_label.match(/(\d{4}-\d{4})/);
          if (match) {
            years.add(match[1]);
          } else {
            // Try to extract from created_at
            const date = new Date(grade.created_at);
            const year = date.getFullYear();
            const schoolYear = date.getMonth() >= 8 
              ? `${year}-${year + 1}`
              : `${year - 1}-${year}`;
            years.add(schoolYear);
          }
        } else {
          // Fallback to created_at year
          const date = new Date(grade.created_at);
          const year = date.getFullYear();
          const schoolYear = date.getMonth() >= 8 
            ? `${year}-${year + 1}`
            : `${year - 1}-${year}`;
          years.add(schoolYear);
        }
      });
      
      const sortedYears = Array.from(years).sort().reverse();
      setAvailableYears(sortedYears);
      setSelectedYears(sortedYears); // Select all by default
    } catch (error) {
      console.error('Error loading grades:', error);
      setGrades([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    if (selectedYears.length === 0) {
      setFilteredGrades([]);
      return;
    }

    const filtered = grades.filter(grade => {
      if (!grade.term_label) {
        // Use created_at as fallback
        const date = new Date(grade.created_at);
        const year = date.getFullYear();
        const schoolYear = date.getMonth() >= 8 
          ? `${year}-${year + 1}`
          : `${year - 1}-${year}`;
        return selectedYears.includes(schoolYear);
      }
      
      const match = grade.term_label.match(/(\d{4}-\d{4})/);
      if (match) {
        return selectedYears.includes(match[1]);
      }
      return true;
    });

    // Sort by term label and subject
    filtered.sort((a, b) => {
      const termCompare = (b.term_label || '').localeCompare(a.term_label || '');
      if (termCompare !== 0) return termCompare;
      const subjectA = a.subject?.name || '';
      const subjectB = b.subject?.name || '';
      return subjectA.localeCompare(subjectB);
    });

    setFilteredGrades(filtered);
  };

  const toggleYear = (year) => {
    if (selectedYears.includes(year)) {
      setSelectedYears(selectedYears.filter(y => y !== year));
    } else {
      setSelectedYears([...selectedYears, year]);
    }
  };

  const selectAllYears = () => {
    setSelectedYears([...availableYears]);
  };

  const clearAllYears = () => {
    setSelectedYears([]);
  };

  const formatGrade = (grade) => {
    if (grade.grade) return grade.grade;
    if (grade.score != null) {
      // Convert score to letter grade if needed
      if (grade.score >= 90) return 'A';
      if (grade.score >= 80) return 'B';
      if (grade.score >= 70) return 'C';
      if (grade.score >= 60) return 'D';
      return 'F';
    }
    return '-';
  };

  const handleExport = () => {
    // TODO: Implement transcript export
    alert('Transcript export coming soon!');
  };

  // Group grades by term
  const groupedByTerm = filteredGrades.reduce((acc, grade) => {
    const term = grade.term_label || 'Ungrouped';
    if (!acc[term]) {
      acc[term] = [];
    }
    acc[term].push(grade);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: tokens.text }]}>Transcript Builder</Text>
          <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>
            Generate official transcripts with multi-year grade records
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.filterButton, { borderColor: tokens.border }]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} color={tokens.text} />
            <Text style={[styles.filterButtonText, { color: tokens.text }]}>Filter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: tokens.accent }]}
            onPress={handleExport}
          >
            <Download size={16} color={tokens.surface} />
            <Text style={[styles.exportButtonText, { color: tokens.surface }]}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Year Filters */}
      {showFilters && (
        <GeistCard variant="small" style={styles.filterCard}>
          <View style={styles.filterHeader}>
            <Text style={[styles.filterTitle, { color: tokens.text }]}>Filter by School Year</Text>
            <View style={styles.filterActions}>
              <TouchableOpacity onPress={selectAllYears}>
                <Text style={[styles.filterLink, { color: tokens.accent }]}>Select All</Text>
              </TouchableOpacity>
              <Text style={[styles.filterDivider, { color: tokens.textSecondary }]}>|</Text>
              <TouchableOpacity onPress={clearAllYears}>
                <Text style={[styles.filterLink, { color: tokens.accent }]}>Clear All</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.yearChips}>
            {availableYears.map(year => (
              <TouchableOpacity
                key={year}
                style={[
                  styles.yearChip,
                  {
                    backgroundColor: selectedYears.includes(year) ? tokens.accent : tokens.bg,
                    borderColor: tokens.border,
                  }
                ]}
                onPress={() => toggleYear(year)}
              >
                <Text
                  style={[
                    styles.yearChipText,
                    {
                      color: selectedYears.includes(year) ? tokens.surface : tokens.text,
                    }
                  ]}
                >
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </GeistCard>
      )}

      {loading ? (
        <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading transcript data...</Text>
      ) : filteredGrades.length === 0 ? (
        <GeistCard variant="small">
          <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
            {selectedYears.length === 0
              ? 'Please select at least one school year to view grades.'
              : 'No grades found for the selected years.'}
          </Text>
        </GeistCard>
      ) : (
        <ScrollView style={styles.content}>
          {Object.entries(groupedByTerm).map(([term, termGrades]) => (
            <GeistCard key={term} variant="medium" style={styles.termCard}>
              <Text style={[styles.termTitle, { color: tokens.text }]}>{term}</Text>
              
              {/* Multi-column table */}
              <View style={styles.table}>
                {/* Table Header */}
                <View style={[styles.tableHeader, { borderBottomColor: tokens.border }]}>
                  <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 2 }]}>Subject</Text>
                  <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 1 }]}>Grade</Text>
                  <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 1 }]}>Score</Text>
                  <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 1 }]}>Credits</Text>
                  <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 2 }]}>Term</Text>
                </View>

                {/* Table Rows */}
                {termGrades.map((grade, idx) => (
                  <View
                    key={grade.id || idx}
                    style={[
                      styles.tableRow,
                      { borderBottomColor: tokens.border },
                      idx === termGrades.length - 1 && styles.tableRowLast
                    ]}
                  >
                    <Text style={[styles.tableCell, { color: tokens.text, flex: 2, fontWeight: '500' }]}>
                      {grade.subject?.name || 'Unnamed Subject'}
                    </Text>
                    <Text style={[styles.tableCell, { color: tokens.text, flex: 1, fontWeight: '600' }]}>
                      {formatGrade(grade)}
                    </Text>
                    <Text style={[styles.tableCell, { color: tokens.textSecondary, flex: 1 }]}>
                      {grade.score != null ? grade.score.toFixed(1) : '-'}
                    </Text>
                    <Text style={[styles.tableCell, { color: tokens.textSecondary, flex: 1 }]}>
                      {grade.credits || '-'}
                    </Text>
                    <Text style={[styles.tableCell, { color: tokens.textSecondary, flex: 2 }]}>
                      {grade.term_label || '-'}
                    </Text>
                  </View>
                ))}
              </View>
            </GeistCard>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterCard: {
    marginBottom: spacing.md,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  filterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  filterLink: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterDivider: {
    fontSize: 14,
  },
  yearChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  yearChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  yearChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  content: {
    flex: 1,
  },
  termCard: {
    marginBottom: spacing.lg,
    padding: 0,
    overflow: 'hidden',
  },
  termTitle: {
    fontSize: 18,
    fontWeight: '600',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    padding: spacing.md,
    borderBottomWidth: 2,
    backgroundColor: '#F9FAFB',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    fontSize: 14,
    paddingRight: spacing.sm,
  },
});
