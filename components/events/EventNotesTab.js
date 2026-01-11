/**
 * EventNotesTab Component
 * Displays notes linked to an event and allows creating new notes
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { StickyNote, Plus, Edit2, Trash2, Bold, Italic, List, X } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import NoteEditorModal from '../records/NoteEditorModal';
import { createNote, deleteNote } from '../../lib/services/recordsClient';
import { apiRequest } from '../../lib/apiClient';

export default function EventNotesTab({ event, familyId, children = [] }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [availableEvents, setAvailableEvents] = useState([]);
  
  // Inline form state
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState('log');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const textAreaRef = useRef(null);
  const savingRef = useRef(false); // Ref to prevent double saves
  const deletingRef = useRef({}); // Track deleting state per note
  const lastSavePayloadRef = useRef(null); // Track last save payload to prevent exact duplicates
  const saveTimeoutRef = useRef(null); // Debounce timeout
  const lastSaveTimeRef = useRef(0); // Track when last save completed
  const saveInProgressRef = useRef(false); // Additional lock

  useEffect(() => {
    if (event?.id) {
      loadNotes();
      loadAvailableEvents();
    }
  }, [event?.id, familyId]);

  const loadNotes = async () => {
    if (!event?.id || !familyId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('family_id', familyId)
        .eq('linked_event_id', event.id)
        .order('created_at', { ascending: false });

      if (error) {
        setNotes([]);
      } else {
        setNotes(data || []);
      }
    } catch (err) {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableEvents = async () => {
    if (!familyId) return;
    try {
      const { data } = await supabase
        .from('events')
        .select('id, title, start_ts')
        .eq('family_id', familyId)
        .order('start_ts', { ascending: false })
        .limit(100);
      
      setAvailableEvents(data || []);
    } catch (err) {
    }
  };

  const handleNoteSaved = () => {
    setShowNoteEditor(false);
    setEditingNote(null);
    loadNotes();
  };

  const handleDeleteNote = async (noteId) => {
    // Prevent double-delete
    if (deletingRef.current[noteId]) {
      console.log('[EventNotesTab] Delete blocked - already deleting:', noteId);
      return;
    }
    
    deletingRef.current[noteId] = true;
    console.log('[EventNotesTab] Starting delete for note:', noteId);
    
    // Optimistically remove from UI
    const originalNotes = [...notes];
    setNotes(prev => prev.filter(note => note.id !== noteId));
    
    try {
      // Try API endpoint first
      let deleteSuccess = false;
      try {
        console.log('[EventNotesTab] Trying API delete endpoint');
        const result = await apiRequest(`/api/records/notes/${noteId}`, {
          method: 'DELETE',
        });
        
        if (!result.error) {
          console.log('[EventNotesTab] API delete successful');
          deleteSuccess = true;
        } else {
          console.log('[EventNotesTab] API delete returned error:', result.error);
        }
      } catch (apiErr) {
        console.log('[EventNotesTab] API delete failed, trying deleteNote function:', apiErr);
      }
      
      // Try deleteNote function from recordsClient
      if (!deleteSuccess) {
        try {
          console.log('[EventNotesTab] Trying deleteNote function');
          const result = await deleteNote(noteId);
          if (result.success) {
            console.log('[EventNotesTab] deleteNote function successful');
            deleteSuccess = true;
          } else if (result.error) {
            console.log('[EventNotesTab] deleteNote function returned error:', result.error);
            throw result.error;
          }
        } catch (deleteErr) {
          console.log('[EventNotesTab] deleteNote function failed, trying direct:', deleteErr);
          if (!deleteErr.message?.includes('404')) {
            throw deleteErr;
          }
        }
      }
      
      // Fallback to direct Supabase delete
      if (!deleteSuccess) {
        console.log('[EventNotesTab] Trying direct Supabase delete');
        const { data, error, count } = await supabase
          .from('notes')
          .delete()
          .eq('id', noteId);

        if (error) {
          console.error('[EventNotesTab] Direct delete error:', error);
          // Restore note in UI
          setNotes(originalNotes);
          alert(`Failed to delete note: ${error.message || 'Unknown error'}`);
          deletingRef.current[noteId] = false;
          return;
        }
        
        console.log('[EventNotesTab] Direct delete successful');
        deleteSuccess = true;
      }
      
      if (deleteSuccess) {
        deletingRef.current[noteId] = false;
        // Note already removed from UI via optimistic update
        // No need to reload - keeps the UI smooth without refresh shift
      }
    } catch (err) {
      console.error('[EventNotesTab] Delete exception:', err);
      // Restore note in UI
      setNotes(originalNotes);
      alert(`Failed to delete note: ${err.message || 'Unknown error'}`);
      deletingRef.current[noteId] = false;
    }
  };

  const handleEditNote = (note) => {
    setEditingNote(note);
    setShowNoteEditor(true);
  };

  const handleAddNote = () => {
    if (savingRef.current) return; // Don't allow opening form while saving
    setShowInlineForm(true);
    setContent('');
    setNoteType('log');
    setTags([]);
    setTagInput('');
    setError(null);
    setSaving(false);
  };

  const handleCancelInline = () => {
    if (savingRef.current || saving) return; // Prevent canceling while saving
    setShowInlineForm(false);
    setContent('');
    setNoteType('log');
    setTags([]);
    setTagInput('');
    setError(null);
    setSaving(false);
    savingRef.current = false;
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleTagInputKeyPress = (e) => {
    if (Platform.OS === 'web' && e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const applyTextFormat = (format) => {
    if (Platform.OS !== 'web' || !textAreaRef.current) return;
    
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    let replacement = '';
    
    switch (format) {
      case 'bold':
        replacement = selectedText ? `**${selectedText}**` : '**';
        break;
      case 'italic':
        replacement = selectedText ? `_${selectedText}_` : '_';
        break;
      case 'bullet':
        const lines = content.split('\n');
        const currentLine = content.substring(0, start).split('\n').length - 1;
        lines[currentLine] = lines[currentLine] ? `- ${lines[currentLine]}` : '- ';
        replacement = lines.join('\n');
        break;
      default:
        return;
    }
    
    if (format === 'bullet') {
      setContent(replacement);
      setTimeout(() => {
        textarea.focus();
        const newPos = replacement.length;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    } else {
      const newContent = content.substring(0, start) + replacement + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.focus();
        const newPos = format === 'bold' || format === 'italic' 
          ? (start + replacement.length)
          : (start + replacement.length - (selectedText ? 0 : 1));
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    }
  };

  const handleSaveInline = async () => {
    // Multiple layers of duplicate prevention
    const now = Date.now();
    
    // Layer 1: Check if save is in progress
    if (savingRef.current || saving || saveInProgressRef.current) {
      console.log('[EventNotesTab] Save blocked - already saving', { savingRef: savingRef.current, saving, inProgress: saveInProgressRef.current });
      return;
    }
    
    // Layer 2: Check if we just saved (within last 2 seconds)
    if (now - lastSaveTimeRef.current < 2000) {
      console.log('[EventNotesTab] Save blocked - too soon after last save');
      return;
    }
    
    if (!content.trim()) {
      setError('Note content cannot be empty');
      return;
    }
    
    const trimmedContent = content.trim();
    const payload = {
      family_id: familyId,
      text: trimmedContent,
      type: noteType,
      tags: tags.length > 0 ? tags : null,
      linked_event_id: event?.id || null,
    };
    
    if (event?.child_id && typeof event.child_id === 'string') {
      payload.child_id = event.child_id;
    }
    
    // Layer 3: Check if this exact payload was just saved
    const payloadKey = JSON.stringify(payload);
    if (lastSavePayloadRef.current === payloadKey) {
      console.log('[EventNotesTab] Duplicate save prevented - same payload');
      setError('This note was just saved. Please wait a moment.');
      return;
    }
    
    // Layer 4: Check for duplicate note created in the last 5 seconds
    const recentDuplicate = notes.find(note => 
      note.text === trimmedContent &&
      note.type === noteType &&
      note.linked_event_id === event?.id &&
      new Date(note.created_at).getTime() > Date.now() - 5000
    );
    
    if (recentDuplicate) {
      console.log('[EventNotesTab] Duplicate detected in local notes');
      setError('This note was just created. Please wait a moment.');
      return;
    }
    
    // Layer 5: Check database for recent duplicate (within last 5 seconds)
    try {
      const { data: recentNotes } = await supabase
        .from('notes')
        .select('id, text, type, linked_event_id, created_at')
        .eq('family_id', familyId)
        .eq('text', trimmedContent)
        .eq('type', noteType)
        .eq('linked_event_id', event?.id || null)
        .gte('created_at', new Date(Date.now() - 5000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (recentNotes && recentNotes.length > 0) {
        console.log('[EventNotesTab] Duplicate detected in database');
        setError('This note was just created. Please wait a moment.');
        // Reload notes to show the duplicate
        loadNotes();
        return;
      }
    } catch (checkErr) {
      console.log('[EventNotesTab] Duplicate check failed, proceeding:', checkErr);
      // Continue with creation if check fails
    }
    
    // Set ALL locks immediately (before any async operations)
    lastSavePayloadRef.current = payloadKey;
    lastSaveTimeRef.current = now;
    savingRef.current = true;
    saveInProgressRef.current = true;
    setSaving(true);
    setError(null);
    
    try {
      console.log('[EventNotesTab] Creating note with payload:', payload);
      const result = await createNote(payload);
      
      const createError = result.error || (result instanceof Error ? result : null);
      const createData = result.data || (result.error ? null : result);
      
      if (createError) {
        console.error('[EventNotesTab] Create error:', createError);
        setError(createError.message || 'Failed to create note');
        setSaving(false);
        savingRef.current = false;
        saveInProgressRef.current = false;
        // Clear payload ref on error so user can retry
        setTimeout(() => {
          lastSavePayloadRef.current = null;
          lastSaveTimeRef.current = 0;
        }, 5000);
      } else {
        console.log('[EventNotesTab] Note created successfully:', createData);
        // Add the new note to local state immediately (optimistic update)
        if (createData) {
          setNotes(prev => {
            // Double-check we're not adding a duplicate
            const exists = prev.find(n => 
              n.id === createData.id || 
              (n.text === createData.text && 
               n.type === createData.type && 
               n.linked_event_id === createData.linked_event_id &&
               Math.abs(new Date(n.created_at).getTime() - new Date(createData.created_at).getTime()) < 1000)
            );
            if (exists) {
              console.log('[EventNotesTab] Note already exists in state, not adding');
              return prev;
            }
            return [createData, ...prev];
          });
        }
        // Reset form before closing
        setContent('');
        setNoteType('log');
        setTags([]);
        setTagInput('');
        setError(null);
        setShowInlineForm(false);
        setSaving(false);
        savingRef.current = false;
        // Keep locks for 3 seconds to prevent duplicates
        setTimeout(() => {
          saveInProgressRef.current = false;
          lastSavePayloadRef.current = null;
        }, 3000);
        // Keep time lock for 2 seconds
        setTimeout(() => {
          lastSaveTimeRef.current = 0;
        }, 2000);
      }
    } catch (err) {
      console.error('[EventNotesTab] Save exception:', err);
      setError(err.message || 'An error occurred');
      setSaving(false);
      savingRef.current = false;
      saveInProgressRef.current = false;
      // Clear locks on error so user can retry
      setTimeout(() => {
        lastSavePayloadRef.current = null;
        lastSaveTimeRef.current = 0;
      }, 5000);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'observation': return '#3b82f6';
      case 'reflection': return '#8b5cf6';
      case 'milestone': return '#10b981';
      case 'concern': return '#f59e0b';
      case 'celebration': return '#ec4899';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent || colors.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Inline Note Composer - appears at top when active */}
      {showInlineForm && (
        <View style={styles.inlineComposer}>
          {/* Note Type Pills */}
          <View style={styles.typePillsRow}>
            {['log', 'reflection', 'concern'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.typePill, noteType === type && styles.typePillActive]}
                onPress={() => setNoteType(type)}
              >
                <Text style={[styles.typePillText, noteType === type && styles.typePillTextActive]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tags */}
          <View style={styles.tagsRow}>
            <TextInput
              style={styles.tagInputInline}
              placeholder="+ Tag"
              placeholderTextColor={colors.muted || 'rgba(15, 23, 42, 0.5)'}
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={handleAddTag}
              onKeyPress={handleTagInputKeyPress}
            />
            {tags.length > 0 && (
              <View style={styles.tagsInline}>
                {tags.map((tag, index) => (
                  <View key={index} style={styles.tagChipInline}>
                    <Text style={styles.tagChipText}>{tag}</Text>
                    <TouchableOpacity onPress={() => handleRemoveTag(tag)} style={styles.tagRemove}>
                      <X size={12} color={colors.muted || 'rgba(15, 23, 42, 0.5)'} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Divider */}
          <View style={styles.composerDivider} />

          {/* Note Editor - no visible border */}
          <TextInput
            ref={textAreaRef}
            style={styles.noteEditor}
            placeholder="Write your note…"
            placeholderTextColor={colors.muted || 'rgba(15, 23, 42, 0.5)'}
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* Helper text */}
          <Text style={styles.helperText}>
            You can tag progress, challenges, or breakthroughs.
          </Text>

          {error && (
            <Text style={styles.errorTextInline}>{error}</Text>
          )}

          {/* Actions */}
          <View style={styles.composerActions}>
            <TouchableOpacity
              style={styles.cancelButtonText}
              onPress={handleCancelInline}
              disabled={saving}
            >
              <Text style={styles.cancelButtonTextLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButtonPrimary, (saving || savingRef.current || saveInProgressRef.current) && styles.saveButtonDisabled]}
              onPress={(e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                if (saving || savingRef.current || saveInProgressRef.current) {
                  console.log('[EventNotesTab] Button click blocked', { saving, savingRef: savingRef.current, inProgress: saveInProgressRef.current });
                  return;
                }
                handleSaveInline();
              }}
              disabled={saving || savingRef.current || saveInProgressRef.current}
              activeOpacity={(saving || savingRef.current || saveInProgressRef.current) ? 1 : 0.7}
              {...(Platform.OS === 'web' ? { 
                className: 'btnPrimary',
                onClick: (e) => {
                  e?.preventDefault?.();
                  e?.stopPropagation?.();
                  if (saving || savingRef.current || saveInProgressRef.current) {
                    console.log('[EventNotesTab] Web onClick blocked', { saving, savingRef: savingRef.current, inProgress: saveInProgressRef.current });
                    return;
                  }
                  handleSaveInline();
                }
              } : {})}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white || '#ffffff'} />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Notes Area */}
      <ScrollView style={styles.notesArea} contentContainerStyle={styles.notesContent}>
        {notes.length === 0 && !showInlineForm ? (
          <View style={styles.emptyState}>
            <StickyNote size={32} color={colors.muted || 'rgba(15, 23, 42, 0.4)'} />
            <Text style={styles.emptyTitle}>Capture reflections, progress, or concerns from this lesson.</Text>
            <TouchableOpacity
              style={styles.emptyAddButton}
              onPress={handleAddNote}
              activeOpacity={0.7}
              {...(Platform.OS === 'web' ? { className: 'btnPrimary' } : {})}
            >
              <Text style={styles.emptyAddButtonText}>Add a note</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {notes.map((note) => {
              const child = children.find(c => c.id === note.child_id);
              return (
                <View key={note.id} style={styles.noteItem}>
                  <View style={styles.noteHeader}>
                    <View style={styles.noteHeaderLeft}>
                      <View
                        style={[
                          styles.typeBadge,
                          { backgroundColor: getTypeColor(note.type) + '20' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBadgeText,
                            { color: getTypeColor(note.type) },
                          ]}
                        >
                          {note.type || 'log'}
                        </Text>
                      </View>
                      {child && (
                        <Text style={styles.childName}>{child.first_name || child.name}</Text>
                      )}
                      <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
                    </View>
                  </View>

                  <Text style={styles.noteText}>{note.text}</Text>

                  {note.tags && Array.isArray(note.tags) && note.tags.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {note.tags.map((tag, index) => (
                        <View key={index} style={styles.tag}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.noteActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleEditNote(note)}
                      activeOpacity={0.7}
                    >
                      <Edit2 size={14} color={colors.muted} />
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton, deletingRef.current[note.id] && styles.actionButtonDisabled]}
                    onPress={async () => {
                      if (deletingRef.current[note.id]) {
                        console.log('[EventNotesTab] Delete button clicked but already deleting');
                        return; // Already deleting
                      }
                      
                      console.log('[EventNotesTab] Delete button clicked for note:', note.id);
                      
                      // Web-compatible confirmation
                      let confirmed = false;
                      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
                        confirmed = window.confirm('Are you sure you want to delete this note?');
                      } else {
                        // Native Alert.alert
                        confirmed = await new Promise((resolve) => {
                          Alert.alert(
                            'Delete Note',
                            'Are you sure you want to delete this note?',
                            [
                              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () => resolve(true),
                              },
                            ]
                          );
                        });
                      }
                      
                      if (confirmed) {
                        console.log('[EventNotesTab] Delete confirmed for note:', note.id);
                        handleDeleteNote(note.id);
                      } else {
                        console.log('[EventNotesTab] Delete cancelled');
                      }
                    }}
                    activeOpacity={0.7}
                    disabled={deletingRef.current[note.id]}
                  >
                      <Trash2 size={14} color={colors.error} />
                      <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            
            {/* Add Note button when there are notes */}
            {!showInlineForm && notes.length > 0 && (
              <TouchableOpacity
                style={styles.addNoteButton}
                onPress={handleAddNote}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' ? { className: 'btnPrimary' } : {})}
              >
                <Plus size={16} color={colors.white || '#ffffff'} />
                <Text style={styles.addNoteButtonText}>Add Note</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>


      <NoteEditorModal
        visible={showNoteEditor}
        onClose={() => {
          setShowNoteEditor(false);
          setEditingNote(null);
        }}
        onSaved={handleNoteSaved}
        familyId={familyId}
        defaultChildId={event?.child_id || null}
        defaultText=""
        linkedEventId={event?.id || null}
        availableEvents={availableEvents}
        editingNoteId={editingNote?.id || null}
        initialNote={editingNote}
        children={children}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  // Inline Composer - no nested card
  inlineComposer: {
    padding: 24,
    backgroundColor: 'rgba(124, 140, 255, 0.03)', // Light background tint
  },
  typePillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border || 'rgba(15, 23, 42, 0.1)',
  },
  typePillActive: {
    backgroundColor: colors.accent || colors.indigo || '#7c8cff',
    borderColor: colors.accent || colors.indigo || '#7c8cff',
  },
  typePillText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  typePillTextActive: {
    color: colors.white || '#ffffff',
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tagInputInline: {
    fontSize: 13,
    color: colors.text,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 60,
  },
  tagsInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChipInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124, 140, 255, 0.3)', // Pastel outline
    backgroundColor: 'transparent',
  },
  tagChipText: {
    fontSize: 12,
    color: colors.text || '#111827',
  },
  tagRemove: {
    padding: 2,
  },
  composerDivider: {
    height: 1,
    backgroundColor: colors.border || 'rgba(15, 23, 42, 0.08)',
    marginVertical: 16,
  },
  noteEditor: {
    fontSize: 14,
    color: colors.text,
    minHeight: 100,
    padding: 0,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && {
      fontFamily: 'inherit',
    }),
  },
  helperText: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    marginTop: 8,
    fontStyle: 'italic',
  },
  errorTextInline: {
    fontSize: 13,
    color: colors.error || '#e2556a',
    marginTop: 8,
  },
  composerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelButtonText: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  cancelButtonTextLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  saveButtonPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accent || colors.indigo || '#7c8cff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white || '#ffffff',
  },
  // Notes Area
  notesArea: {
    flex: 1,
  },
  notesContent: {
    padding: 24,
    gap: 16,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 14,
    color: colors.muted || 'rgba(15, 23, 42, 0.6)',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
    lineHeight: 20,
  },
  emptyAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent || colors.indigo || '#7c8cff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  emptyAddButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white || '#ffffff',
  },
  // Note Items (Timeline)
  noteItem: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || 'rgba(15, 23, 42, 0.08)',
  },
  noteHeader: {
    marginBottom: 8,
  },
  noteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  childName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  noteDate: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
  },
  noteText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124, 140, 255, 0.3)',
    backgroundColor: 'transparent',
  },
  tagText: {
    fontSize: 11,
    color: colors.text,
  },
  noteActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 0,
  },
  actionButtonText: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
  },
  deleteButton: {
    // Styled inline
  },
  deleteButtonText: {
    color: colors.error || '#e2556a',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  // Add Note Button (when notes exist)
  addNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent || colors.indigo || '#7c8cff',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  addNoteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white || '#ffffff',
  },
  // Inline form styles
  inlineForm: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    margin: 16,
    padding: 16,
  },
  inlineFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  inlineFormTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  inlineFormClose: {
    padding: 4,
  },
  errorContainer: {
    backgroundColor: colors.redSoft || '#fde2e4',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  errorText: {
    color: colors.error || '#e2556a',
    fontSize: 14,
  },
  inlineField: {
    marginBottom: 16,
  },
  inlineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  inlineSelect: {
    width: '100%',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    fontSize: 14,
    color: colors.text,
  },
  typeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  typeChipActive: {
    backgroundColor: colors.accent || colors.indigo || '#7c8cff',
    borderColor: colors.accent || colors.indigo || '#7c8cff',
  },
  typeChipText: {
    fontSize: 13,
    color: colors.text,
  },
  typeChipTextActive: {
    color: colors.white || '#ffffff',
    fontWeight: '600',
  },
  tagInputContainer: {
    marginBottom: 8,
  },
  tagInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  tagsDisplay: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  tagDisplayText: {
    fontSize: 12,
    color: colors.text,
  },
  formatToolbar: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    padding: 4,
    backgroundColor: colors.bg || colors.panel,
    borderRadius: 4,
  },
  formatButton: {
    padding: 6,
    borderRadius: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  noteTextInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    minHeight: 120,
    ...(Platform.OS === 'web' && {
      fontFamily: 'inherit',
    }),
  },
  inlineFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent || colors.indigo || '#7c8cff',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white || '#ffffff',
  },
});

