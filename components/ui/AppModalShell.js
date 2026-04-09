import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { X } from 'lucide-react';

export default function AppModalShell({
  mode = 'add',
  title,
  eyebrow,
  accent = '#7C70F4',
  accentSoft = '#F4F1FF',
  HeroIcon = null,
  onClose,
  children,
  footer,
  contentContainerStyle,
  bodyStyle,
}) {
  return (
    <View style={styles.modal}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { backgroundColor: accentSoft }]}>
          <View style={styles.headerLeft}>
            {!!eyebrow && (
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { color: accent }]}>
                  {mode === 'edit' ? `EDIT ${eyebrow}` : `NEW ${eyebrow}`}
                </Text>
              </View>
            )}
            <Text style={styles.title}>{title}</Text>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.heroIcon}>
              {HeroIcon ? <HeroIcon size={26} color={accent} /> : null}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={18} color="#7E86B3" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.body, contentContainerStyle, bodyStyle]}>{children}</View>
      </ScrollView>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    width: '100%',
    maxWidth: 860,
    // Keep add/edit modals at a consistent shell height; body content scrolls within.
    height: Platform.OS === 'web' ? '86vh' : '86%',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#24324A',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerLeft: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 8,
    backgroundColor: '#FFFFFFC9',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    color: '#1E2A3A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFFB3',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5EAF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 0,
  },
  footer: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
});

