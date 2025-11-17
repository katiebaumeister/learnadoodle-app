import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react';
import { colors } from '../../../theme/colors';

export default function PortfolioTab({ child }) {
  // TODO: load from evidence/uploads table + Supabase Storage
  const items = [
    {
      id: "pf1",
      type: "Photo",
      subject: "Art",
      title: "Watercolor landscape",
      date: "Nov 10",
      thumbnailUrl: null,
    },
    {
      id: "pf2",
      type: "PDF",
      subject: "Writing",
      title: "Short story – 'The Lost Rocket'",
      date: "Nov 7",
      thumbnailUrl: null,
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio for {child.first_name}</Text>
        <TouchableOpacity style={styles.addButton}>
          <Plus size={14} color={colors.card} />
          <Text style={styles.addButtonText}>Upload work</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Upload photos, scans, or files from {child.first_name}'s work and we'll keep them here for transcripts and reporting.
          </Text>
        </View>
      ) : (
        <View style={styles.itemsGrid}>
          {items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.thumbnail} />
              <View style={styles.itemInfo}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{item.type}</Text>
                  </View>
                </View>
                <Text style={styles.itemMeta}>
                  {item.subject} • {item.date}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.card,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    margin: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  itemsGrid: {
    padding: 16,
    gap: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  itemCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  thumbnail: {
    aspectRatio: 4 / 3,
    width: '100%',
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
  },
  itemInfo: {
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeText: {
    fontSize: 11,
    color: colors.muted,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.muted,
  },
});

