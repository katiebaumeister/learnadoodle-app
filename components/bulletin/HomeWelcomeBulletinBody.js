import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import {
  CalendarDays,
  FolderOpen,
  GraduationCap,
  Lightbulb,
  Megaphone,
} from 'lucide-react';
import { HOME_WELCOME_INTRO } from '../../lib/homeWelcomeBulletin';

const GETTING_STARTED = [
  {
    Icon: GraduationCap,
    iconColor: '#2563EB',
    iconBg: 'rgba(37, 99, 235, 0.1)',
    title: 'Create your school year',
    description: 'Set up terms, schedules, and your family\u2019s learning calendar.',
  },
  {
    Icon: CalendarDays,
    iconColor: '#6366F1',
    iconBg: 'rgba(99, 102, 241, 0.1)',
    title: 'Schedule lessons in Planner',
    description: 'Plan classes, events, and daily learning on your calendar.',
  },
  {
    Icon: Megaphone,
    iconColor: '#D97706',
    iconBg: 'rgba(217, 119, 6, 0.12)',
    title: 'Share announcements in Subjects',
    description: 'Keep everyone informed about what\u2019s happening in each class.',
  },
  {
    Icon: FolderOpen,
    iconColor: '#0D9488',
    iconBg: 'rgba(13, 148, 136, 0.1)',
    title: 'Organize resources in Materials',
    description: 'Store files, links, and lesson materials in one place.',
  },
];

export default function HomeWelcomeBulletinBody({ textStyle = null, compact = false }) {
  const bodyStyle = textStyle || styles.bodyText;

  if (compact) {
    return (
      <View style={styles.wrap}>
        <Text style={bodyStyle}>{HOME_WELCOME_INTRO}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={bodyStyle}>{HOME_WELCOME_INTRO}</Text>
      <Text style={[bodyStyle, styles.sectionHeading]}>Getting Started</Text>
      <View style={styles.list}>
        {GETTING_STARTED.map(({ Icon, iconColor, iconBg, title, description }) => (
          <View key={title} style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
              <Icon size={16} color={iconColor} strokeWidth={2.25} />
            </View>
            <View style={styles.copy}>
              <Text style={[bodyStyle, styles.itemTitle]}>{title}</Text>
              <Text style={styles.itemDescription}>{description}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.tipRow}>
        <View style={styles.tipIconWrap}>
          <Lightbulb size={14} color="#334155" strokeWidth={2.25} />
        </View>
        <Text style={[bodyStyle, styles.tipText]}>
          <Text style={styles.tipLabel}>Tip: </Text>
          You can dismiss this message at any time.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 0,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionHeading: {
    fontWeight: '500',
    color: '#334155',
    marginTop: 7,
  },
  list: {
    gap: 22,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemDescription: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  tipIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipText: {
    flex: 1,
    minWidth: 0,
  },
  tipLabel: {
    fontWeight: '600',
  },
});
