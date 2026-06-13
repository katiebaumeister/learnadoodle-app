import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Platform } from 'react-native';
import { ChevronDown, Plus } from 'lucide-react';
import RubricBuilder from '../../rubrics/RubricBuilder';
import { getRubrics } from '../../../lib/services/gradebookClient';
import { createModalStyles as styles, MUTED, PLACEHOLDER } from './createModalStyles';

function normalizeRubricsResponse(result) {
  const rows = result?.data || (result?.error ? [] : (Array.isArray(result) ? result : []));
  return Array.isArray(rows) ? rows : [];
}

export default function RubricSelectField({
  familyId,
  rubricId,
  onRubricChange,
  label = 'Rubric',
  enabled = true,
}) {
  const [rubrics, setRubrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [showRubricBuilder, setShowRubricBuilder] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!familyId || !enabled) {
      setRubrics([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const result = await getRubrics();
        if (!cancelled) {
          setRubrics(
            normalizeRubricsResponse(result).map((row) => ({
              id: row.id,
              title: row.title,
            }))
          );
        }
      } catch (_) {
        if (!cancelled) setRubrics([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, enabled, refreshKey]);

  const selected = rubrics.find((r) => String(r.id) === String(rubricId));

  return (
    <>
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            style={[styles.select, { flex: 1 }]}
            onPress={() => setOpen((v) => !v)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.selectText, !selected && !loading && styles.selectPlaceholder, loading && { color: PLACEHOLDER }]}>
              {loading ? 'Loading…' : selected?.title || 'Select rubric…'}
            </Text>
            <ChevronDown size={16} color={MUTED} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowRubricBuilder(true)}
            style={[styles.dropdownOption, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={14} color="#2563EB" />
            <Text style={[styles.dropdownOptionText, { color: '#2563EB' }]}>Add New</Text>
          </TouchableOpacity>
        </View>
        {open ? (
          <View style={{ marginTop: 4, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, maxHeight: 220, backgroundColor: '#fff' }}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                onPress={() => {
                  onRubricChange?.(null);
                  setOpen(false);
                }}
                style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={{ fontSize: 14, color: MUTED }}>None</Text>
              </TouchableOpacity>
              {rubrics.map((rubric) => {
                const active = String(rubric.id) === String(rubricId);
                return (
                  <TouchableOpacity
                    key={String(rubric.id)}
                    onPress={() => {
                      onRubricChange?.(rubric.id);
                      setOpen(false);
                    }}
                    style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: active ? '#EFF6FF' : '#fff' }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={{ fontSize: 14, color: active ? '#1D4ED8' : '#111827' }}>
                      {rubric.title || 'Untitled rubric'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <Modal visible={showRubricBuilder} transparent animationType="fade" onRequestClose={() => setShowRubricBuilder(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, maxHeight: '90%', overflow: 'hidden' }}>
            <RubricBuilder
              familyId={familyId}
              onCancel={() => setShowRubricBuilder(false)}
              onSave={(saved) => {
                onRubricChange?.(saved?.id || null);
                setShowRubricBuilder(false);
                setRefreshKey((k) => k + 1);
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
