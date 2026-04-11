import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { X, FileText, RefreshCw, CheckCircle2 } from 'lucide-react';
import { colors } from '../../theme/colors';
import { importGoogleDriveFile, listGoogleDriveFiles } from '../../lib/apiClient';
import { useToast } from '../Toast';

function ProviderChip({ active, label, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function GoogleDriveImportModal({
  visible,
  onClose,
  children = [],
  subjects = [],
  onImported,
  onImportedForCurriculum,
}) {
  const toast = useToast();
  const toastRef = useRef(toast);
  const lastLoadErrorRef = useRef('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [importingId, setImportingId] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(children[0]?.id || null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id || null);
  const [mode, setMode] = useState('library');

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    if (!visible) return;
    setSelectedChildId(children[0]?.id || null);
    setSelectedSubjectId(subjects[0]?.id || null);
  }, [visible, children, subjects]);

  const loadFiles = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const { data, error } = await listGoogleDriveFiles({ pageSize: 30 });
      if (error) throw error;
      setFiles(Array.isArray(data) ? data : []);
      setLoadError('');
      lastLoadErrorRef.current = '';
    } catch (err) {
      const message = err?.message || 'Could not load Google Drive files';
      setLoadError(message);
      if (lastLoadErrorRef.current !== message) {
        toastRef.current?.push(message, 'error');
        lastLoadErrorRef.current = message;
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) loadFiles();
  }, [visible]);

  const subjectKey = useMemo(() => {
    const match = (subjects || []).find((s) => String(s.id) === String(selectedSubjectId));
    return match?.subject_key || match?.key || null;
  }, [selectedSubjectId, subjects]);

  const handleImport = useCallback(
    async (file) => {
      if (mode === 'curriculum' && !selectedSubjectId) {
        toast.push('Choose a subject before turning a file into curriculum', 'error');
        return;
      }
      setImportingId(file.id);
      try {
        const { data, error } = await importGoogleDriveFile({
          file_id: file.id,
          child_id: selectedChildId || null,
          subject_id: selectedSubjectId || null,
          subject_key: subjectKey,
          import_mode: mode,
        });
        if (error || !data) throw error || new Error('Import failed');

        if (mode === 'curriculum') {
          toast.push('Imported. Opening curriculum parser…', 'success');
          onImportedForCurriculum?.({
            materialId: data.material_id,
            title: data.title || file.name,
            subjectId: selectedSubjectId || null,
          });
        } else {
          toast.push('Saved to Library', 'success');
          onImported?.(data);
        }
        onClose?.();
      } catch (err) {
        toast.push(err?.message || 'Failed to import Google Drive file', 'error');
      } finally {
        setImportingId(null);
      }
    },
    [mode, onClose, onImported, onImportedForCurriculum, selectedChildId, selectedSubjectId, subjectKey, toast]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.modal}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Import from Google Drive</Text>
              <Text style={styles.subtitle}>Bring in Docs, PDFs, and text files as library materials or curriculum sources.</Text>
            </View>
            <TouchableOpacity onPress={onClose} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <X size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.controls}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Import mode</Text>
              <View style={styles.chipRow}>
                <ProviderChip active={mode === 'library'} label="Save to Library" onPress={() => setMode('library')} />
                <ProviderChip active={mode === 'curriculum'} label="Turn into curriculum" onPress={() => setMode('curriculum')} />
              </View>
            </View>

            {subjects.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Subject</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {subjects.map((subject) => (
                      <ProviderChip
                        key={subject.id}
                        active={String(selectedSubjectId) === String(subject.id)}
                        label={subject.name || subject.title || 'Subject'}
                        onPress={() => setSelectedSubjectId(subject.id)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {children.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Child</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {children.map((child) => (
                      <ProviderChip
                        key={child.id}
                        active={String(selectedChildId) === String(child.id)}
                        label={child.name || child.first_name || 'Child'}
                        onPress={() => setSelectedChildId(child.id)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}
          </View>

          <View style={styles.filesHeader}>
            <Text style={styles.sectionLabel}>Google files</Text>
            <TouchableOpacity style={styles.refreshButton} onPress={loadFiles} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <RefreshCw size={14} color="#4b5563" />
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.filesList} contentContainerStyle={styles.filesListContent}>
            {!loading && !!loadError ? (
              <View style={styles.errorState}>
                <Text style={styles.errorTitle}>Unable to load Google files</Text>
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={colors.accent || '#4F46E5'} />
                <Text style={styles.loadingText}>Loading files…</Text>
              </View>
            ) : null}

            {!loading && files.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No supported files found</Text>
                <Text style={styles.emptyText}>We currently show Google Docs, PDFs, and text documents.</Text>
              </View>
            ) : null}

            {!loading
              ? files.map((file) => {
                  const importing = importingId === file.id;
                  return (
                    <View key={file.id} style={styles.fileRow}>
                      <View style={styles.fileMeta}>
                        <FileText size={18} color="#6366f1" />
                        <View style={styles.fileTextWrap}>
                          <Text style={styles.fileName}>{file.name}</Text>
                          <Text style={styles.fileDetails}>
                            {file.mime_type === 'application/vnd.google-apps.document' ? 'Google Doc' : file.mime_type}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.importButton, importing && styles.importButtonDisabled]}
                        onPress={() => handleImport(file)}
                        disabled={importing}
                        {...(Platform.OS === 'web' && { cursor: importing ? 'not-allowed' : 'pointer' })}
                      >
                        {importing ? (
                          <ActivityIndicator size="small" color="#374151" />
                        ) : (
                          <>
                            <CheckCircle2 size={14} color="#374151" />
                            <Text style={styles.importButtonText}>{mode === 'curriculum' ? 'Import & parse' : 'Import'}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 860,
    maxHeight: '86%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  controls: {
    gap: 14,
    marginBottom: 18,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: {
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  chipText: {
    fontSize: 13,
    color: '#4b5563',
  },
  chipTextActive: {
    color: '#3730a3',
    fontWeight: '700',
  },
  filesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  refreshText: {
    fontSize: 12,
    color: '#4b5563',
  },
  filesList: {
    flexGrow: 0,
  },
  filesListContent: {
    gap: 10,
    paddingBottom: 6,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 14,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  fileTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fileDetails: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  importButtonDisabled: {
    opacity: 0.7,
  },
  importButtonText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  emptyState: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 18,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  errorState: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    padding: 14,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#7f1d1d',
  },
});
