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
} from 'lucide-react';
import { buildStreamPreviewDisplay } from '../../lib/bulletinStreamModel';
import { resolveStreamCardIcon } from './bulletinStreamIcons';
import BulletinLearnadoodleBody from './BulletinLearnadoodleBody';
import { ACCENT_TEXT } from '../create/shared/createModalStyles';

export default function BulletinStreamCard({
  entry,
  showSubjectName = false,
  preview = false,
  onPress = null,
  onSubjectPress = null,
  headerRight = null,
  contextMenuHandlers = null,
}) {
  const { Icon, color: iconColor, backgroundColor: iconBg } = resolveStreamCardIcon(entry.cardType);
  const clickable = Boolean(onPress && (preview || entry.clickable));
  const showSubjectChip = Boolean(
    !preview && showSubjectName && entry.subjectName && entry.subjectId,
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

  if (preview) {
    const lines = buildStreamPreviewDisplay(entry, { showSubjectName });
    const previewBody = (
      <View style={styles.previewRow}>
        <View style={[styles.previewIconWrap, { backgroundColor: iconBg }]}>
          <Icon size={16} color={iconColor} strokeWidth={2.25} />
        </View>
        <View style={styles.previewCopy}>
          {lines.label ? (
            <Text style={styles.previewLabel} numberOfLines={1}>
              {lines.label}
            </Text>
          ) : null}
          {lines.title ? (
            <Text style={styles.previewTitle} numberOfLines={2}>
              {lines.title}
            </Text>
          ) : null}
          {lines.subtitle ? (
            <Text style={styles.previewSubtitle} numberOfLines={2}>
              {lines.subtitle}
            </Text>
          ) : null}
          {lines.meta ? (
            <Text style={styles.previewMeta} numberOfLines={1}>
              {lines.meta}
            </Text>
          ) : null}
        </View>
      </View>
    );

    return (
      <View style={styles.previewWrap}>
        <View style={styles.previewCard}>
          <View style={styles.previewRowOuter} {...(contextMenuHandlers || {})}>
            {clickable ? (
              <TouchableOpacity
                onPress={() => onPress(entry)}
                accessibilityRole="button"
                activeOpacity={0.92}
                style={[styles.previewPressArea, styles.previewCardClickable]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                {previewBody}
              </TouchableOpacity>
            ) : (
              <View style={styles.previewPressArea}>{previewBody}</View>
            )}
            {headerRight ? (
              <View style={styles.previewMenuWrap}>{headerRight}</View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

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
    <View style={styles.wrap} {...(contextMenuHandlers || {})}>
      <View style={[styles.card, clickable && styles.cardClickable]}>
        {headerRight ? (
          <View style={styles.cardHeaderMenu}>{headerRight}</View>
        ) : null}
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Icon size={18} color={iconColor} strokeWidth={2.25} />
          </View>
          <View style={[styles.cardMain, headerRight ? styles.cardMainWithMenu : null]}>
            <View style={styles.labelRow}>
              <Text style={styles.typeLabel}>{entry.label}</Text>
              {subjectChip ? (
                <View style={styles.labelRowTrailing}>{subjectChip}</View>
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
  previewWrap: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.14)',
  },
  previewCard: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  previewRowOuter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
  },
  previewPressArea: {
    flex: 1,
    minWidth: 0,
  },
  previewMenuWrap: {
    flexShrink: 0,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  previewCardClickable: {
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.12s ease',
      ':hover': {
        backgroundColor: 'rgba(248, 250, 252, 0.9)',
      },
    }),
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  previewIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748B',
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewMeta: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
    lineHeight: 16,
    marginTop: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  wrap: {
    marginBottom: 0,
  },
  card: {
    position: 'relative',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 11,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
      transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
    }),
  },
  cardHeaderMenu: {
    position: 'absolute',
    top: 7,
    right: 10,
    zIndex: 2,
  },
  cardMainWithMenu: {
    paddingRight: 22,
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
    gap: 3,
  },
  cardPressArea: {
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' && {
      padding: 0,
      margin: 0,
    }),
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
    color: ACCENT_TEXT,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
