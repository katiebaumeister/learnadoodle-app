/**
 * Google Classroom–style stream card for bulletin feed items.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  FileText,
  HelpCircle,
  Megaphone,
  Upload,
} from 'lucide-react';
import { formatStreamTimestamp } from '../../lib/services/bulletinClient';
import { STREAM_CARD_TYPE } from '../../lib/bulletinStreamModel';
import BulletinLearnadoodleBody from './BulletinLearnadoodleBody';

const ICON_BY_TYPE = {
  [STREAM_CARD_TYPE.ASSIGNMENT_POSTED]: FileText,
  [STREAM_CARD_TYPE.SUBMISSION]: Upload,
  [STREAM_CARD_TYPE.FEEDBACK]: CheckCircle2,
  [STREAM_CARD_TYPE.QUESTION]: HelpCircle,
  [STREAM_CARD_TYPE.ANNOUNCEMENT]: Megaphone,
  [STREAM_CARD_TYPE.LESSON_COMPLETE]: BookOpen,
};

const ICON_COLOR_BY_TYPE = {
  [STREAM_CARD_TYPE.ASSIGNMENT_POSTED]: '#2563EB',
  [STREAM_CARD_TYPE.SUBMISSION]: '#7C3AED',
  [STREAM_CARD_TYPE.FEEDBACK]: '#059669',
  [STREAM_CARD_TYPE.QUESTION]: '#D97706',
  [STREAM_CARD_TYPE.ANNOUNCEMENT]: '#6366F1',
  [STREAM_CARD_TYPE.LESSON_COMPLETE]: '#0D9488',
};

const ICON_BG_BY_TYPE = {
  [STREAM_CARD_TYPE.ASSIGNMENT_POSTED]: '#EFF6FF',
  [STREAM_CARD_TYPE.SUBMISSION]: '#F5F3FF',
  [STREAM_CARD_TYPE.FEEDBACK]: '#ECFDF5',
  [STREAM_CARD_TYPE.QUESTION]: '#FFFBEB',
  [STREAM_CARD_TYPE.ANNOUNCEMENT]: '#EEF2FF',
  [STREAM_CARD_TYPE.LESSON_COMPLETE]: '#F0FDFA',
};

export default function BulletinStreamCard({
  entry,
  showSubjectName = false,
  onPress = null,
  onSubjectPress = null,
  headerRight = null,
}) {
  const Icon = ICON_BY_TYPE[entry.cardType] || Megaphone;
  const iconColor = ICON_COLOR_BY_TYPE[entry.cardType] || '#64748B';
  const iconBg = ICON_BG_BY_TYPE[entry.cardType] || '#F8FAFC';
  const clickable = Boolean(entry.clickable && onPress);
  const showSubjectChip = Boolean(
    showSubjectName && entry.subjectName && entry.subjectId,
  );
  const subjectChipClickable = Boolean(showSubjectChip && onSubjectPress);

  const subjectChipLabel = (
    <View style={styles.subjectPillInner}>
      <ArrowUpRight size={11} color="#475569" strokeWidth={2.5} />
      <Text style={styles.subjectPillText}>{entry.subjectName}</Text>
    </View>
  );

  const subjectChip = showSubjectChip ? (
    subjectChipClickable ? (
      <TouchableOpacity
        style={styles.subjectPill}
        onPress={(e) => {
          if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation();
          onSubjectPress(entry.subjectId);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open ${entry.subjectName}`}
        activeOpacity={0.85}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        {subjectChipLabel}
      </TouchableOpacity>
    ) : (
      <View style={styles.subjectPill}>
        {subjectChipLabel}
      </View>
    )
  ) : null;

  const cardBody = (
    <>
      {entry.title ? (
        <Text style={styles.title} numberOfLines={entry.showFormattedBody ? undefined : 2}>
          {entry.title}
        </Text>
      ) : null}
      {entry.meta ? <Text style={styles.meta}>{entry.meta}</Text> : null}
      {entry.showFormattedBody && entry.fullBody ? (
        <BulletinLearnadoodleBody body={entry.fullBody} />
      ) : null}
      {!entry.showFormattedBody && entry.excerpt ? (
        <Text style={styles.excerpt} numberOfLines={3}>
          {entry.excerpt.startsWith('"') ? entry.excerpt : `"${entry.excerpt}"`}
        </Text>
      ) : null}
      {clickable && entry.actionHint ? (
        <Text style={styles.actionHint}>{entry.actionHint}</Text>
      ) : null}
    </>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.timeDivider}>{formatStreamTimestamp(entry.createdAt)}</Text>
      <View style={[styles.card, clickable && styles.cardClickable]}>
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Icon size={18} color={iconColor} strokeWidth={2.25} />
          </View>
          <View style={styles.cardMain}>
            <View style={styles.labelRow}>
              <Text style={styles.typeLabel}>{entry.label}</Text>
              {(subjectChip || headerRight) ? (
                <View style={styles.labelRowTrailing}>
                  {subjectChip}
                  {headerRight}
                </View>
              ) : null}
            </View>
            {clickable ? (
              <TouchableOpacity
                onPress={() => onPress(entry)}
                accessibilityRole="button"
                activeOpacity={0.92}
                style={styles.cardPressArea}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                {cardBody}
              </TouchableOpacity>
            ) : (
              cardBody
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  timeDivider: {
    alignSelf: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginVertical: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
      transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
    }),
  },
  cardClickable: {
    ...(Platform.OS === 'web' && {
      ':hover': {
        borderColor: '#CBD5E1',
      },
    }),
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardPressArea: {
    alignSelf: 'stretch',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  labelRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 0,
    marginLeft: 8,
  },
  typeLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  meta: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  excerpt: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    fontStyle: 'italic',
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.12s ease',
    }),
  },
  subjectPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  subjectPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  actionHint: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
