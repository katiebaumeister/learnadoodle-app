'use client';

import React, { useMemo } from 'react';
import { SectionList, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, MoveRight, Clock, MinusCircle } from 'lucide-react';

export type ProposedChangeKind = 'add' | 'move' | 'resize' | 'cancel';

export type ProposedChange = {
  id: string;
  kind: ProposedChangeKind;
  label: string;
  when?: string;
  before?: string;
  after?: string;
  child?: string;
  subject?: string;
  planId?: string;
};

export type ReviewListProps = {
  items: ProposedChange[];
  appliedIds?: string[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

type SectionData = {
  title: string;
  kind: ProposedChangeKind;
  data: ProposedChange[];
};

const KIND_LABELS: Record<ProposedChangeKind, string> = {
  add: 'Adds',
  move: 'Moves',
  resize: 'Resizes',
  cancel: 'Cancels',
};

const ReviewList: React.FC<ReviewListProps> = ({ items, appliedIds = [], selectedIds, onToggle }) => {
  const sections: SectionData[] = useMemo(() => {
    const grouped: Record<ProposedChangeKind, ProposedChange[]> = {
      add: [],
      move: [],
      resize: [],
      cancel: [],
    };

    items.forEach(item => {
      grouped[item.kind].push(item);
    });

    return (Object.keys(grouped) as ProposedChangeKind[])
      .filter(kind => grouped[kind].length > 0)
      .map(kind => ({
        title: KIND_LABELS[kind],
        kind,
        data: grouped[kind],
      }));
  }, [items]);

  const renderMeta = (item: ProposedChange) => {
    const parts: string[] = [];
    if (item.child) parts.push(item.child);
    if (item.subject) parts.push(item.subject);
    if (item.when) parts.push(item.when);
    const meta = parts.join(' • ');

    if (item.kind === 'move' || item.kind === 'resize') {
      return (
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{meta}</Text>
          <View style={styles.moveChip}>
            <Text style={styles.moveChipText}>{item.before || '—'}</Text>
            <MoveRight size={12} color="#2563eb" />
            <Text style={styles.moveChipText}>{item.after || '—'}</Text>
          </View>
        </View>
      );
    }

    return <Text style={styles.metaText}>{meta}</Text>;
  };

  const renderItem = ({ item }: { item: ProposedChange }) => {
    const isSelected = selectedIds.includes(item.id);
    const isApplied = appliedIds.includes(item.id);

    return (
      <TouchableOpacity
        onPress={() => !isApplied && onToggle(item.id)}
        style={[styles.row, isApplied && styles.rowApplied]}
        activeOpacity={isApplied ? 1 : 0.85}
      >
        <View style={[styles.checkbox, (isSelected || isApplied) && styles.checkboxChecked, isApplied && styles.checkboxApplied]}>
          {(isSelected || isApplied) && <Check size={14} color="#ffffff" />}
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.label, isApplied && styles.labelApplied]}>{item.label}</Text>
          {renderMeta(item)}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: SectionData }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
      <View style={styles.sectionDivider} />
    </View>
  );

  if (sections.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Clock size={18} color="#9ca3af" />
        <Text style={styles.emptyText}>No proposed changes</Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.sectionListContent}
      initialNumToRender={12}
      maxToRenderPerBatch={40}
      windowSize={10}
      removeClippedSubviews={false}
      ListFooterComponent={<View style={{ height: 16 }} />}
    />
  );
};

const styles = StyleSheet.create({
  sectionListContent: {
    paddingBottom: 8,
    gap: 8,
  },
  sectionHeader: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  rowApplied: {
    backgroundColor: '#ecfdf5',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2563eb',
    borderColor: 'transparent',
  },
  checkboxApplied: {
    backgroundColor: '#16a34a',
  },
  rowContent: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    fontFamily: Platform.OS === 'web' ? 'Outfit' : undefined,
  },
  labelApplied: {
    color: '#047857',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
  },
  moveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  moveChipText: {
    fontSize: 11,
    color: '#2563eb',
    fontFamily: Platform.OS === 'web' ? 'Inter' : undefined,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
  },
});

export default ReviewList;
