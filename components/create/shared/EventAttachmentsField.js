import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ChevronDown, Eye, Plus } from 'lucide-react';
import { getMaterials } from '../../../lib/services/materialsClient';
import Dropdown from '../../ui/Dropdown';
import MaterialDocViewerModal, {
  inferMaterialViewerKind,
  resolveMaterialDocViewerUrl,
} from '../../materials/MaterialDocViewerModal';
import { createModalStyles as styles, MUTED, PLACEHOLDER, ACCENT_TEXT, FG } from './createModalStyles';

export default function EventAttachmentsField({
  familyId,
  selectedMaterialId,
  onMaterialChange,
  onAddNew,
  label = 'Attachments',
  placeholder = 'Select attachment…',
  allowMultiple = false,
  selectedMaterialIds = [],
  onAddExistingMaterial = null,
  materialFilter = null,
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

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    setLoading(true);
    getMaterials(familyId)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setMaterials(typeof materialFilter === 'function' ? list.filter(materialFilter) : list);
      })
      .catch(() => {
        if (!cancelled) setMaterials([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId, materialFilter]);

  useEffect(() => {
    setOpen(false);
  }, [selectedMaterialId, selectedMaterialIds?.length]);

  const selected = materials.find((m) => String(m.id) === String(selectedMaterialId));
  const attachedIdSet = new Set((selectedMaterialIds || []).map(String));
  const availableMaterials = allowMultiple
    ? materials.filter((material) => !attachedIdSet.has(String(material.id)))
    : materials;
  const selectLabel = loading
    ? 'Loading…'
    : allowMultiple
      ? placeholder
      : (selected?.title || selected?.name || placeholder);

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
        <Text style={styles.fieldLabel}>{label}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {canOpenSelected ? (
          <View ref={triggerRef} style={[styles.select, localStyles.selectedSelectRow, { flex: 1 }]}>
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
              ) : (
                <Eye size={16} color={ACCENT_TEXT} />
              )}
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
            style={[styles.select, { flex: 1 }]}
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
                  {material.title || material.name || 'Untitled'}
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
    paddingVertical: 2,
  },
  openSelectedText: {
    flex: 1,
    minWidth: 0,
    color: FG,
  },
  chevronHit: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
});
