import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { processDoodleMessage } from '../lib/doodleAssistant';

const CORE_ELEM = ['English/ELA','Math','Science','Social Studies'];
const EXTRA_ELEM = ['Art','Music','PE','Handwriting'];
const CORE_MID = ['ELA','Math','Science','Social Studies'];
const EXTRA_MID = ['World Language (Intro)','Art/PE/Health','Technology/Coding'];
const CORE_HS = ['English','Algebra/Geometry/Advanced Math','Biology/Chemistry/Physics','US/World History'];
const EXTRA_HS = ['Government/Economics','World Language','Health/PE','Electives'];

export default function SubjectSelectForm({ child, onClose, onSaved }) {
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [gradeOverrides, setGradeOverrides] = useState({}); // { subjectLabel: '9' }
  const [honorsMap, setHonorsMap] = useState({}); // { subjectLabel: true }

  const gradeNum = useMemo(() => {
    if (child.grade === 'K' || child.grade === 'Pre-K') return 0;
    const n = Number(child.grade);
    return Number.isFinite(n) ? n : 0;
  }, [child.grade]);

  const isElem = gradeNum >= 0 && gradeNum <= 5;
  const isMid = gradeNum >= 6 && gradeNum <= 8;
  const isHS = gradeNum >= 9;

  const suggestions = useMemo(() => {
    if (isElem) return [...CORE_ELEM, ...EXTRA_ELEM];
    if (isMid) return [...CORE_MID, ...EXTRA_MID];
    return [...CORE_HS, ...EXTRA_HS];
  }, [isElem, isMid]);

  const toggle = (name) => {
    setSelected((prev) => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const normalizeSubjectName = (label) => {
    // map grouped labels to canonical subject names
    const map = {
      'English/ELA': 'ELA',
      'ELA': 'ELA',
      'English': 'English',
      'Math': 'Math',
      'Algebra/Geometry/Advanced Math': 'Math',
      'Science': 'Science',
      'Biology/Chemistry/Physics': 'Science',
      'Social Studies': 'Social Studies',
      'US/World History': 'Social Studies',
      'World Language (Intro)': 'World Language',
      'World Language': 'World Language',
      'Art': 'Art',
      'Music': 'Music',
      'PE': 'PE',
      'Art/PE/Health': 'Health/PE',
      'Health/PE': 'Health/PE',
      'Government/Economics': 'Government/Economics',
      'Electives': 'Elective',
      'Handwriting': 'Handwriting',
      'Technology/Coding': 'Technology/Coding',
    };
    return map[label] || label;
  };

  const GRADE_OPTIONS = ['K','1','2','3','4','5','6','7','8','9','10','11','12'];

  const handleAiPick = async () => {
    try {
      setAiLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();
      if (!profile?.family_id) throw new Error('Family not found');

      const msg = `What subjects for ${child.grade} grade?`;
      const res = await processDoodleMessage(msg, profile.family_id);
      const text = res?.message || '';
      // Parse bullets like "• Math" lines
      const picks = text
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.startsWith('•'))
        .map(s => s.replace(/^•\s*/, ''))
        .map(s => s.replace(/:.+$/, ''));
      if (picks.length) {
        // Keep only ones in our suggestion set
        const allowed = new Set(suggestions.map(normalizeSubjectName));
        const merged = Array.from(new Set([
          ...selected,
          ...picks.map(normalizeSubjectName).filter(p => allowed.has(p)),
        ]));
        setSelected(merged);
      } else {
        Alert.alert('No AI picks', 'AI did not return a recognizable list.');
      }
    } catch (e) {
      console.error('AI suggest subjects failed:', e);
      Alert.alert('AI error', e.message || 'Failed to get AI suggestions');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (selected.length === 0) {
      Alert.alert('Select subjects', 'Please choose at least one subject.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();
      if (!profile?.family_id) throw new Error('Family not found');

      const baseRows = selected.map(label => ({
        family_id: profile.family_id,
        student_id: child.id,
        subject_name: normalizeSubjectName(label),
        grade: child.grade,
        notes: null,
      }));

      // Try extended with optional columns
      const extendedRows = baseRows.map((r, idx) => {
        const label = selected[idx];
        const subject_grade = gradeOverrides[label];
        const is_honors = honorsMap[label] ? true : false;
        return {
          ...r,
          ...(subject_grade ? { subject_grade } : {}),
          ...(isHS ? { is_honors } : {}),
        };
      });

      let { error } = await supabase.from('subject').insert(extendedRows);
      if (error && error.code === '42703') {
        // Column not found; retry with base rows only
        const retry = await supabase.from('subject').insert(baseRows);
        if (retry.error) throw retry.error;
      } else if (error) {
        throw error;
      }
      onSaved && onSaved(rows);
      onClose && onClose();
    } catch (e) {
      console.error('Save subjects failed:', e);
      Alert.alert('Error', e.message || 'Failed to save subjects');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Subjects for {child.name}</Text>
      <Text style={styles.subtitle}>Pick what {child.name} will study this year.</Text>

      <View style={styles.actionsTop}>
        <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={handleAiPick} disabled={aiLoading}>
          <Text style={[styles.btnText, styles.btnTextOutline]}>{aiLoading ? 'Asking AI…' : 'AI help me pick'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chipsWrap}>
        {suggestions.map(s => (
          <TouchableOpacity key={s} style={[styles.chip, selected.includes(s) && styles.chipSelected]} onPress={() => toggle(s)}>
            <Text style={[styles.chipText, selected.includes(s) && styles.chipTextSelected]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selected.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.subtitle}>Optional per-subject settings</Text>
          {selected.map(label => (
            <View key={label} style={styles.rowItem}>
              <Text style={styles.rowLabel}>{label}</Text>
              <View style={styles.rowControls}>
                <View style={styles.inlineChips}>
                  {GRADE_OPTIONS.map(g => (
                    <TouchableOpacity key={g} style={[styles.microChip, gradeOverrides[label] === g && styles.microChipSel]} onPress={() => setGradeOverrides(v => ({ ...v, [label]: g }))}>
                      <Text style={[styles.microChipText, gradeOverrides[label] === g && styles.microChipTextSel]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {isHS && (
                  <TouchableOpacity style={[styles.microToggle, honorsMap[label] && styles.microToggleSel]} onPress={() => setHonorsMap(v => ({ ...v, [label]: !v[label] }))}>
                    <Text style={[styles.microToggleText, honorsMap[label] && styles.microToggleTextSel]}>Honors</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={onClose} disabled={saving}>
          <Text style={[styles.btnText, styles.btnTextOutline]}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={handleSave} disabled={saving}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save Subjects'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#222' },
  subtitle: { color: '#666', marginVertical: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionsTop: { flexDirection: 'row', justifyContent: 'flex-end' },
  chip: { borderWidth: 1, borderColor: '#ddd', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#fff' },
  chipSelected: { borderColor: '#38B6FF', backgroundColor: '#E9F6FF' },
  chipText: { color: '#555' },
  chipTextSelected: { color: '#0c7ac9', fontWeight: '600' },
  rowItem: { marginTop: 12 },
  rowLabel: { fontWeight: '600', color: '#333', marginBottom: 6 },
  rowControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  inlineChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  microChip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 },
  microChipSel: { borderColor: '#38B6FF', backgroundColor: '#E9F6FF' },
  microChipText: { color: '#555', fontSize: 12 },
  microChipTextSel: { color: '#0c7ac9', fontSize: 12, fontWeight: '600' },
  microToggle: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 },
  microToggleSel: { borderColor: '#38B6FF', backgroundColor: '#E9F6FF' },
  microToggleText: { color: '#333', fontSize: 12 },
  microToggleTextSel: { color: '#0c7ac9', fontSize: 12, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  btn: { backgroundColor: '#38B6FF', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  btnDisabled: { backgroundColor: '#9ccff3' },
  btnText: { color: '#fff', fontWeight: '700' },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc' },
  btnTextOutline: { color: '#333' },
});


