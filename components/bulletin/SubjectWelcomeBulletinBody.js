import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { CalendarDays, FileText, Trophy, Users, Lightbulb } from 'lucide-react';

const USE_CASES = [
  {
    Icon: CalendarDays,
    iconColor: '#2563EB',
    iconBg: 'rgba(37, 99, 235, 0.1)',
    title: 'Share weekly plans and announcements',
    description: 'Keep everyone informed about what\'s coming up.',
  },
  {
    Icon: FileText,
    iconColor: '#6366F1',
    iconBg: 'rgba(99, 102, 241, 0.1)',
    title: 'Share assignment instructions and reminders',
    description: 'Make expectations clear and deadlines easy to find.',
  },
  {
    Icon: Trophy,
    iconColor: '#D97706',
    iconBg: 'rgba(217, 119, 6, 0.12)',
    title: 'Celebrate completed projects and milestones',
    description: 'Highlight progress and achievements together.',
  },
  {
    Icon: Users,
    iconColor: '#0D9488',
    iconBg: 'rgba(13, 148, 136, 0.1)',
    title: 'Keep everyone learning this subject on the same page',
    description: 'A shared space for students, parents, and tutors.',
  },
];

export default function SubjectWelcomeBulletinBody({ subjectName, textStyle = null }) {
  const name = String(subjectName || '').trim() || 'this subject';
  const bodyStyle = textStyle || styles.bodyText;

  return (
    <View style={styles.wrap}>
      <Text style={bodyStyle}>
        {`Welcome to ${name}! This is the Bulletin Board for ${name}.`}
      </Text>
      <Text style={[bodyStyle, styles.sectionHeading]}>This is where you can:</Text>
      <View style={styles.list}>
        {USE_CASES.map(({ Icon, iconColor, iconBg, title, description }) => (
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
          Attach files, links, and images to posts to support learning. Explore Smart Actions in the top right for more planning and class tools.
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
