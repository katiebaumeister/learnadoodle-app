import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Search } from 'lucide-react';

const SUBJECT_OPTIONS = [
  { label: 'All Subjects', value: null },
  { label: 'Math', value: 'math' },
  { label: 'Science', value: 'science' },
  { label: 'Language Arts', value: 'language_arts' },
  { label: 'History', value: 'history' },
];


export default function ExploreFiltersBar({
  children = [],
  activeChildId,
  onChildChange,
  filters,
  onFiltersChange,
}) {
  const handleSubjectChange = (value) => {
    onFiltersChange({ ...filters, subjectKey: value });
  };


  const handleSearchChange = (text) => {
    onFiltersChange({ ...filters, search: text });
  };

  return (
    <View style={styles.container}>
      {/* Filters row - chips first */}
      <View style={styles.filtersRow}>
        {/* Child filter */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.chipRow}
        >
          {children.length === 0 ? (
            <Text style={styles.noChildText}>Add a child to track progress</Text>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  !activeChildId && styles.filterChipActive,
                ]}
                onPress={() => onChildChange(null)}
              >
                <Text style={[
                  styles.filterChipText,
                  !activeChildId && styles.filterChipTextActive,
                ]}>
                  All family
                </Text>
              </TouchableOpacity>
              {children.map((child) => {
                const isActive = activeChildId === child.id;
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => onChildChange(child.id)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      isActive && styles.filterChipTextActive,
                    ]}>
                      {child.first_name || child.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>

        {/* Subject filter */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.chipRow}
        >
          {SUBJECT_OPTIONS.map((option) => {
            const isActive = filters.subjectKey === option.value || (!filters.subjectKey && option.value === null);
            return (
              <TouchableOpacity
                key={option.label}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => handleSubjectChange(option.value)}
              >
                <Text style={[
                  styles.filterChipText,
                  isActive && styles.filterChipTextActive,
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

      </View>

      {/* Search bar - second row, right-aligned on desktop */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Search size={16} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search courses"
            placeholderTextColor="#9ca3af"
            value={filters.search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchContainer: {
    width: '100%',
    ...Platform.select({
      web: {
        alignSelf: 'flex-end',
        maxWidth: 400,
      },
    }),
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    ...Platform.select({
      web: {
        outlineWidth: 0,
        outlineColor: 'transparent',
      },
    }),
  },
  filtersRow: {
    gap: 6,
  },
  chipRow: {
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  filterChipActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  filterChipText: {
    fontSize: 13,
    color: '#374151',
  },
  filterChipTextActive: {
    fontWeight: '600',
    color: '#1e40af',
  },
  noChildText: {
    fontSize: 13,
    color: '#6b7280',
    paddingVertical: 6,
  },
});

