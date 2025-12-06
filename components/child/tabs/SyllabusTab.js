import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';
import SyllabusUpload from '../../SyllabusUpload';

export default function SyllabusTab({ child, familyId, onAddSyllabus }) {
  const [syllabusRows, setSyllabusRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchSyllabi = async () => {
    if (!child?.id) return;
    
    try {
      setLoading(true);
      
      const { data: syllabi, error } = await supabase
        .from('syllabi')
        .select('id, title, start_date, end_date, expected_total_minutes, expected_weekly_minutes, subject_id, upload_id')
        .eq('child_id', child.id)
        .order('created_at', { ascending: false });

      if (error && error.code !== 'PGRST116') throw error;

      if (!syllabi || syllabi.length === 0) {
        setSyllabusRows([]);
        setLoading(false);
        return;
      }

      // Fetch subject names separately
      const subjectIds = [...new Set(syllabi.map(s => s.subject_id).filter(Boolean))];
      const subjectLookup = {};
      
      if (subjectIds.length > 0) {
        const { data: subjects } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        
        (subjects || []).forEach(s => {
          subjectLookup[s.id] = s.name;
        });
      }

      // Fetch upload info separately
      const uploadIds = [...new Set(syllabi.map(s => s.upload_id).filter(Boolean))];
      const uploadLookup = {};
      
      if (uploadIds.length > 0) {
        const { data: uploads } = await supabase
          .from('uploads')
          .select('id, filename, url')
          .in('id', uploadIds);
        
        (uploads || []).forEach(u => {
          uploadLookup[u.id] = u;
        });
      }

      // Calculate completion percentage based on events completed vs expected
      const formattedSyllabi = await Promise.all(syllabi.map(async (syllabus) => {
        // Get events linked to this syllabus (if there's a way to link them)
        // For now, estimate based on subject events
        const { data: subjectEvents } = await supabase
          .from('events')
          .select('id, status')
          .eq('child_id', child.id)
          .eq('subject_id', syllabus.subject_id)
          .in('status', ['done', 'completed']);

        const completedMinutes = (subjectEvents?.length || 0) * 30; // Estimate 30 min per event
        const completionPct = syllabus.expected_total_minutes 
          ? Math.min(100, Math.round((completedMinutes / syllabus.expected_total_minutes) * 100))
          : 0;

        const upload = syllabus.upload_id ? uploadLookup[syllabus.upload_id] : null;

        return {
          id: syllabus.id,
          subject: syllabus.subject_id ? (subjectLookup[syllabus.subject_id] || 'Unassigned') : 'Unassigned',
          source: syllabus.title,
          linkLabel: upload ? 'View PDF' : 'View outline',
          completionPct,
          uploadUrl: upload?.url,
        };
      }));

      setSyllabusRows(formattedSyllabi);
    } catch (error) {
      console.error('Error fetching syllabi:', error);
      setSyllabusRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch syllabi when child changes
  useEffect(() => {
    fetchSyllabi();
  }, [child.id]);

  // Listen for refresh events
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleRefresh = () => {
        fetchSyllabi();
      };
      window.addEventListener('refreshSyllabi', handleRefresh);
      return () => {
        window.removeEventListener('refreshSyllabi', handleRefresh);
      };
    }
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Syllabus & curriculum</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              if (onAddSyllabus) {
                onAddSyllabus();
              } else {
                setShowAddModal(true);
              }
            }}
          >
            <Plus size={16} color={colors.accentContrast} />
            <Text style={styles.addButtonText}>Add Syllabus</Text>
          </TouchableOpacity>
        </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.headerText}>Subject</Text>
          <Text style={styles.headerText}>Syllabus source</Text>
          <Text style={styles.headerText}>Progress</Text>
        </View>

        {syllabusRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              Link a syllabus for each subject and we'll track progress against it.
            </Text>
          </View>
        ) : (
          <View>
            {syllabusRows.map((row, idx) => (
              <View
                key={row.id}
                style={[
                  styles.tableRow,
                  idx !== syllabusRows.length - 1 && styles.tableRowBorder
                ]}
              >
                <Text style={styles.subjectCell}>{row.subject}</Text>
                <View style={styles.sourceCell}>
                  <Text style={styles.sourceText}>{row.source}</Text>
                  {row.uploadUrl && (
                    <TouchableOpacity onPress={() => {
                      if (typeof window !== 'undefined' && window.open) {
                        window.open(row.uploadUrl, '_blank');
                      } else {
                        // For React Native, you might want to use Linking
                        console.log('Open URL:', row.uploadUrl);
                      }
                    }}>
                      <Text style={styles.linkText}>{row.linkLabel}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.progressCell}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressPct}>{row.completionPct}% complete</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View
                      style={[styles.progressFill, { width: `${row.completionPct}%` }]}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
      </ScrollView>

      {/* Add Syllabus Modal - use local state if onAddSyllabus not provided */}
      {!onAddSyllabus && (
        <SyllabusUpload
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSyllabusProcessed={(data) => {
            setShowAddModal(false);
            fetchSyllabi();
          }}
          child={child}
          familyId={familyId}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    padding: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  table: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    margin: 16,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.muted,
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subjectCell: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1.2,
  },
  sourceCell: {
    flex: 2,
    gap: 4,
  },
  sourceText: {
    fontSize: 12,
    color: colors.muted,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#7C3AED',
  },
  progressCell: {
    flex: 1.2,
    gap: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPct: {
    fontSize: 11,
    color: colors.muted,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#60A5FA',
    borderRadius: 999,
  },
  emptyState: {
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
  },
  subjectList: {
    maxHeight: 150,
  },
  subjectOption: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subjectOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  subjectOptionText: {
    fontSize: 14,
    color: colors.text,
  },
  subjectOptionTextSelected: {
    color: colors.accentContrast,
    fontWeight: '600',
  },
  methodToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  methodButtonText: {
    fontSize: 14,
    color: colors.muted,
  },
  methodButtonTextActive: {
    color: colors.accentContrast,
    fontWeight: '600',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  uploadButtonSuccess: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenBold,
  },
  uploadButtonTextSuccess: {
    color: colors.greenBold,
  },
  helpText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  saveButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});

