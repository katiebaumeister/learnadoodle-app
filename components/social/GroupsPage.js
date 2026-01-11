/**
 * Groups Page - Main entry point for family groups, co-ops, pods
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { Users, Plus, Search, Calendar, BookOpen, MapPin, Lock, Globe, ChevronRight } from 'lucide-react';
import { colors } from '../../theme/colors';
import * as socialClient from '../../lib/services/socialClient';
import CreateGroupModal from './CreateGroupModal';
import GroupDetailsModal from './GroupDetailsModal';
import PageHeader from '../ui/PageHeader';
import AppContainer from '../ui/AppContainer';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';

export default function GroupsPage({ familyId }) {
  const [groups, setGroups] = useState([]);
  const [filteredGroups, setFilteredGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showGroupDetails, setShowGroupDetails] = useState(false);

  useEffect(() => {
    loadGroups();
  }, [familyId]);

  useEffect(() => {
    filterGroups();
  }, [groups, searchQuery, filterType]);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const result = await socialClient.listGroups({ is_public: true });
      if (result.success) {
        setGroups(result.groups || []);
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const filterGroups = () => {
    let filtered = groups;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(g => g.group_type === filterType);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g => 
        g.name.toLowerCase().includes(query) ||
        (g.description && g.description.toLowerCase().includes(query))
      );
    }

    setFilteredGroups(filtered);
  };

  const handleGroupClick = async (group) => {
    const result = await socialClient.getGroupDetails(group.id);
    if (result.success) {
      setSelectedGroup(result.group);
      setShowGroupDetails(true);
    }
  };

  const handleJoinGroup = async (group) => {
    try {
      const result = await socialClient.joinGroup(group.id);
      if (result.success) {
        Alert.alert('Success', 'Successfully joined group!');
        loadGroups();
      } else {
        Alert.alert('Error', result.error || 'Failed to join group');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to join group');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <PageHeader
        title="Groups & Co-ops"
        icon={Users}
        iconColor={colors.indigo}
        actions={[
          {
            label: 'Create Group',
            icon: Plus,
            onPress: () => setShowCreateModal(true),
            primary: true,
          },
        ]}
      />

      {/* Search and Filters */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search groups..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
          {['all', 'coop', 'pod', 'class', 'club', 'study_group'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterChip, filterType === type && styles.filterChipActive]}
              onPress={() => setFilterType(type)}
            >
              <Text style={[styles.filterChipText, filterType === type && styles.filterChipTextActive]}>
                {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Groups List */}
      <AppContainer fullWidth noPadding>
        {loading ? (
          <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>Loading groups...</Text>
          </View>
        ) : filteredGroups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No groups found"
            description="Create a new group or search for existing ones"
            size="default"
          />
        ) : (
          <ScrollView style={styles.groupsList}>
          filteredGroups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={styles.groupCard}
              onPress={() => handleGroupClick(group)}
            >
              <View style={styles.groupCardHeader}>
                <View style={styles.groupIcon}>
                  <Users size={24} color={colors.indigo} />
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.groupType}>{group.group_type}</Text>
                </View>
                {group.is_public ? (
                  <Globe size={16} color="#6b7280" />
                ) : (
                  <Lock size={16} color="#6b7280" />
                )}
              </View>

              {group.description && (
                <Text style={styles.groupDescription} numberOfLines={2}>
                  {group.description}
                </Text>
              )}

              <View style={styles.groupMeta}>
                {group.location && (
                  <View style={styles.metaItem}>
                    <MapPin size={14} color="#6b7280" />
                    <Text style={styles.metaText}>{group.location}</Text>
                  </View>
                )}
                {group.membership && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaText}>
                      {group.membership.role === 'admin' ? 'Admin' : 'Member'}
                    </Text>
                  </View>
                )}
              </View>

              {group.tags && group.tags.length > 0 && (
                <View style={styles.tags}>
                  {group.tags.slice(0, 3).map((tag, idx) => (
                    <View key={idx} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!group.membership && (
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={() => handleJoinGroup(group)}
                >
                  <Text style={styles.joinButtonText}>Join Group</Text>
                </TouchableOpacity>
              )}

              <ChevronRight size={20} color="#9ca3af" style={styles.chevron} />
            </TouchableOpacity>
          ))}
          </ScrollView>
        )}
      </AppContainer>

      {/* Modals */}
      <CreateGroupModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          loadGroups();
        }}
        familyId={familyId}
      />

      {selectedGroup && (
        <GroupDetailsModal
          isOpen={showGroupDetails}
          onClose={() => {
            setShowGroupDetails(false);
            setSelectedGroup(null);
            loadGroups();
          }}
          group={selectedGroup}
          familyId={familyId}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.indigo,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchSection: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  filters: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.indigo,
  },
  filterChipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  groupsList: {
    flex: 1,
    padding: 16,
  },
  groupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  groupType: {
    fontSize: 14,
    color: '#6b7280',
    textTransform: 'capitalize',
  },
  groupDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  groupMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#6b7280',
  },
  joinButton: {
    backgroundColor: colors.indigo,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  joinButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  chevron: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
    marginTop: 40,
  },
});

