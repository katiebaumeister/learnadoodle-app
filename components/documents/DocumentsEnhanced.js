import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, Alert } from 'react-native';
import { Search, X, FileText, Upload as UploadIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';
import SplitButton from '../ui/SplitButton';
import SyllabusWizard from './SyllabusWizard';
import SyllabusViewer from './SyllabusViewer';
import Uploads from './Uploads';

export default function DocumentsEnhanced({ familyId, initialChildren = [] }) {
  const [tab, setTab] = useState('syllabi'); // 'syllabi' | 'files'
  const [q, setQ] = useState('');
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [children, setChildren] = useState(initialChildren);
  const [subjects, setSubjects] = useState([]);
  const [syllabi, setSyllabi] = useState([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [viewingSyllabus, setViewingSyllabus] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load children and subjects
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        if (children.length === 0) {
          const { data: kids } = await supabase
            .from('children')
            .select('id, first_name')
            .eq('family_id', familyId)
            .eq('archived', false)
            .order('first_name');
          setChildren(kids || []);
        }

        const { data: subs } = await supabase
          .from('subject')
          .select('id, name')
          .eq('family_id', familyId)
          .order('name');
        setSubjects(subs || []);
      } catch (error) {
        console.error('Error loading metadata:', error);
      }
    };

    if (familyId) {
      loadMetadata();
    }
  }, [familyId]);

  // Load syllabi function
  const loadSyllabi = async () => {
    if (tab !== 'syllabi' || !familyId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('syllabi')
        .select('*')
        .eq('family_id', familyId);

      if (selectedSubjects.length > 0) {
        query = query.in('subject_id', selectedSubjects);
      }

      if (selectedChildren.length > 0) {
        query = query.in('child_id', selectedChildren);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setSyllabi(data || []);
    } catch (error) {
      console.error('Error loading syllabi:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load syllabi when dependencies change
  useEffect(() => {
    if (familyId && tab === 'syllabi') {
      loadSyllabi();
    }
  }, [familyId, tab, q, selectedSubjects]);

  // Keyboard shortcut: Cmd/Ctrl+Shift+U to open wizard
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'u') {
          e.preventDefault();
          setWizardOpen(true);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  const handleFileUpload = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = async (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          const file = files[0];
          const randomId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const path = `${familyId}/${randomId}_${file.name}`;

          try {
            const { error: uploadError } = await supabase.storage
              .from('evidence')
              .upload(path, file, {
                contentType: file.type,
                metadata: { family_id: familyId }
              });

            if (uploadError) throw uploadError;

            await supabase.rpc('create_upload_record', {
              _family: familyId,
              _child: null,
              _subject: null,
              _event: null,
              _path: path,
              _mime: file.type || 'application/octet-stream',
              _bytes: file.size,
              _title: file.name,
              _tags: [],
              _notes: null
            });

            Alert.alert('Success', 'File uploaded successfully');
            if (tab === 'files') {
              // Trigger reload in Uploads component
            }
          } catch (error) {
            console.error('Error uploading file:', error);
            Alert.alert('Error', 'Failed to upload file');
          }
        }
      };
      input.click();
    }
  };

  const toggleChildFilter = (childId) => {
    setSelectedChildren(prev => 
      prev.includes(childId) 
        ? prev.filter(id => id !== childId)
        : [...prev, childId]
    );
  };

  const toggleSubjectFilter = (subjectId) => {
    setSelectedSubjects(prev => 
      prev.includes(subjectId) 
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const clearFilters = () => {
    setSelectedChildren([]);
    setSelectedSubjects([]);
    setQ('');
  };

  const hasActiveFilters = selectedChildren.length > 0 || selectedSubjects.length > 0 || q.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Documents</Text>
          <Text style={styles.subtitle}>Syllabi, lesson materials, and evidence.</Text>
        </View>
        <SplitButton
          label="Add"
          onAddDoc={() => setWizardOpen(true)}
          onImportFile={handleFileUpload}
          onCopyTemplate={() => setWizardOpen(true)}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setTab('syllabi')}
          style={[styles.tab, tab === 'syllabi' && styles.tabActive]}
          activeOpacity={0.7}
        >
          <FileText size={16} color={tab === 'syllabi' ? colors.indigoBold : colors.text} />
          <Text style={[styles.tabText, tab === 'syllabi' && styles.tabTextActive]}>
            Syllabi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTab('files')}
          style={[styles.tab, tab === 'files' && styles.tabActive]}
          activeOpacity={0.7}
        >
          <UploadIcon size={16} color={tab === 'files' ? colors.indigoBold : colors.text} />
          <Text style={[styles.tabText, tab === 'files' && styles.tabTextActive]}>
            Files
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {/* Search */}
        <View style={styles.searchContainer}>
          <Search size={16} color={colors.muted} style={styles.searchIcon} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search…"
            style={styles.searchInput}
            placeholderTextColor={colors.muted}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')} style={styles.searchClear}>
              <X size={14} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Divider */}
        <View style={styles.filterDivider} />

        {/* Child filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterGroup}>
            {children.map(child => (
              <TouchableOpacity
                key={child.id}
                onPress={() => toggleChildFilter(child.id)}
                style={[
                  styles.filterPill,
                  selectedChildren.includes(child.id) && styles.filterPillActive
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    selectedChildren.includes(child.id) && styles.filterPillTextActive
                  ]}
                >
                  {child.first_name || child.name}
                </Text>
              </TouchableOpacity>
            ))}
            {selectedChildren.length > 0 && (
              <TouchableOpacity
                onPress={() => setSelectedChildren([])}
                style={styles.filterPill}
                activeOpacity={0.7}
              >
                <Text style={styles.filterPillText}>All children</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Subject filters */}
          {subjects.length > 0 && (
            <>
              <View style={styles.filterDivider} />
              <View style={styles.filterGroup}>
                {subjects.map(subject => (
                  <TouchableOpacity
                    key={subject.id}
                    onPress={() => toggleSubjectFilter(subject.id)}
                    style={[
                      styles.filterPill,
                      selectedSubjects.includes(subject.id) && styles.filterPillActiveSubject
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        selectedSubjects.includes(subject.id) && styles.filterPillTextActive
                      ]}
                    >
                      {subject.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                {selectedSubjects.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSelectedSubjects([])}
                    style={styles.filterPill}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.filterPillText}>All subjects</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Clear all */}
          {hasActiveFilters && (
            <TouchableOpacity
              onPress={clearFilters}
              style={[styles.filterPill, styles.filterPillClear]}
              activeOpacity={0.7}
            >
              <X size={14} color={colors.muted} />
              <Text style={styles.filterPillText}>Clear all</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {tab === 'syllabi' ? (
          <View style={styles.listContainer}>
            {loading ? (
              <Text style={styles.emptyText}>Loading...</Text>
            ) : syllabi.length > 0 ? (
              <View style={styles.grid}>
                {syllabi.map(syllabus => (
                  <TouchableOpacity
                    key={syllabus.id}
                    style={styles.syllabusCard}
                    onPress={() => setViewingSyllabus(syllabus.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.syllabusTitle}>{syllabus.title}</Text>
                    {syllabus.notes && (
                      <Text style={styles.syllabusDescription} numberOfLines={2}>
                        {syllabus.notes}
                      </Text>
                    )}
                    <View style={styles.syllabusMeta}>
                      {syllabus.start_date && (
                        <Text style={styles.syllabusMetaText}>
                          {new Date(syllabus.start_date).toLocaleDateString()}
                        </Text>
                      )}
                      {syllabus.end_date && (
                        <Text style={styles.syllabusMetaText}>
                          {' - ' + new Date(syllabus.end_date).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No syllabi yet</Text>
                <Text style={styles.emptyHint}>
                  Add a syllabus to see it here
                </Text>
                <TouchableOpacity
                  onPress={() => setWizardOpen(true)}
                  style={styles.emptyButton}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emptyButtonText}>Add Syllabus</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <Uploads 
            familyId={familyId} 
            initialChildren={children}
            searchQuery={q}
            childFilter={selectedChildren.length > 0 ? selectedChildren : null}
          />
        )}
      </ScrollView>

      {/* Syllabus Wizard */}
      {wizardOpen && (
        <SyllabusWizard
          familyId={familyId}
          children={children}
          subjects={subjects}
          onClose={() => {
            setWizardOpen(false);
            if (tab === 'syllabi') {
              // Reload syllabi
              loadSyllabi();
            }
          }}
          visible={wizardOpen}
        />
      )}

      {/* Syllabus Viewer */}
      {viewingSyllabus && (
        <Modal
          visible={!!viewingSyllabus}
          animationType="slide"
          onRequestClose={() => setViewingSyllabus(null)}
        >
          <SyllabusViewer
            syllabusId={viewingSyllabus}
            onClose={() => setViewingSyllabus(null)}
            onSuggestPlan={async () => {
              // Generate suggestions
              try {
                const res = await fetch(`/api/syllabus/${viewingSyllabus}/suggest`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                if (data.success) {
                  Alert.alert('Success', 'Plan suggestions generated!');
                }
              } catch (err) {
                console.error('Error generating suggestions:', err);
                Alert.alert('Error', 'Failed to generate suggestions');
              }
            }}
            onAcceptPlan={(events) => {
              Alert.alert('Success', `Created ${events.length} events`);
              setViewingSyllabus(null);
            }}
          />
        </Modal>
      )}
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
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  tabs: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabActive: {
    backgroundColor: colors.indigoSoft,
    borderColor: colors.indigoBold,
  },
  tabText: {
    fontSize: 14,
    color: colors.text,
  },
  tabTextActive: {
    fontWeight: '500',
    color: colors.indigoBold,
  },
  filters: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    outlineStyle: 'none',
  },
  searchClear: {
    padding: 4,
  },
  filterDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterPillActive: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenBold,
  },
  filterPillActiveSubject: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blueBold,
  },
  filterPillClear: {
    backgroundColor: colors.panel,
  },
  filterPillText: {
    fontSize: 14,
    color: colors.text,
  },
  filterPillTextActive: {
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 24,
  },
  listContainer: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  syllabusCard: {
    width: '100%',
    maxWidth: 320,
    padding: 16,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  syllabusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  syllabusDescription: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 12,
  },
  syllabusMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  syllabusMetaText: {
    fontSize: 12,
    color: colors.muted,
  },
  emptyCard: {
    padding: 48,
    borderRadius: colors.radiusMd,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  emptyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  emptyButtonText: {
    fontSize: 14,
    color: colors.text,
  },
});

