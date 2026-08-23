/**
 * Note Editor Modal
 * Reusable note editor that can be opened from anywhere
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Platform } from 'react-native';
import { X, Save, Bold, List, Italic, Link, Calendar } from 'lucide-react';
import { createNote, updateNote, getEvidenceById } from '../../lib/services/recordsClient';
import { colors } from '../../theme/colors';

export default function NoteEditorModal({
  visible,
  onClose,
  onSaved,
  familyId,
  defaultChildId = null,
  defaultText = '',
  linkedEvidenceId = null,
  linkedEventId = null,
  availableEvents = [],
  editingNoteId = null,
  initialNote = null,
  children = [],
  defaultSubject = null,
}) {
  const [content, setContent] = useState('');
  const [selectedChildId, setSelectedChildId] = useState(defaultChildId);
  const [noteType, setNoteType] = useState('log');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedLinkedEventId, setSelectedLinkedEventId] = useState(linkedEventId || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [linkedEvidence, setLinkedEvidence] = useState(null);
  const [linkedEvent, setLinkedEvent] = useState(null);
  const textAreaRef = useRef(null);
  
  useEffect(() => {
    if (visible) {
      if (initialNote) {
        // Editing existing note
        setContent(initialNote.text || initialNote.description || defaultText);
        setSelectedChildId(initialNote.child_id || defaultChildId);
        setNoteType(initialNote.type || 'log');
        // Handle tags - ensure it's always an array
        const tagsArray = Array.isArray(initialNote.tags) 
          ? initialNote.tags 
          : (initialNote.tags ? [initialNote.tags] : []);
        setTags(tagsArray.filter(t => t && t.trim()));
        setTagInput('');
        setSelectedLinkedEventId(initialNote.linked_event_id || linkedEventId || null);
      } else {
        // Creating new note
        setContent(defaultText);
        setSelectedChildId(defaultChildId);
        setNoteType('log');
        setTags([]);
        setTagInput('');
        setSelectedLinkedEventId(linkedEventId || null);
      }
      setError(null);
    }
  }, [visible, defaultText, defaultChildId, initialNote, linkedEventId]);

  // Load linked evidence preview
  useEffect(() => {
    if (visible && linkedEvidenceId && familyId) {
      getEvidenceById(familyId, linkedEvidenceId)
        .then(({ data, error }) => {
          if (!error && data) {
            setLinkedEvidence(data);
          }
        })
        .catch(() => {
          setLinkedEvidence(null);
        });
    } else {
      setLinkedEvidence(null);
    }
  }, [visible, linkedEvidenceId, familyId]);

  // Load linked event preview
  useEffect(() => {
    if (visible && (selectedLinkedEventId || linkedEventId) && availableEvents) {
      const eventId = selectedLinkedEventId || linkedEventId;
      const event = availableEvents.find(e => e.id === eventId);
      if (event) {
        setLinkedEvent(event);
      } else {
        setLinkedEvent({ id: eventId, title: `Event #${eventId}`, start_ts: null });
      }
    } else {
      setLinkedEvent(null);
    }
  }, [visible, selectedLinkedEventId, linkedEventId, availableEvents]);
  
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

  const handleSave = async () => {
    if (!content.trim()) {
      setError('Note content cannot be empty');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const payload = {
        text: content.trim(),
        type: noteType,
        tags: tags.length > 0 ? tags : null,
      };

      // Add links if provided
      if (linkedEvidenceId) {
        payload.linked_evidence_id = linkedEvidenceId;
      }
      if (selectedLinkedEventId) {
        payload.linked_event_id = selectedLinkedEventId;
      }

      if (editingNoteId || initialNote?.id) {
        // Update existing note
        const noteId = editingNoteId || initialNote.id;
        const result = await updateNote(noteId, payload);
        
        // Handle both { data, error } format and direct return
        const updateError = result.error || (result instanceof Error ? result : null);
        const updateData = result.data || (result.error ? null : result);
        
        if (updateError) {
          setError(updateError.message || 'Failed to update note');
        } else {
          if (onSaved) onSaved(updateData);
          onClose();
        }
      } else {
        // Create new note
        const createPayload = {
          family_id: familyId,
          ...payload,
        };
        
        // Only include child_id if it's a valid string (not null, not array)
        if (selectedChildId && typeof selectedChildId === 'string') {
          createPayload.child_id = selectedChildId;
        } else if (selectedChildId === null || selectedChildId === undefined) {
          // Explicitly set to null for family-level notes
          createPayload.child_id = null;
        } else {
          // If it's an array, take the first one or set to null
          createPayload.child_id = Array.isArray(selectedChildId) && selectedChildId.length > 0 
            ? selectedChildId[0] 
            : null;
        }
        
        const result = await createNote(createPayload);
        
        // Handle both { data, error } format and direct return
        const createError = result.error || (result instanceof Error ? result : null);
        const createData = result.data || (result.error ? null : result);
        
        if (createError) {
          setError(createError.message || 'Failed to create note');
        } else {
          if (onSaved) onSaved(createData);
          onClose();
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {(editingNoteId || initialNote) ? 'Edit Note' : 'New Note'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.body}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            
            {children.length > 0 && !selectedChildId && (
              <View style={styles.field}>
                <Text style={styles.label}>Child</Text>
                <View style={styles.childChips}>
                  {children.map(child => (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childChip,
                        selectedChildId === child.id && styles.childChipActive
                      ]}
                      onPress={() => setSelectedChildId(child.id)}
                    >
                      <Text style={[
                        styles.childChipText,
                        selectedChildId === child.id && styles.childChipTextActive
                      ]}>
                        {child.first_name || child.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            
            {/* Note type dropdown */}
            <View style={styles.field}>
              <Text style={styles.label}>Note Type</Text>
              {Platform.OS === 'web' ? (
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${colors.border}`,
                    fontSize: '14px',
                    backgroundColor: colors.panel,
                    color: colors.text,
                  }}
                >
                  <option value="log">Log</option>
                  <option value="observation">Observation</option>
                  <option value="praise">Praise</option>
                  <option value="concern">Concern</option>
                </select>
              ) : (
                <View style={styles.typeChips}>
                  {['log', 'observation', 'praise', 'concern'].map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeChip,
                        noteType === type && styles.typeChipActive
                      ]}
                      onPress={() => setNoteType(type)}
                    >
                      <Text style={[
                        styles.typeChipText,
                        noteType === type && styles.typeChipTextActive
                      ]}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Tags input - chip style */}
            <View style={styles.field}>
              <Text style={styles.label}>Tags</Text>
              <View style={styles.tagsContainer}>
                {tags.map((tag, index) => (
                  <View key={index} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>{tag}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveTag(tag)}
                      style={styles.tagRemoveButton}
                    >
                      <X size={12} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TextInput
                  style={styles.tagInput}
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={handleAddTag}
                  onKeyPress={handleTagInputKeyPress}
                  placeholder={tags.length === 0 ? "Type and press Enter to add tag" : ""}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Linked evidence preview */}
            {linkedEvidence && (
              <View style={styles.linkedPreview}>
                <View style={styles.linkedPreviewHeader}>
                  <Link size={14} color={colors.indigo} />
                  <Text style={styles.linkedPreviewTitle}>Linked Evidence</Text>
                </View>
                <Text style={styles.linkedPreviewText}>
                  {linkedEvidence.title || 'Untitled'}
                </Text>
                {linkedEvidence.uploaded_at && (
                  <Text style={styles.linkedPreviewMeta}>
                    {new Date(linkedEvidence.uploaded_at).toLocaleDateString()}
                  </Text>
                )}
                {linkedEvidence.type && (
                  <Text style={styles.linkedPreviewMeta}>Type: {linkedEvidence.type}</Text>
                )}
                {Platform.OS === 'web' && (
                  <TouchableOpacity
                    onPress={() => {
                      if (typeof window !== 'undefined') {
                        const url = `/records?tab=portfolio&evidenceId=${linkedEvidence.id}`;
                        if (window.__ldSearchNavigate) {
                          window.__ldSearchNavigate('records', null, { tab: 'portfolio', evidenceId: linkedEvidence.id });
                        } else {
                          window.location.href = url;
                        }
                      }
                    }}
                    style={styles.linkedPreviewLink}
                  >
                    <Text style={styles.linkedPreviewLinkText}>View in Portfolio</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Event linking */}
            {availableEvents && availableEvents.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>Link to Event (optional)</Text>
                {Platform.OS === 'web' ? (
                  <select
                    value={selectedLinkedEventId || ''}
                    onChange={(e) => setSelectedLinkedEventId(e.target.value || null)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: `1px solid ${colors.border}`,
                      fontSize: '14px',
                      backgroundColor: colors.panel,
                      color: colors.text,
                    }}
                  >
                    <option value="">None</option>
                    {availableEvents.map(event => (
                      <option key={event.id} value={event.id}>
                        {event.title} - {event.start_ts ? new Date(event.start_ts).toLocaleDateString() : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    style={styles.input}
                    value={selectedLinkedEventId || ''}
                    onChangeText={setSelectedLinkedEventId}
                    placeholder="Event ID (optional)"
                    placeholderTextColor={colors.textSecondary}
                  />
                )}
              </View>
            )}

            {/* Linked event preview */}
            {linkedEvent && (
              <View style={styles.linkedPreview}>
                <View style={styles.linkedPreviewHeader}>
                  <Calendar size={14} color={colors.indigo} />
                  <Text style={styles.linkedPreviewTitle}>Linked Event</Text>
                </View>
                <Text style={styles.linkedPreviewText}>
                  {linkedEvent.title || `Event #${linkedEvent.id}`}
                </Text>
                {linkedEvent.start_ts && (
                  <Text style={styles.linkedPreviewMeta}>
                    {new Date(linkedEvent.start_ts).toLocaleDateString()}
                  </Text>
                )}
                {Platform.OS === 'web' && (
                  <TouchableOpacity
                    onPress={() => {
                      if (typeof window !== 'undefined') {
                        const eventDate = linkedEvent.start_ts 
                          ? new Date(linkedEvent.start_ts).toISOString().split('T')[0]
                          : new Date().toISOString().split('T')[0];
                        const url = `/?date=${eventDate}&child=${linkedEvent.child_id || selectedChildId || ''}`;
                        if (window.__ldSearchNavigate) {
                          window.__ldSearchNavigate('planner', null, { date: eventDate, child: linkedEvent.child_id || selectedChildId });
                        } else {
                          window.location.href = url;
                        }
                      }
                    }}
                    style={styles.linkedPreviewLink}
                  >
                    <Text style={styles.linkedPreviewLinkText}>View in Planner</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            <View style={styles.field}>
              <Text style={styles.label}>Note</Text>
              {Platform.OS === 'web' && (
                <View style={styles.richTextToolbar}>
                  <TouchableOpacity
                    onPress={() => applyTextFormat('bold')}
                    style={styles.toolbarButton}
                    title="Bold"
                  >
                    <Bold size={14} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => applyTextFormat('italic')}
                    style={styles.toolbarButton}
                    title="Italic"
                  >
                    <Italic size={14} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => applyTextFormat('bullet')}
                    style={styles.toolbarButton}
                    title="Bullet List"
                  >
                    <List size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
              )}
              <TextInput
                ref={textAreaRef}
                style={styles.textArea}
                placeholder="Write your note here..."
                placeholderTextColor={colors.textSecondary}
                value={content}
                onChangeText={setContent}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>
          </View>
          
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Save size={14} color={colors.white} />
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save Note'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    padding: 16,
    maxHeight: 400,
  },
  errorContainer: {
    padding: 12,
    backgroundColor: colors.orangeSoft,
    borderRadius: 6,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: colors.orange,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  childChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childChipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  childChipText: {
    fontSize: 13,
    color: colors.text,
  },
  childChipTextActive: {
    color: colors.white,
  },
  infoBox: {
    padding: 12,
    backgroundColor: colors.blueSoft,
    borderRadius: 6,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 12,
    color: colors.blueBold,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.panel,
  },
  textArea: {
    minHeight: 120,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  typeChipText: {
    fontSize: 13,
    color: colors.text,
  },
  typeChipTextActive: {
    color: colors.white,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: colors.panel,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.indigo,
    borderRadius: 12,
  },
  tagChipText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '500',
  },
  tagRemoveButton: {
    padding: 2,
  },
  tagInput: {
    flex: 1,
    minWidth: 120,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  linkedPreview: {
    padding: 12,
    backgroundColor: colors.blueSoft,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkedPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  linkedPreviewTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.blueBold,
  },
  linkedPreviewText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  linkedPreviewMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  linkedPreviewLink: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  linkedPreviewLinkText: {
    fontSize: 12,
    color: colors.indigo,
    fontWeight: '500',
  },
  richTextToolbar: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    backgroundColor: colors.panel,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  toolbarButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

