import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ChevronDown, Plus } from 'lucide-react';
import { getMaterials } from '../../../lib/services/materialsClient';
import Dropdown from '../../ui/Dropdown';
import MaterialDocViewerModal, {
  inferMaterialViewerKind,
  resolveMaterialDocViewerUrl,
} from '../../materials/MaterialDocViewerModal';
import { createModalStyles as styles, MUTED, PLACEHOLDER, ACCENT_TEXT, FG } from './createModalStyles';

function materialBaseTitle(material) {
  return String(material?.title || material?.name || 'Untitled').trim() || 'Untitled';
}

function materialSubjectBit(material) {
  return String(material?.subject_key || '').trim() || null;
}

function materialChildrenBit(material) {
  const names = (material?.material_children || [])
    .map((mc) => String(mc?.child?.first_name || '').trim())
    .filter(Boolean);
  if (!names.length) return null;
  return [...new Set(names)].join(', ');
}

/** Only add subject/child context when the same title appears more than once. */
function buildMaterialDisplayLabels(materials = []) {
  const list = Array.isArray(materials) ? materials : [];
  const byTitle = new Map();
  list.forEach((material) => {
    if (!material?.id) return;
    const key = materialBaseTitle(material).toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(material);
  });

  const labels = new Map();
  byTitle.forEach((group) => {
    if (group.length === 1) {
      const m = group[0];
      labels.set(String(m.id), materialBaseTitle(m));
      return;
    }

    const withSubject = group.map((m) => {
      const base = materialBaseTitle(m);
      const subject = materialSubjectBit(m);
      return {
        id: String(m.id),
        material: m,
        label: subject ? `${base} · ${subject}` : base,
      };
    });

    const byLabel = new Map();
    withSubject.forEach((row) => {
      if (!byLabel.has(row.label)) byLabel.set(row.label, []);
      byLabel.get(row.label).push(row);
    });

    byLabel.forEach((rows, label) => {
      if (rows.length === 1) {
        labels.set(rows[0].id, label);
        return;
      }
      rows.forEach((row) => {
        const kids = materialChildrenBit(row.material);
        labels.set(row.id, kids ? `${label} · ${kids}` : label);
      });
    });
  });

  return labels;
}

export default function EventAttachmentsField({
  familyId,
  selectedMaterialId,
  onMaterialChange,
  onAddNew,
  label = 'Attachments',
  labelStyle = null,
  placeholder = 'Select attachment…',
  allowMultiple = false,
  selectedMaterialIds = [],
  onAddExistingMaterial = null,
  materialFilter = null,
  /** Just-created material to merge into the picker immediately (before refetch). */
  recentMaterial = null,
  /** When a single material is selected, click its name to open the in-app viewer. */
  allowOpenSelected = true,
}) {
  const [materials, setMaterials] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openingSelected, setOpeningSelected] = useState(false);
  const [viewer, setViewer] = useState({
    visible: false,
    url: '',
    title: '',
    viewerKind: 'pdf',
  });
  const triggerRef = useRef(null);
  const materialFilterRef = useRef(materialFilter);
  materialFilterRef.current = materialFilter;
  const loadSeqRef = useRef(0);

  const applyList = useCallback((rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const filter = materialFilterRef.current;
    setMaterials(typeof filter === 'function' ? list.filter(filter) : list);
  }, []);

  const loadMaterials = useCallback(() => {
    if (!familyId) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    getMaterials(familyId)
      .then((rows) => {
        if (seq !== loadSeqRef.current) return;
        applyList(rows);
      })
      .catch(() => {
        if (seq !== loadSeqRef.current) return;
        setMaterials([]);
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setLoading(false);
      });
  }, [familyId, applyList]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  // Library / Add Material modal saves dispatch this — keep picker in sync while parent modal stays open.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return undefined;
    const onRefresh = (e) => {
      const fid = e?.detail?.familyId;
      if (fid && String(fid) !== String(familyId)) return;
      loadMaterials();
    };
    window.addEventListener('refreshMaterials', onRefresh);
    return () => window.removeEventListener('refreshMaterials', onRefresh);
  }, [familyId, loadMaterials]);

  // Optimistic insert so "+ Add New" → save shows the row before refetch returns.
  useEffect(() => {
    if (!recentMaterial?.id) return;
    setMaterials((prev) => {
      if (prev.some((m) => String(m.id) === String(recentMaterial.id))) return prev;
      const next = [recentMaterial, ...prev];
      const filter = materialFilterRef.current;
      return typeof filter === 'function' ? next.filter(filter) : next;
    });
  }, [recentMaterial]);

  useEffect(() => {
    setOpen(false);
  }, [selectedMaterialId, selectedMaterialIds?.length]);

  const materialDisplayLabels = useMemo(
    () => buildMaterialDisplayLabels(materials),
    [materials],
  );

  const selected = materials.find((m) => String(m.id) === String(selectedMaterialId));
  const attachedIdSet = new Set((selectedMaterialIds || []).map(String));
  const availableMaterials = allowMultiple
    ? materials.filter((material) => !attachedIdSet.has(String(material.id)))
    : materials;
  const selectedLabel = selected
    ? (materialDisplayLabels.get(String(selected.id)) || materialBaseTitle(selected))
    : null;
  const selectLabel = loading
    ? 'Loading…'
    : allowMultiple
      ? placeholder
      : (selectedLabel || placeholder);

  const canOpenSelected = Boolean(
    allowOpenSelected
    && !allowMultiple
    && selected?.id
    && !loading
  );

  const closeViewer = useCallback(() => {
    setViewer({ visible: false, url: '', title: '', viewerKind: 'pdf' });
  }, []);

  const openSelectedMaterial = useCallback(async (event) => {
    if (Platform.OS === 'web' && event?.stopPropagation) {
      event.stopPropagation();
    }
    if (!selected?.id || openingSelected) return;
    setOpeningSelected(true);
    try {
      const resolved = await resolveMaterialDocViewerUrl(selected.id);
      if (resolved.error || !resolved.url) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          console.warn('[EventAttachmentsField]', resolved.error || 'Unable to open attachment.');
        }
        return;
      }
      setViewer({
        visible: true,
        url: resolved.url,
        title: resolved.title || selected.title || selected.name || 'Attachment',
        viewerKind: resolved.viewerKind || inferMaterialViewerKind(selected),
      });
    } finally {
      setOpeningSelected(false);
    }
  }, [openingSelected, selected]);

  return (
    <View style={styles.formGroup}>
      {label != null && label !== '' ? (
        <Text style={[styles.fieldLabel, labelStyle]}>{label}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {canOpenSelected ? (
          <View ref={triggerRef} style={[styles.select, localStyles.selectMatchAddNew, localStyles.selectedSelectRow, { flex: 1 }]}>
            <TouchableOpacity
              style={localStyles.openSelectedHit}
              onPress={openSelectedMaterial}
              disabled={openingSelected}
              accessibilityRole="button"
              accessibilityLabel={`Open ${selectLabel}`}
              {...(Platform.OS === 'web' && { cursor: openingSelected ? 'default' : 'pointer' })}
            >
              {openingSelected ? (
                <ActivityIndicator size="small" color={ACCENT_TEXT} />
              ) : null}
              <Text
                style={[styles.selectText, localStyles.openSelectedText]}
                numberOfLines={1}
              >
                {selectLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={localStyles.chevronHit}
              onPress={() => setOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Change attachment"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <ChevronDown size={16} color={MUTED} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            ref={triggerRef}
            style={[styles.select, localStyles.selectMatchAddNew, { flex: 1 }]}
            onPress={() => setOpen((v) => !v)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.selectText, (!selected || allowMultiple) && !loading && styles.selectPlaceholder, loading && { color: PLACEHOLDER }]}>
              {selectLabel}
            </Text>
            <ChevronDown size={16} color={MUTED} />
          </TouchableOpacity>
        )}
        {onAddNew ? (
          <TouchableOpacity
            onPress={onAddNew}
            style={[styles.dropdownOption, styles.addNewButton]}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={14} color={ACCENT_TEXT} />
            <Text style={styles.addNewButtonText}>Add New</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Dropdown
        visible={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        matchTriggerWidth
        maxHeight={220}
        offset={4}
      >
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 216 }}
          {...(Platform.OS === 'web' && {
            style: { maxHeight: 216, overflowY: 'auto' },
          })}
        >
          {!allowMultiple ? (
            <TouchableOpacity
              key="attachment-none"
              onPress={() => {
                onMaterialChange?.(null);
                setOpen(false);
              }}
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 14, color: MUTED }}>None</Text>
            </TouchableOpacity>
          ) : null}
          {availableMaterials.length === 0 ? (
            <View key="attachment-empty" style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 14, color: MUTED }}>
                {materials.length === 0 ? 'No materials yet' : 'All materials attached'}
              </Text>
            </View>
          ) : null}
          {availableMaterials.map((material) => {
            const active = !allowMultiple && String(material.id) === String(selectedMaterialId);
            const optionLabel =
              materialDisplayLabels.get(String(material.id)) || materialBaseTitle(material);
            return (
              <TouchableOpacity
                key={String(material.id)}
                onPress={() => {
                  if (allowMultiple) {
                    onAddExistingMaterial?.(material);
                  } else {
                    onMaterialChange?.(material.id);
                  }
                  setOpen(false);
                }}
                style={[
                  { paddingVertical: 10, paddingHorizontal: 12 },
                  active ? styles.dropdownListItemActive : { backgroundColor: '#fff' },
                ]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={{ fontSize: 14, color: active ? ACCENT_TEXT : FG }}>
                  {optionLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Dropdown>

      <MaterialDocViewerModal
        visible={viewer.visible}
        onClose={closeViewer}
        url={viewer.url}
        title={viewer.title}
        viewerKind={viewer.viewerKind}
      />
    </View>
  );
}

export function materialIdsFromSelection(selectedMaterialId) {
  if (Array.isArray(selectedMaterialId)) {
    return selectedMaterialId.filter(Boolean).map(String);
  }
  return selectedMaterialId ? [String(selectedMaterialId)] : [];
}

const localStyles = StyleSheet.create({
  // Match Create modal "+ Add New" chip (dropdownOption): pill + 36px height.
  selectMatchAddNew: {
    minHeight: 36,
    height: 36,
    borderRadius: 9999,
    paddingVertical: 0,
    paddingHorizontal: 12,
  },
  selectedSelectRow: {
    paddingRight: 4,
    gap: 4,
  },
  openSelectedHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    height: '100%',
    paddingVertical: 0,
  },
  openSelectedText: {
    flex: 1,
    minWidth: 0,
    color: FG,
  },
  chevronHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
  },
});
