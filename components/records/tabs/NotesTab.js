/**
 * Notes Tab
 * Notes list, editor, filters, export
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Platform } from 'react-native';
import { StickyNote, Plus, Filter, Download, FileText, Tag, Link, Calendar, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';
import ChildAccordion from '../ChildAccordion';

export default function NotesTab({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  resolvedChildIds,
  onAddNote,
}) {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [filters, setFilters] = useState({
    child: null,
    subject: null,
    type: null,
    tag: null,
  });
  const [subjects, setSubjects] = useState([]);
  const [allTags, setAllTags] = useState([]);

  useEffect(() => {
    loadSubjects();
  }, [familyId]);

  const loadSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      if (!error && data) {
        setSubjects(data);
      }
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [familyId, resolvedChildIds, dateRange, filters]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const { getNotes } = await import('../../../lib/services/recordsClient');
      // Apply child filter to resolvedChildIds if needed
      const childIdsToUse = filters.child 
        ? (resolvedChildIds.includes(filters.child) ? [filters.child] : [])
        : resolvedChildIds;
      const notesData = await getNotes(familyId, childIdsToUse, dateRange, filters);
      
      // Extract all unique tags for filter
      const tagsSet = new Set();
      notesData.forEach(note => {
        if (note.tags) {
          const tagsArray = Array.isArray(note.tags) ? note.tags : [note.tags];
          tagsArray.forEach(tag => {
            if (tag && tag.trim()) tagsSet.add(tag.trim());
          });
        }
      });
      setAllTags(Array.from(tagsSet).sort());

      // Map to display format
      const mapped = notesData.map(note => {
        const child = children.find(c => c.id === note.child_id);
        const date = new Date(note.created_at || note.start_ts);
        const tagsArray = Array.isArray(note.tags) ? note.tags : (note.tags ? [note.tags] : []);
        return {
          id: note.id,
          timestamp: date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
          child_id: note.child_id,
          child: child?.first_name || 'Unknown',
          content: note.text || note.description || '',
          type: note.type || 'log',
          tags: tagsArray.filter(t => t && t.trim()),
          linked_evidence_id: note.linked_evidence_id,
          linked_event_id: note.linked_event_id,
          subject_id: note.subject_id,
        };
      });
      
      setNotes(mapped);
    } catch (error) {
      console.error('Error loading notes:', error);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  // Group notes by child for accordion display
  const notesByChild = useMemo(() => {
    if (resolvedChildIds.length <= 1 || filters.child) {
      return null; // Don't group if single child or child filter is active
    }
    
    const grouped = {};
    notes.forEach(note => {
      const childId = note.child_id;
      if (!childId) {
        // Notes without child_id go to a "Family" group
        if (!grouped['family']) {
          grouped['family'] = [];
        }
        grouped['family'].push(note);
      } else {
        if (!grouped[childId]) {
          grouped[childId] = [];
        }
        grouped[childId].push(note);
      }
    });
    
    return grouped;
  }, [notes, resolvedChildIds, filters.child]);

  const handleSaveNote = async () => {
    if (!editorContent.trim()) return;
    
    try {
      const { createNote, updateNote } = await import('../../../lib/services/recordsClient');
      
      if (editingNote) {
        // Update existing note
        await updateNote(editingNote.id, {
          text: editorContent.trim(),
        });
      } else {
        // Create new note
        const childId = resolvedChildIds.length === 1 ? resolvedChildIds[0] : null;
        const payload = {
          family_id: familyId,
          text: editorContent.trim(),
          type: 'log',
        };
        
        // Only include child_id if it's a valid string
        if (childId && typeof childId === 'string') {
          payload.child_id = childId;
        } else {
          payload.child_id = null; // Family-level note
        }
        
        await createNote(payload);
      }
      
      setShowEditor(false);
      setEditorContent('');
      setEditingNote(null);
      loadNotes();
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Failed to save note. Please try again.');
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    try {
      const { deleteNote } = await import('../../../lib/services/recordsClient');
      await deleteNote(noteId);
      loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      alert('Failed to delete note. Please try again.');
    }
  };

  const handleExport = (format) => {
    // Client-side CSV export
    if (format === 'csv') {
      const csv = [
        ['Date', 'Child', 'Type', 'Content'].join(','),
        ...notes.map(note => [
          note.timestamp,
          note.child,
          note.type,
          `"${note.content.replace(/"/g, '""')}"`,
        ].join(','))
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notes_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } else {
      alert('PDF export coming soon');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Tab Header */}
      <View style={styles.tabHeader}>
        <View style={[styles.accentDot, { backgroundColor: '#eab308' }]} />
        <StickyNote size={20} color="#eab308" />
        <Text style={styles.tabTitle}>Notes</Text>
      </View>

      {/* Filters */}
      <View style={styles.section}>
        <View style={styles.filtersRow}>
          <Filter size={16} color={colors.textSecondary} />
          <Text style={styles.filtersLabel}>Filters:</Text>
        </View>
        
        {/* Child filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
          <TouchableOpacity
            onPress={() => setFilters(prev => ({ ...prev, child: null }))}
            style={[styles.filterChip, !filters.child && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, !filters.child && styles.filterChipTextActive]}>
              All Children
            </Text>
          </TouchableOpacity>
          {children.map(child => (
            <TouchableOpacity
              key={child.id}
              onPress={() => setFilters(prev => ({ ...prev, child: prev.child === child.id ? null : child.id }))}
              style={[styles.filterChip, filters.child === child.id && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filters.child === child.id && styles.filterChipTextActive]}>
                {child.first_name || child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Type filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
          <TouchableOpacity
            onPress={() => setFilters(prev => ({ ...prev, type: null }))}
            style={[styles.filterChip, !filters.type && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, !filters.type && styles.filterChipTextActive]}>
              All Types
            </Text>
          </TouchableOpacity>
          {['log', 'observation', 'praise', 'concern'].map(type => (
            <TouchableOpacity
              key={type}
              onPress={() => setFilters(prev => ({ ...prev, type: prev.type === type ? null : type }))}
              style={[styles.filterChip, filters.type === type && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filters.type === type && styles.filterChipTextActive]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Subject filter */}
        {subjects.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            <TouchableOpacity
              onPress={() => setFilters(prev => ({ ...prev, subject: null }))}
              style={[styles.filterChip, !filters.subject && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, !filters.subject && styles.filterChipTextActive]}>
                All Subjects
              </Text>
            </TouchableOpacity>
            {subjects.map(subject => (
              <TouchableOpacity
                key={subject.id}
                onPress={() => setFilters(prev => ({ ...prev, subject: prev.subject === subject.id ? null : subject.id }))}
                style={[styles.filterChip, filters.subject === subject.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filters.subject === subject.id && styles.filterChipTextActive]}>
                  {subject.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Tag filter */}
        {allTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            <TouchableOpacity
              onPress={() => setFilters(prev => ({ ...prev, tag: null }))}
              style={[styles.filterChip, !filters.tag && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, !filters.tag && styles.filterChipTextActive]}>
                All Tags
              </Text>
            </TouchableOpacity>
            {allTags.map(tag => (
              <TouchableOpacity
                key={tag}
                onPress={() => setFilters(prev => ({ ...prev, tag: prev.tag === tag ? null : tag }))}
                style={[styles.filterChip, filters.tag === tag && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filters.tag === tag && styles.filterChipTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setEditingNote(null);
              setEditorContent('');
              setShowEditor(true);
            }}
          >
            <Plus size={16} color={colors.white} />
            <Text style={styles.addButtonText}>Add Note</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('pdf')}
          >
            <Download size={16} color={colors.indigo} />
            <Text style={styles.exportButtonText}>Export PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('csv')}
          >
            <FileText size={16} color={colors.indigo} />
            <Text style={styles.exportButtonText}>Export CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notes List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes ({notes.length})</Text>
        {notes.length === 0 ? (
          <View style={styles.emptyState}>
            {/* Skeleton List */}
            <View style={styles.skeletonList}>
              {[1, 2, 3].map(i => (
                <View key={i} style={styles.skeletonNoteCard}>
                  <View style={styles.skeletonNoteHeader}>
                    <View style={styles.skeletonNoteLine} />
                    <View style={[styles.skeletonNoteLine, { width: 80 }]} />
                  </View>
                  <View style={[styles.skeletonNoteLine, { width: '90%' }]} />
                  <View style={[styles.skeletonNoteLine, { width: '70%' }]} />
                </View>
              ))}
            </View>
            
            {/* CTA and Why It Matters */}
            <View style={styles.emptyContent}>
              <Text style={styles.emptyTitle}>Start taking notes</Text>
              <Text style={styles.emptyDescription}>
                Notes help you track observations, concerns, and wins. They can be linked to evidence, events, or subjects for better organization.
              </Text>
              <TouchableOpacity
                style={styles.emptyCTA}
                onPress={() => {
                  setEditingNote(null);
                  setEditorContent('');
                  setShowEditor(true);
                }}
              >
                <StickyNote size={16} color={colors.white} />
                <Text style={styles.emptyCTAText}>Add First Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : notesByChild ? (
          // Multiple children - show in accordions
          <View style={styles.childAccordions}>
            {resolvedChildIds.map(childId => {
              const child = children.find(c => c.id === childId);
              if (!child) return null;
              const childNotes = notesByChild[childId] || [];
              
              return (
                <ChildAccordion
                  key={childId}
                  child={child}
                  defaultExpanded={false}
                  hideChildName={true}
                  summary={{}}
                >
                  <View style={styles.notesList}>
                    {childNotes.map(note => (
                      <View key={note.id} style={styles.noteCard}>
                        <View style={styles.noteHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.noteTimestamp}>{note.timestamp}</Text>
                          </View>
                          <View style={[styles.noteBadge, styles[`noteBadge${note.type.charAt(0).toUpperCase() + note.type.slice(1)}`]]}>
                            <Text style={styles.noteBadgeText}>{note.type}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDeleteNote(note.id)}
                            style={{ padding: 4 }}
                          >
                            <Text style={{ color: colors.orange, fontSize: 12 }}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.noteContent}>{note.content}</Text>
                        
                        {/* Tags */}
                        {note.tags && note.tags.length > 0 && (
                          <View style={styles.noteTags}>
                            {note.tags.slice(0, 3).map((tag, idx) => (
                              <View key={idx} style={styles.noteTagChip}>
                                <Tag size={10} color={colors.textSecondary} />
                                <Text style={styles.noteTagText}>{tag}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        
                        {/* Links */}
                        {(note.linked_evidence_id || note.linked_event_id) && (
                          <View style={styles.noteLinks}>
                            {note.linked_evidence_id && (
                              <View style={styles.noteLink}>
                                <FileText size={12} color={colors.textSecondary} />
                                <Text style={styles.noteLinkText}>Linked to evidence</Text>
                              </View>
                            )}
                            {note.linked_event_id && (
                              <View style={styles.noteLink}>
                                <Calendar size={12} color={colors.textSecondary} />
                                <Text style={styles.noteLinkText}>Linked to event</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </ChildAccordion>
              );
            })}
            {/* Family notes (no child_id) */}
            {notesByChild['family'] && notesByChild['family'].length > 0 && (
              <ChildAccordion
                child={{ first_name: 'Family', name: 'Family', id: 'family' }}
                defaultExpanded={false}
                summary={{}}
              >
                <View style={styles.notesList}>
                  {notesByChild['family'].map(note => (
                    <View key={note.id} style={styles.noteCard}>
                      <View style={styles.noteHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.noteTimestamp}>{note.timestamp}</Text>
                        </View>
                        <View style={[styles.noteBadge, styles[`noteBadge${note.type.charAt(0).toUpperCase() + note.type.slice(1)}`]]}>
                          <Text style={styles.noteBadgeText}>{note.type}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteNote(note.id)}
                          style={{ padding: 4 }}
                        >
                          <Text style={{ color: colors.orange, fontSize: 12 }}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.noteContent}>{note.content}</Text>
                      
                      {note.tags && note.tags.length > 0 && (
                        <View style={styles.noteTags}>
                          {note.tags.slice(0, 3).map((tag, idx) => (
                            <View key={idx} style={styles.noteTagChip}>
                              <Tag size={10} color={colors.textSecondary} />
                              <Text style={styles.noteTagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </ChildAccordion>
            )}
          </View>
        ) : (
          // Single child or filtered - show flat list
          <View style={styles.notesList}>
            {notes.map(note => (
              <View key={note.id} style={styles.noteCard}>
                <View style={styles.noteHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noteTimestamp}>{note.timestamp}</Text>
                    {note.child && (
                      <Text style={styles.noteChild}>Child: {note.child}</Text>
                    )}
                  </View>
                  <View style={[styles.noteBadge, styles[`noteBadge${note.type.charAt(0).toUpperCase() + note.type.slice(1)}`]]}>
                    <Text style={styles.noteBadgeText}>{note.type}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteNote(note.id)}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ color: colors.orange, fontSize: 12 }}>Delete</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.noteContent}>{note.content}</Text>
                
                {/* Tags */}
                {note.tags && note.tags.length > 0 && (
                  <View style={styles.noteTags}>
                    {note.tags.slice(0, 3).map((tag, idx) => (
                      <View key={idx} style={styles.noteTagChip}>
                        <Tag size={10} color={colors.textSecondary} />
                        <Text style={styles.noteTagText}>{tag}</Text>
                      </View>
                    ))}
                    {note.tags.length > 3 && (
                      <Text style={styles.noteTagMore}>+{note.tags.length - 3} more</Text>
                    )}
                  </View>
                )}

                {/* Linked items */}
                <View style={styles.noteLinks}>
                  {note.linked_evidence_id && (
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          const url = `/records?tab=portfolio&evidenceId=${note.linked_evidence_id}`;
                          if (window.__ldSearchNavigate) {
                            window.__ldSearchNavigate('records', null, { tab: 'portfolio', evidenceId: note.linked_evidence_id });
                          } else {
                            window.location.href = url;
                          }
                        }
                      }}
                      style={styles.noteLink}
                    >
                      <Link size={12} color={colors.indigo} />
                      <Text style={styles.noteLinkText}>Linked evidence</Text>
                    </TouchableOpacity>
                  )}
                  {note.linked_event_id && (
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          const url = `/planner?child=${note.child_id || ''}`;
                          if (window.__ldSearchNavigate) {
                            window.__ldSearchNavigate('planner', null, { child: note.child_id });
                          } else {
                            window.location.href = url;
                          }
                        }
                      }}
                      style={styles.noteLink}
                    >
                      <Calendar size={12} color={colors.indigo} />
                      <Text style={styles.noteLinkText}>Linked event</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Note Editor Modal */}
      {showEditor && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Note</Text>
              <TouchableOpacity onPress={() => setShowEditor(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                style={styles.editorInput}
                placeholder="Write your note here..."
                placeholderTextColor={colors.textSecondary}
                value={editorContent}
                onChangeText={setEditorContent}
                multiline
                numberOfLines={6}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowEditor(false);
                    setEditorContent('');
                    setEditingNote(null);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveNote}
                >
                  <Text style={styles.saveButtonText}>Save Note</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
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
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filtersLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  filterChips: {
    flex: 1,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.white,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportButtonText: {
    fontSize: 14,
    color: colors.indigo,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  notesList: {
    gap: 12,
  },
  noteCard: {
    padding: 16,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTimestamp: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  noteBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  noteBadgeLog: {
    backgroundColor: colors.textSecondary + '20',
  },
  noteBadgeObservation: {
    backgroundColor: colors.blueSoft,
  },
  noteBadgePraise: {
    backgroundColor: colors.greenSoft,
  },
  noteBadgeConcern: {
    backgroundColor: colors.orangeSoft,
  },
  noteBadgeText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '500',
  },
  noteTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  noteTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.panel,
    borderRadius: 8,
  },
  noteTagText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  noteTagMore: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  noteLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noteLinkText: {
    fontSize: 11,
    color: colors.indigo,
    fontWeight: '500',
  },
  noteChild: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  noteContent: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  linkedArtifacts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  linkedText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyState: {
    padding: 24,
  },
  skeletonList: {
    gap: 12,
    marginBottom: 24,
  },
  skeletonNoteCard: {
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    gap: 8,
  },
  skeletonNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  skeletonNoteLine: {
    height: 14,
    backgroundColor: colors.background,
    borderRadius: 4,
    width: '50%',
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
    backgroundColor: '#eab308',
    borderRadius: 8,
  },
  emptyCTAText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  childAccordions: {
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 40,
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 600,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    fontSize: 14,
    color: colors.indigo,
    fontWeight: '500',
  },
  modalBody: {
    gap: 12,
  },
  editorInput: {
    minHeight: 120,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});

