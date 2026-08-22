import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import {
  CalendarDays,
  FileText,
  Trophy,
  Users,
  Lightbulb,
  BookOpen,
  Paperclip,
} from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import {
  buildSubjectWelcomeIntro,
  buildSubjectWelcomeLeadIn,
  buildSubjectWelcomeTip,
  resolveSubjectWelcomeViewerMode,
  SUBJECT_WELCOME_USE_CASES_BY_MODE,
} from '../../lib/subjectWelcomeBulletinContent';

const USE_CASE_ICON_COLOR = '#64748B';
const USE_CASE_ICON_BG = 'rgba(100, 116, 139, 0.12)';

const USE_CASE_ICONS = {
  plans: CalendarDays,
  assignments: FileText,
  milestones: Trophy,
  together: Users,
  notes: BookOpen,
  resources: Paperclip,
};

export default function SubjectWelcomeBulletinBody({ subjectName, textStyle = null }) {
  const session = useSession();
  const bodyStyle = textStyle || styles.bodyText;
  const name = String(subjectName || '').trim() || 'this subject';

  const viewerMode = useMemo(() => resolveSubjectWelcomeViewerMode(session), [session]);
  const useCases = SUBJECT_WELCOME_USE_CASES_BY_MODE[viewerMode]
    || SUBJECT_WELCOME_USE_CASES_BY_MODE.parent;
  const intro = buildSubjectWelcomeIntro(name, viewerMode);
  const leadIn = buildSubjectWelcomeLeadIn(viewerMode);
  const tip = buildSubjectWelcomeTip(viewerMode);

  return (
    <View style={styles.wrap}>
      <Text style={bodyStyle}>{intro}</Text>
      <Text style={[bodyStyle, styles.sectionHeading]}>{leadIn}</Text>
      <View style={styles.list}>
        {useCases.map(({ key, title, description }) => {
          const Icon = USE_CASE_ICONS[key] || FileText;
          return (
            <View key={key} style={styles.row}>
              <View style={[styles.iconWrap, { backgroundColor: USE_CASE_ICON_BG }]}>
                <Icon size={16} color={USE_CASE_ICON_COLOR} strokeWidth={2.25} />
              </View>
              <View style={styles.copy}>
                <Text style={[bodyStyle, styles.itemTitle]}>{title}</Text>
                <Text style={[bodyStyle, styles.itemDescription]}>{description}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.tipRow}>
        <View style={styles.tipIconWrap}>
          <Lightbulb size={14} color="#334155" strokeWidth={2.25} />
        </View>
        <Text style={[bodyStyle, styles.tipText]}>
          <Text style={styles.tipLabel}>Tip: </Text>
          {tip}
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
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemDescription: {
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
