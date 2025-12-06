/**
 * Group Details Modal
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert } from 'react-native';
import { X, Users, BookOpen, Calendar, Share2, UserPlus } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import * as socialClient from '../../lib/services/socialClient';

export default function GroupDetailsModal({ isOpen, onClose, group, familyId }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [sharedResources, setSharedResources] = useState([]);

  useEffect(() => {
    if (isOpen && group) {
      loadSharedResources();
    }
  }, [isOpen, group]);

  const loadSharedResources = async () => {
    if (!group) return;
    const result = await socialClient.listSharedResources({
      shared_with_type: 'group',
      shared_with_id: group.id,
    });
    if (result.success) {
      setSharedResources(result.resources || []);
    }
  };

  const handleShareResource = () => {
    Alert.alert('Share Resource', 'Resource sharing feature coming soon!');
  };

  if (!isOpen || !group) return null;

  const isMember = group.membership && group.membership.status === 'approved';
  const isAdmin = group.membership && group.membership.role === 'admin';

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{group.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Group Info */}
            <View style={styles.section}>
              {group.description && (
                <Text style={styles.description}>{group.description}</Text>
              )}

              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Users size={20} color={colors.indigo} />
                  <Text style={styles.statText}>{group.members?.length || 0} Members</Text>
                </View>
                <View style={styles.stat}>
                  <BookOpen size={20} color={colors.indigo} />
                  <Text style={styles.statText}>{group.resources_count || 0} Resources</Text>
                </View>
              </View>

              {group.invite_code && (
                <View style={styles.inviteCode}>
                  <Text style={styles.inviteLabel}>Invite Code:</Text>
                  <Text style={styles.inviteCodeText}>{group.invite_code}</Text>
                </View>
              )}
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              {['overview', 'members', 'resources', 'classes'].map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, activeTab === tab && styles.tabActive]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <View style={styles.tabContent}>
                {group.location && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Location:</Text>
                    <Text style={styles.infoValue}>{group.location}</Text>
                  </View>
                )}
                {group.tags && group.tags.length > 0 && (
                  <View style={styles.tags}>
                    {group.tags.map((tag, idx) => (
                      <View key={idx} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {activeTab === 'members' && (
              <View style={styles.tabContent}>
                {group.members && group.members.length > 0 ? (
                  group.members.map((member) => (
                    <View key={member.id} style={styles.memberCard}>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>
                          {member.family?.name || 'Family'}
                        </Text>
                        <Text style={styles.memberRole}>{member.role}</Text>
                      </View>
                      {member.status === 'pending' && isAdmin && (
                        <TouchableOpacity
                          style={styles.approveButton}
                          onPress={async () => {
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              if (!session) throw new Error('Not authenticated');
                              
                              const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
                              const response = await fetch(`${apiBase}/api/social/groups/${group.id}/members/${member.id}/approve`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${session.access_token}`,
                                },
                              });
                              
                              if (response.ok) {
                                Alert.alert('Success', 'Member approved');
                                onClose();
                              } else {
                                Alert.alert('Error', 'Failed to approve member');
                              }
                            } catch (err) {
                              Alert.alert('Error', err.message);
                            }
                          }}
                        >
                          <Text style={styles.approveButtonText}>Approve</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No members yet</Text>
                )}
              </View>
            )}

            {activeTab === 'resources' && (
              <View style={styles.tabContent}>
                {isMember && (
                  <TouchableOpacity
                    style={styles.shareButton}
                    onPress={handleShareResource}
                  >
                    <Share2 size={20} color="#ffffff" />
                    <Text style={styles.shareButtonText}>Share Resource</Text>
                  </TouchableOpacity>
                )}

                {sharedResources.length > 0 ? (
                  sharedResources.map((resource) => (
                    <View key={resource.id} style={styles.resourceCard}>
                      <Text style={styles.resourceTitle}>{resource.title}</Text>
                      {resource.description && (
                        <Text style={styles.resourceDescription}>{resource.description}</Text>
                      )}
                      <Text style={styles.resourceType}>{resource.resource_type}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No shared resources yet</Text>
                )}
              </View>
            )}

            {activeTab === 'classes' && (
              <View style={styles.tabContent}>
                <Text style={styles.emptyText}>Shared classes coming soon</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 24,
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statText: {
    fontSize: 14,
    color: '#6b7280',
  },
  inviteCode: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  inviteCodeText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 20,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.indigo,
  },
  tabText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.indigo,
    fontWeight: '600',
  },
  tabContent: {
    minHeight: 200,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 8,
  },
  infoValue: {
    fontSize: 14,
    color: '#6b7280',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    color: '#6b7280',
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 14,
    color: '#6b7280',
    textTransform: 'capitalize',
  },
  approveButton: {
    backgroundColor: colors.indigo,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  approveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.indigo,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resourceCard: {
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 12,
  },
  resourceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  resourceDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  resourceType: {
    fontSize: 12,
    color: '#9ca3af',
    textTransform: 'capitalize',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
    marginTop: 40,
  },
});

