import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import MaterialDocViewerModal, {
  getMaterialFileTypeLabel,
  inferMaterialViewerKind,
  resolveMaterialDocViewerUrl,
} from '../materials/MaterialDocViewerModal';

function formatUploadedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return null;
  const size = Number(bytes);
  if (size <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const value = size / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function materialMatchesChildIds(material, childIds) {
  if (!Array.isArray(childIds) || childIds.length === 0) return true;
  const idSet = new Set(childIds.map(String));
  const links = material?.material_children || [];
  if (links.length === 0) return true;
  return links.some((row) => idSet.has(String(row?.child_id)));
}

function getMaterialTitle(material) {
  const title = (material?.title || '').trim();
  if (title) return title;
  const fromPath = material?.storage_path?.split('/').pop()?.split('?')[0];
  if (fromPath) {
    try {
      return decodeURIComponent(fromPath);
    } catch {
      return fromPath;
    }
  }
  return 'Untitled file';
}

export default function RecordsDocumentsView({
  familyId,
  children = [],
  userRole = 'parent',
  accessibleChildren = [],
  viewingAsChildId = null,
}) {
  const { push: toastPush } = useToast();
  const isChildView = userRole === 'child' || userRole === 'student';
  const scopedChildIds = useMemo(() => {
    if (viewingAsChildId) return [String(viewingAsChildId)];
    if (isChildView && accessibleChildren?.length) {
      return accessibleChildren
        .map((child) => (typeof child === 'string' ? child : child?.id))
        .filter(Boolean)
        .map(String);
    }
    return [];
  }, [viewingAsChildId, isChildView, accessibleChildren]);

  const childNameById = useMemo(() => {
    const map = new Map();
    (Array.isArray(children) ? children : []).forEach((child) => {
      if (!child?.id) return;
      const label = child.nickname || child.first_name || child.name || 'Learner';
      map.set(String(child.id), label);
    });
    return map;
  }, [children]);

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState({
    visible: false,
    url: null,
    title: '',
    viewerKind: 'pdf',
  });

  const loadMaterials = useCallback(async () => {
    if (!familyId) {
      setMaterials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('materials')
        .select(`
          id,
          title,
          storage_path,
          created_at,
          mime,
          bytes,
          material_children (
            child_id
          )
        `)
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .not('storage_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const rows = (data || [])
        .filter((row) => materialMatchesChildIds(row, scopedChildIds))
        .map((row) => ({
          ...row,
          displayTitle: getMaterialTitle(row),
          fileTypeLabel: getMaterialFileTypeLabel(row),
          uploadedLabel: formatUploadedDate(row.created_at),
          sizeLabel: formatFileSize(row.bytes),
        }));

      setMaterials(rows);
    } catch (err) {
      console.error('[RecordsDocumentsView] load error:', err);
      toastPush('Could not load uploaded materials.', 'error');
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [familyId, scopedChildIds, toastPush]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const refresh = () => loadMaterials();
    window.addEventListener('refreshMaterials', refresh);
    window.addEventListener('materialUpdated', refresh);
    window.addEventListener('materialDeleted', refresh);
    return () => {
      window.removeEventListener('refreshMaterials', refresh);
      window.removeEventListener('materialUpdated', refresh);
      window.removeEventListener('materialDeleted', refresh);
    };
  }, [loadMaterials]);

  const openMaterial = useCallback(async (material) => {
    const resolved = await resolveMaterialDocViewerUrl(material.id);
    if (resolved.error || !resolved.url) {
      toastPush(resolved.error || 'Unable to open this file.', 'error');
      return;
    }
    setViewer({
      visible: true,
      url: resolved.url,
      title: resolved.title || material.displayTitle,
      viewerKind: resolved.viewerKind || inferMaterialViewerKind(material),
    });
  }, [toastPush]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#2563EB" />
      </View>
    );
  }

  if (materials.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <FileText size={28} color="#94A3B8" />
        <Text style={styles.emptyTitle}>No uploaded materials yet</Text>
        <Text style={styles.emptyText}>
          Files you upload to Materials will appear here for your family.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {materials.map((material) => {
          const linkedChildIds = (material.material_children || [])
            .map((row) => row?.child_id)
            .filter(Boolean);
          const learnerLabels = linkedChildIds
            .map((childId) => childNameById.get(String(childId)))
            .filter(Boolean);
          const metaParts = [
            material.uploadedLabel,
            material.fileTypeLabel,
            material.sizeLabel,
            learnerLabels.length ? learnerLabels.join(', ') : null,
          ].filter(Boolean);

          return (
            <TouchableOpacity
              key={material.id}
              style={styles.row}
              onPress={() => openMaterial(material)}
              accessibilityRole="button"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={styles.rowIcon}>
                <FileText size={18} color="#2563EB" />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {material.displayTitle}
                </Text>
                {metaParts.length ? (
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {metaParts.join(' · ')}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <MaterialDocViewerModal
        visible={viewer.visible}
        onClose={() => setViewer((prev) => ({ ...prev, visible: false, url: null }))}
        url={viewer.url}
        title={viewer.title}
        viewerKind={viewer.viewerKind}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    paddingVertical: 56,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 360,
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  rowMeta: {
    fontSize: 13,
    color: '#64748B',
  },
});
