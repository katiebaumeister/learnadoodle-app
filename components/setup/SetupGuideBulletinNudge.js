/**
 * @deprecated Replaced by SetupWelcomeBulletinPost inside BulletinBoardSection.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Sparkles } from 'lucide-react';
import { dispatchSetupGuideAction } from '../../lib/setupGuide';

const LEAGUE_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

const BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

export default function SetupGuideBulletinNudge({ nudge, onNavigate, onAction }) {
  if (!nudge) return null;

  const handlePress = () => {
    if (nudge.action) {
      if (onAction) onAction(nudge.action);
      else dispatchSetupGuideAction(nudge.action);
    }
    if (nudge.tab && onNavigate) {
      onNavigate(nudge.tab);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Sparkles size={18} color="#85C4F2" strokeWidth={2.25} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{nudge.title}</Text>
        <Text style={styles.body}>{nudge.body}</Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={handlePress}
          activeOpacity={0.85}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.ctaText}>{nudge.ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    gap: 12,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
    }),
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
    ...LEAGUE_FONT,
  },
  body: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 10,
    ...BODY_FONT,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    ...LEAGUE_FONT,
  },
});
