import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform } from 'react-native';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { supabase } from '../../lib/supabase';
import GeistCard from '../GeistCard';

export default function IDCardView({ child, familyId }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [idCard, setIdCard] = useState(null);

  useEffect(() => {
    loadIDCard();
  }, [child?.id]);

  const loadIDCard = async () => {
    try {
      const { data, error } = await supabase
        .from('child_documents')
        .select('*')
        .eq('child_id', child.id)
        .eq('document_type', 'id_card')
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      setIdCard(data);
    } catch (error) {
      console.error('Error loading ID card:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: tokens.text }]}>Student ID Card</Text>
      </View>

      <GeistCard variant="large" style={[styles.idCard, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
        <View style={styles.idCardContent}>
          {/* ID Card Header */}
          <View style={[styles.idHeader, { borderBottomColor: tokens.border }]}>
            <Text style={[styles.idTitle, { color: tokens.text }]}>STUDENT IDENTIFICATION CARD</Text>
            <Text style={[styles.idSubtitle, { color: tokens.textSecondary }]}>Learnadoodle</Text>
          </View>

          {/* ID Card Body */}
          <View style={styles.idBody}>
            <View style={styles.idLeft}>
              {child.avatar_url && (child.avatar_url.startsWith('http://') || child.avatar_url.startsWith('https://') || child.avatar_url.startsWith('data:')) ? (
                <Image 
                  source={{ uri: child.avatar_url }} 
                  style={styles.avatar}
                  onError={(e) => {
                    // Suppress 404 errors for missing avatars - they're harmless
                    if (Platform.OS === 'web' && e.nativeEvent) {
                      e.preventDefault?.();
                    }
                  }}
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: tokens.bgSubtle }]}>
                  <Text style={[styles.avatarInitials, { color: tokens.text }]}>
                    {(child.first_name || child.name || 'S').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.idRight}>
              <Text style={[styles.idName, { color: tokens.text }]}>
                {child.first_name || child.name || 'Student Name'}
              </Text>
              {child.grade && (
                <Text style={[styles.idInfo, { color: tokens.textSecondary }]}>
                  Grade {child.grade}
                </Text>
              )}
              {child.date_of_birth && (
                <Text style={[styles.idInfo, { color: tokens.textSecondary }]}>
                  DOB: {new Date(child.date_of_birth).toLocaleDateString()}
                </Text>
              )}
              {familyId && (
                <Text style={[styles.idInfo, { color: tokens.textSecondary }]}>
                  ID: {child.id?.substring(0, 8).toUpperCase()}
                </Text>
              )}
            </View>
          </View>

          {/* ID Card Footer */}
          <View style={[styles.idFooter, { borderTopColor: tokens.border }]}>
            <Text style={[styles.idFooterText, { color: tokens.textMuted }]}>
              This card is valid for educational purposes only
            </Text>
          </View>
        </View>
      </GeistCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  idCard: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    borderWidth: 2,
  },
  idCardContent: {
    padding: spacing.xl,
  },
  idHeader: {
    borderBottomWidth: 2,
    paddingBottom: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  idTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  idSubtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  idBody: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
  idLeft: {
    flexShrink: 0,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  avatarInitials: {
    fontSize: 48,
    fontWeight: '700',
  },
  idRight: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  idName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  idInfo: {
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  idFooter: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  idFooterText: {
    fontSize: 11,
    textAlign: 'center',
  },
});











