import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import { X } from 'lucide-react';
import BulletinLearnadoodleBody from './BulletinLearnadoodleBody';
import { formatRelativeStreamMeta } from '../../lib/bulletinStreamModel';
import { resolveStreamCardIcon } from './bulletinStreamIcons';

export default function BulletinStreamDetailModal({
  visible,
  entry,
  onClose,
  headerRight = null,
  contextMenuHandlers = null,
}) {
  if (!entry) return null;

  const post = entry.kind === 'post' ? entry.payload : null;
  const when = formatRelativeStreamMeta(entry.createdAt);
  const detailTitle = entry.title || entry.label || 'Bulletin';
  const { Icon, color: iconColor, backgroundColor: iconBg } = resolveStreamCardIcon(entry.cardType);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          {...(Platform.OS === 'web' && { cursor: 'default' })}
        />
        <View style={styles.cardWrap}>
        <View style={styles.card} {...(contextMenuHandlers || {})}>
          <View style={styles.header}>
            <View style={styles.headerMain}>
              <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                <Icon size={18} color={iconColor} strokeWidth={2.25} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.label}>{entry.label}</Text>
                <Text style={styles.title}>{detailTitle}</Text>
                {when ? <Text style={styles.meta}>{when}</Text> : null}
              </View>
            </View>
            <View style={styles.headerActions}>
              {headerRight}
              <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={18} color="#64748B" strokeWidth={2.25} />
            </TouchableOpacity>
            </View>
          </View>
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {entry.showFormattedBody && entry.fullBody ? (
              <BulletinLearnadoodleBody body={entry.fullBody} />
            ) : post?.body ? (
              <BulletinLearnadoodleBody body={post.body} textStyle={styles.bodyText} />
            ) : (
              <>
                {entry.meta ? <Text style={styles.bodyText}>{entry.meta}</Text> : null}
                {entry.excerpt ? <Text style={styles.excerpt}>{entry.excerpt}</Text> : null}
              </>
            )}
          </ScrollView>
        </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
    }),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 520,
    zIndex: 1,
  },
  card: {
    width: '100%',
    maxHeight: Platform.OS === 'web' ? '80vh' : '86%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.16)',
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
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
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flexShrink: 0,
  },
  label: {
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
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  meta: {
    fontSize: 13,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  excerpt: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    fontStyle: 'italic',
    marginTop: 8,
  },
});
