/**
 * @deprecated Unused — welcome is seeded via homeWelcomeBulletin.js.
 * Mode-aware post-onboarding setup checklist (Home rail — not chatbot).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Check, X } from 'lucide-react';
import {
  getSetupGuideForMode,
  getEffectiveCompletedKeys,
  isSetupGuideFullyComplete,
  isSetupGuideDismissed,
  dismissSetupGuide,
  markSetupItemComplete,
  resolveSetupItemNavigation,
  dispatchSetupGuideAction,
  SETUP_GUIDE_PROGRESS_EVENT,
} from '../../lib/setupGuide';

const LEAGUE_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

const BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

export default function SetupGuideCard({
  mode,
  userId,
  familyId,
  onNavigate,
  onAction,
  appData = null,
  onVisibilityChange = null,
}) {
  const guide = getSetupGuideForMode(mode);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = () => setTick((n) => n + 1);
    window.addEventListener(SETUP_GUIDE_PROGRESS_EVENT, handler);
    return () => window.removeEventListener(SETUP_GUIDE_PROGRESS_EVENT, handler);
  }, []);

  const completedKeys = useMemo(
    () => getEffectiveCompletedKeys(userId, familyId, mode, appData || {}),
    [userId, familyId, mode, appData, tick],
  );

  const dismissed = userId && isSetupGuideDismissed(userId, familyId, mode);
  const allComplete = isSetupGuideFullyComplete(mode, completedKeys);
  const visible = Boolean(userId && familyId && guide && !dismissed && !allComplete);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  const handleItemPress = useCallback((item) => {
    if (!item?.key) return;
    markSetupItemComplete(userId, familyId, item.key);
    const nav = resolveSetupItemNavigation(item.key);
    if (nav?.tab && onNavigate) {
      onNavigate(nav.tab, nav.subtab ?? null);
    }
  }, [userId, familyId, onNavigate]);

  const handlePrimaryCta = useCallback(() => {
    const { primaryCta } = guide;
    if (!primaryCta) return;
    if (primaryCta.action) {
      markSetupItemComplete(userId, familyId, primaryCta.action);
      if (onAction) {
        onAction(primaryCta.action);
      } else {
        dispatchSetupGuideAction(primaryCta.action);
      }
    }
    const nav = resolveSetupItemNavigation(primaryCta.action);
    if (nav?.tab && onNavigate) {
      onNavigate(nav.tab, nav.subtab ?? null);
    }
  }, [guide, userId, familyId, onAction, onNavigate]);

  const handleDismiss = useCallback(() => {
    dismissSetupGuide(userId, familyId, mode);
    setTick((n) => n + 1);
  }, [userId, familyId, mode]);

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{guide.title}</Text>
          <Text style={styles.subtitle}>{guide.subtitle}</Text>
        </View>
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={handleDismiss}
          accessibilityLabel="Dismiss setup guide"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <X size={18} color="#64748B" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.checklist}>
        {guide.items.map((item) => {
          const done = completedKeys.has(item.key);
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.checkRow}
              onPress={() => handleItemPress(item)}
              accessibilityRole="button"
              accessibilityState={{ checked: done }}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
                {done ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <View style={styles.checkCopy}>
                <Text style={[styles.checkLabel, done && styles.checkLabelDone]}>{item.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {guide.primaryCta ? (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handlePrimaryCta}
          activeOpacity={0.9}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.primaryBtnText}>{guide.primaryCta.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
    ...LEAGUE_FONT,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    ...BODY_FONT,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  checklist: {
    gap: 4,
    marginBottom: 14,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.12s ease',
    }),
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  checkCircleDone: {
    backgroundColor: '#85C4F2',
    borderColor: '#85C4F2',
  },
  checkCopy: {
    flex: 1,
    minWidth: 0,
  },
  checkLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    ...BODY_FONT,
  },
  checkLabelDone: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  primaryBtn: {
    backgroundColor: '#85C4F2',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
    }),
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    ...LEAGUE_FONT,
  },
});
