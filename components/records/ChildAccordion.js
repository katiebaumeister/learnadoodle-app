/**
 * Child Accordion Component
 * Expandable card for child-specific data within family-level tabs
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp, UserCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getChildColor } from '../../utils/avatarColors';
import { Image } from 'react-native';
import { safeImageUri } from '../../lib/safeImageUri';

const avatarSources = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
  prof9: require('../../assets/prof9.png'),
  prof10: require('../../assets/prof10.png'),
};

const resolveAvatarSource = (avatarKey) => {
  if (!avatarKey) return avatarSources.prof1;
  const uri = safeImageUri(avatarKey);
  if (uri) return { uri };
  const normalized = String(avatarKey)
    .toLowerCase()
    .replace(/.*\//, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
  return avatarSources[normalized] || avatarSources.prof1;
};

export default function ChildAccordion({
  child,
  defaultExpanded = false,
  children,
  summary = null,
  hideChildName = false,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const accentColor = getChildColor(child);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Image
            source={resolveAvatarSource(child.avatar)}
            style={styles.avatar}
            resizeMode="contain"
          />
          <View style={styles.headerText}>
            {!hideChildName && (
              <>
                <Text style={styles.childName}>{child.first_name || child.name}</Text>
                {child.grade && (
                  <Text style={styles.childGrade}>{child.grade}</Text>
                )}
              </>
            )}
            {summary && (
              <View style={styles.summaryRow}>
                {summary.readinessScore !== undefined && (
                  <Text style={styles.summaryText}>
                    {summary.readinessScore}% readiness
                  </Text>
                )}
                {summary.attendanceHours !== undefined && (
                  <Text style={styles.summaryText}>
                    {summary.attendanceHours}h logged
                  </Text>
                )}
                {summary.portfolioCount !== undefined && (
                  <Text style={styles.summaryText}>
                    {summary.portfolioCount} artifacts
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
        {isExpanded ? (
          <ChevronUp size={18} color={colors.textSecondary} />
        ) : (
          <ChevronDown size={18} color={colors.textSecondary} />
        )}
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerText: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  childGrade: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  summaryText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  content: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

