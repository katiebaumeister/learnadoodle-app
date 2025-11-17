import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Alert, Image, Platform, Modal } from 'react-native';
import { Upload, Search, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';

const TYPE_FILTERS = [
  { key: 'image', label: 'Images' },
  { key: 'pdf', label: 'PDFs' },
  { key: 'doc', label: 'Docs' },
  { key: 'video', label: 'Videos' },
  { key: 'audio', label: 'Audio' },
];

export default function UploadsEnhanced({ familyId, initialChildren = [], searchQuery = '', childFilter = null }) {
  const [items, setItems] = useState([]);
  const [children, setChildren] = useState(initialChildren);
  const [subjects, setSubjects] = useState([]);
  const [q, setQ] = useState(searchQuery);
  const [childIds, setChildIds] = useState(childFilter);
  const [subjectIds, setSubjectIds] = useState(null);
  const [types, setTypes] = useState(null);
  const [includeUnassignedChild, setIncludeUnassignedChild] = useState(false);
  const [includeUnassignedSubject, setIncludeUnassignedSubject] = useState(false);
  const [sortUnassignedFirst, setSortUnassignedFirst] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignIds, setAssignIds] = useState([]);
  const [lastAssign, setLastAssign] = useState(null);
  
  const fileInputRef = useRef(null);

  const selectedCount = selected.size;

  // Keyboard shortcuts (Cmd/Ctrl+A, Esc)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e) => {
      const inInput = e.target?.closest?.('input, textarea, select, [contenteditable]');
      if (inInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllInView();
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items]);

  useEffect(() => {
    if (familyId) {
      loadMetadata();
    }
  }, [familyId]);

  useEffect(() => {
    if (familyId) {
      loadData();
    }
  }, [familyId, q, childIds, subjectIds, types, includeUnassignedChild, includeUnassignedSubject, sortUnassignedFirst]);

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

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc('get_uploads', {
        _family: familyId,
        _q: q || null,
        _child_ids: childIds,
        _subject_ids: subjectIds,
        _types: types,
        _include_unassigned_child: includeUnassignedChild,
        _include_unassigned_subject: includeUnassignedSubject,
        _sort_unassigned_first: sortUnassignedFirst
      });
      setItems(data || []);
    } catch (error) {
      console.error('Error loading uploads:', error);
      Alert.alert('Error', 'Failed to load uploads');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

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

      // Use current filters as default assignment
      const defaultChild = childIds?.[0] || null;
      const defaultSubject = subjectIds?.[0] || null;

      await supabase.rpc('create_upload_record', {
        _family: familyId,
        _child: defaultChild,
        _subject: defaultSubject,
        _event: null,
        _path: path,
        _mime: file.type || 'application/octet-stream',
        _bytes: file.size,
        _title: file.name,
        _tags: [],
        _notes: null
      });

      await loadData();
      Alert.alert('Success', 'File uploaded successfully');
    } catch (error) {
      console.error('Error uploading file:', error);
      Alert.alert('Error', 'Failed to upload file');
    }
  };

  const toggleChildFilter = (childId) => {
    setChildIds(prev => {
      if (!prev) return [childId];
      return prev.includes(childId) ? prev.filter(id => id !== childId) : [...prev, childId];
    });
  };

  const toggleSubjectFilter = (subjectId) => {
    setSubjectIds(prev => {
      if (!prev) return [subjectId];
      return prev.includes(subjectId) ? prev.filter(id => id !== subjectId) : [...prev, subjectId];
    });
  };

  const toggleTypeFilter = (type) => {
    setTypes(prev => {
      if (!prev) return [type];
      return prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
    });
  };

  const toggleSelection = (id, index, next, shiftKey) => {
    if (shiftKey && lastClickedIndex !== null) {
      // Range selection
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      
      setSelected(prev => {
        const newSet = new Set(prev);
        for (let i = start; i <= end; i++) {
          const item = items[i];
          if (!item) continue;
          if (next) {
            newSet.add(item.id);
          } else {
            newSet.delete(item.id);
          }
        }
        return newSet;
      });
    } else {
      // Single selection
      setSelected(prev => {
        const newSet = new Set(prev);
        if (next) {
          newSet.add(id);
        } else {
          newSet.delete(id);
        }
        return newSet;
      });
    }
    setLastClickedIndex(index);
  };

  const selectAllInView = () => {
    setSelected(new Set(items.map(item => item.id)));
    setLastClickedIndex(items.length > 0 ? items.length - 1 : null);
  };

  const clearSelection = () => {
    setSelected(new Set());
    setLastClickedIndex(null);
  };

  const openAssignSheet = (id) => {
    setAssignIds([id]);
    setAssignOpen(true);
  };

  const openBulkAssign = () => {
    const ids = Array.from(selected);
    if (ids.length > 0) {
      setAssignIds(ids);
      setAssignOpen(true);
    }
  };

  const assignToLastUsed = async () => {
    if (!lastAssign) return;
    
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    try {
      await Promise.all(ids.map(id =>
        supabase.rpc('update_upload_meta', {
          _id: id,
          _family: familyId,
          _child: lastAssign.childId || null,
          _subject: lastAssign.subjectId || null
        })
      ));
      clearSelection();
      await loadData();
      Alert.alert('Success', 'Files assigned successfully');
    } catch (error) {
      console.error('Error assigning files:', error);
      Alert.alert('Error', 'Failed to assign files');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Uploads</Text>
          <Text style={styles.subtitle}>
            {items.length} file{items.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {selectedCount > 0 && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={openBulkAssign}
                activeOpacity={0.7}
              >
                <Text style={styles.actionButtonText}>Assign {selectedCount}</Text>
              </TouchableOpacity>
              {lastAssign && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={assignToLastUsed}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionButtonText}>→ Last used</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          <TouchableOpacity style={styles.uploadButton} onPress={handleUploadClick} activeOpacity={0.7}>
            {Platform.OS === 'web' && (
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => handleFileUpload(e.target.files)}
                accept="*/*"
              />
            )}
            <Upload size={16} color={colors.accentContrast} />
            <Text style={styles.uploadText}>Upload</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <ScrollView style={styles.filtersSection} showsVerticalScrollIndicator={false}>
        {/* Search */}
        <View style={styles.searchContainer}>
          <Search size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search files..."
            value={q}
            onChangeText={setQ}
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Type chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <Text style={styles.filterLabel}>Type:</Text>
          {TYPE_FILTERS.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => toggleTypeFilter(key)}
              style={[
                styles.filterChip,
                types?.includes(key) && styles.filterChipActive
              ]}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterChipText,
                types?.includes(key) && styles.filterChipTextActive
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setTypes(null)}
            style={styles.filterChip}
            activeOpacity={0.7}
          >
            <Text style={styles.filterChipText}>All types</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Child chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <Text style={styles.filterLabel}>Child:</Text>
          {children.map(child => (
            <TouchableOpacity
              key={child.id}
              onPress={() => toggleChildFilter(child.id)}
              style={[
                styles.filterChip,
                childIds?.includes(child.id) && styles.filterChipActiveChild
              ]}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterChipText,
                childIds?.includes(child.id) && styles.filterChipTextActive
              ]}>
                {child.first_name || child.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setIncludeUnassignedChild(!includeUnassignedChild)}
            style={[
              styles.filterChip,
              includeUnassignedChild && styles.filterChipActiveUnassigned
            ]}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.filterChipText,
              includeUnassignedChild && styles.filterChipTextActive
            ]}>
              Unassigned
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setChildIds(null);
              setIncludeUnassignedChild(false);
            }}
            style={styles.filterChip}
            activeOpacity={0.7}
          >
            <Text style={styles.filterChipText}>All children</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Subject chips */}
        {subjects.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <Text style={styles.filterLabel}>Subject:</Text>
            {subjects.map(subject => (
              <TouchableOpacity
                key={subject.id}
                onPress={() => toggleSubjectFilter(subject.id)}
                style={[
                  styles.filterChip,
                  subjectIds?.includes(subject.id) && styles.filterChipActiveSubject
                ]}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterChipText,
                  subjectIds?.includes(subject.id) && styles.filterChipTextActive
                ]}>
                  {subject.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setIncludeUnassignedSubject(!includeUnassignedSubject)}
              style={[
                styles.filterChip,
                includeUnassignedSubject && styles.filterChipActiveUnassigned
              ]}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterChipText,
                includeUnassignedSubject && styles.filterChipTextActive
              ]}>
                Unassigned
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSubjectIds(null);
                setIncludeUnassignedSubject(false);
              }}
              style={styles.filterChip}
              activeOpacity={0.7}
            >
              <Text style={styles.filterChipText}>All subjects</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Sort toggle */}
        <TouchableOpacity
          onPress={() => setSortUnassignedFirst(!sortUnassignedFirst)}
          style={styles.sortToggle}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, sortUnassignedFirst && styles.checkboxChecked]}>
            {sortUnassignedFirst && <Check size={12} color={colors.accent} />}
          </View>
          <Text style={styles.sortToggleText}>Show unassigned first</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Selection Toolbar */}
      {selectedCount > 0 && (
        <View style={styles.selectionToolbar}>
          <Text style={styles.selectionCount}>{selectedCount} selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              onPress={selectAllInView}
              style={styles.toolbarButton}
              activeOpacity={0.7}
            >
              <Text style={styles.toolbarButtonText}>Select all in view</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openBulkAssign}
              style={styles.toolbarButton}
              activeOpacity={0.7}
            >
              <Text style={styles.toolbarButtonText}>Assign selected</Text>
            </TouchableOpacity>
            {lastAssign && (
              <TouchableOpacity
                onPress={assignToLastUsed}
                style={styles.toolbarButton}
                activeOpacity={0.7}
              >
                <Text style={styles.toolbarButtonText}>→ Last used</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={clearSelection}
              style={styles.toolbarButton}
              activeOpacity={0.7}
            >
              <Text style={styles.toolbarButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Grid */}
      <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent}>
        {loading ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : items.length > 0 ? (
          <View style={styles.gridInner}>
            {items.map((item, index) => (
              <UploadCard
                key={item.id}
                item={item}
                index={index}
                selected={selected.has(item.id)}
                onToggleSelect={toggleSelection}
                onAssign={openAssignSheet}
                familyId={familyId}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No files found</Text>
            <Text style={styles.emptyHint}>Upload a file to get started</Text>
          </View>
        )}
      </ScrollView>

      {/* Assign Sheet */}
      {assignOpen && (
        <AssignSheet
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          uploadIds={assignIds}
          familyId={familyId}
          children={children}
          subjects={subjects}
          onSaved={(childId, subjectId) => {
            setLastAssign({ childId, subjectId });
            clearSelection();
            loadData();
          }}
        />
      )}
    </View>
  );
}

// Upload Card Component
function UploadCard({ item, index, selected, onToggleSelect, onAssign, familyId }) {
  const [signedUrl, setSignedUrl] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (item.storage_path && item.kind === 'image') {
      supabase.storage
        .from('evidence')
        .createSignedUrl(item.storage_path, 3600)
        .then(({ data }) => {
          if (mounted && data?.signedUrl) {
            setSignedUrl(data.signedUrl);
          }
        });
    }
    return () => { mounted = false; };
  }, [item.storage_path, item.kind]);

  const handleCheckboxChange = (e) => {
    if (Platform.OS === 'web' && e.nativeEvent) {
      const shiftKey = e.nativeEvent.shiftKey;
      const checked = e.target.checked;
      onToggleSelect?.(item.id, index, checked, shiftKey);
    } else {
      onToggleSelect?.(item.id, index, !selected, false);
    }
  };

  const getKindStyle = (kind) => {
    switch (kind) {
      case 'image': return { bg: colors.violetSoft, text: colors.violetBold };
      case 'pdf': return { bg: colors.redSoft, text: colors.redBold };
      case 'doc': return { bg: colors.blueSoft, text: colors.blueBold };
      case 'video': return { bg: colors.orangeSoft, text: colors.orangeBold };
      case 'audio': return { bg: colors.greenSoft, text: colors.greenBold };
      default: return { bg: colors.panel, text: colors.muted };
    }
  };

  const kindStyle = getKindStyle(item.kind);

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      {/* Preview */}
      <View style={styles.cardPreview}>
        {item.kind === 'image' && signedUrl ? (
          <Image source={{ uri: signedUrl }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardIcon, { backgroundColor: kindStyle.bg }]}>
            <Text style={[styles.cardIconText, { color: kindStyle.text }]}>
              {item.kind?.toUpperCase() || 'FILE'}
            </Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {Platform.OS === 'web' ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={handleCheckboxChange}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          ) : (
            <TouchableOpacity onPress={() => onToggleSelect?.(item.id, index, !selected, false)} style={styles.cardCheckbox}>
              <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                {selected && <Check size={12} color={colors.accent} />}
              </View>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.cardDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>

        {/* Tags */}
        <View style={styles.cardTags}>
          {item.child_id && <View style={styles.tagChild}><Text style={styles.tagText}>Child assigned</Text></View>}
          {item.subject_id && <View style={styles.tagSubject}><Text style={styles.tagText}>Subject assigned</Text></View>}
        </View>

        {/* Actions */}
        <TouchableOpacity
          onPress={() => onAssign(item.id)}
          style={styles.cardButton}
          activeOpacity={0.7}
        >
          <Text style={styles.cardButtonText}>Assign…</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Assign Sheet Component
function AssignSheet({ open, onClose, uploadIds, familyId, children, subjects, onSaved }) {
  const [childId, setChildId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const multi = uploadIds.length > 1;

  const handleSave = async () => {
    setSaving(true);
    try {
      const tagsArr = tags.split(',').map(s => s.trim()).filter(Boolean);
      await Promise.all(uploadIds.map(id =>
        supabase.rpc('update_upload_meta', {
          _id: id,
          _family: familyId,
          _child: childId || null,
          _subject: subjectId || null,
          _title: title || null,
          _tags: tagsArr.length ? tagsArr : null,
          _notes: notes || null
        })
      ));
      onSaved?.(childId || null, subjectId || null);
      onClose();
    } catch (error) {
      console.error('Error saving metadata:', error);
      Alert.alert('Error', 'Failed to save metadata');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {multi ? `Assign ${uploadIds.length} files` : 'Assign file'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.sheetClose}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sheetContent}>
            {!multi && (
              <View style={styles.sheetField}>
                <Text style={styles.sheetLabel}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  style={styles.sheetInput}
                  placeholderTextColor={colors.muted}
                />
              </View>
            )}

            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Child</Text>
              <View style={styles.sheetPicker}>
                <Text style={styles.sheetPickerText}>
                  {children.find(c => c.id === childId)?.first_name || 'Unassigned'}
                </Text>
              </View>
            </View>

            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Subject</Text>
              <View style={styles.sheetPicker}>
                <Text style={styles.sheetPickerText}>
                  {subjects.find(s => s.id === subjectId)?.name || 'Unassigned'}
                </Text>
              </View>
            </View>

            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Tags (comma-separated)</Text>
              <TextInput
                value={tags}
                onChangeText={setTags}
                placeholder="syllabus, worksheet"
                style={styles.sheetInput}
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                style={[styles.sheetInput, styles.sheetTextarea]}
                placeholderTextColor={colors.muted}
              />
            </View>
          </ScrollView>

          <View style={styles.sheetFooter}>
            <TouchableOpacity onPress={onClose} style={styles.sheetButton}>
              <Text style={styles.sheetButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.sheetButton, styles.sheetButtonPrimary]}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={[styles.sheetButtonText, styles.sheetButtonTextPrimary]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  actionButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.accent,
  },
  uploadText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accentContrast,
  },
  filtersSection: {
    maxHeight: 200,
    paddingHorizontal: 24,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    outlineStyle: 'none',
  },
  chipRow: {
    marginBottom: 12,
    flexGrow: 0,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    paddingRight: 12,
    alignSelf: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.indigoSoft,
    borderColor: colors.indigoBold,
  },
  filterChipActiveChild: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenBold,
  },
  filterChipActiveSubject: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blueBold,
  },
  filterChipActiveUnassigned: {
    backgroundColor: colors.orangeSoft,
    borderColor: colors.orangeBold,
  },
  filterChipText: {
    fontSize: 14,
    color: colors.text,
  },
  filterChipTextActive: {
    fontWeight: '500',
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.blueSoft,
  },
  sortToggleText: {
    fontSize: 14,
    color: colors.text,
  },
  selectionToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 24,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  selectionCount: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  toolbarButtonText: {
    fontSize: 13,
    color: colors.text,
  },
  grid: {
    flex: 1,
  },
  gridContent: {
    padding: 24,
  },
  gridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    width: 280,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...shadows.sm,
  },
  cardSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  cardPreview: {
    height: 160,
    backgroundColor: colors.panel,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardContent: {
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  cardCheckbox: {
    padding: 4,
  },
  cardDate: {
    fontSize: 12,
    color: colors.muted,
  },
  cardTags: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  tagChild: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.greenSoft,
  },
  tagSubject: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.blueSoft,
  },
  tagText: {
    fontSize: 11,
    color: colors.text,
  },
  cardButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
  },
  cardButtonText: {
    fontSize: 13,
    color: colors.text,
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.muted,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: colors.radiusLg,
    borderTopRightRadius: colors.radiusLg,
    maxHeight: '80%',
    ...shadows.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  sheetClose: {
    padding: 8,
  },
  sheetContent: {
    padding: 20,
  },
  sheetField: {
    marginBottom: 20,
  },
  sheetLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  sheetInput: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    fontSize: 14,
    color: colors.text,
  },
  sheetTextarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sheetPicker: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  sheetPickerText: {
    fontSize: 14,
    color: colors.text,
  },
  sheetFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  sheetButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sheetButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  sheetButtonTextPrimary: {
    color: colors.accentContrast,
    fontWeight: '500',
  },
});

