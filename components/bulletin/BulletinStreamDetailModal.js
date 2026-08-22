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
import FormattedInstructionText from '../create/shared/FormattedInstructionText';
import BulletinPostAttachmentList from './BulletinPostAttachmentList';
import { formatRelativeStreamMeta, streamCardSecondaryMeta } from '../../lib/bulletinStreamModel';
import { ACCENT_TEXT } from '../create/shared/createModalStyles';
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
  const secondaryMeta = streamCardSecondaryMeta(entry);
  const { Icon, color: iconColor, backgroundColor: iconBg } = resolveStreamCardIcon(entry.cardType, entry);
  const hasHeaderActions = Boolean(headerRight);

  const renderBody = () => {
    if (entry.title && entry.showFormattedBody) {
      return (
        <Text style={styles.detailTitle}>{entry.title}</Text>
      );
    }
    return null;
  };

  const renderMainContent = () => {
    if (entry.showFormattedBody && entry.fullBody) {
      return (
        <BulletinLearnadoodleBody
          body={entry.fullBody}
          systemKind={entry.payload?.systemKind || post?.systemKind || null}
          subjectName={entry.subjectName}
          textStyle={styles.cardBodyText}
        />
      );
    }

    if (post?.body) {
      return (
        <FormattedInstructionText
          text={post.body}
          style={styles.cardBodyText}
          wrapStyle={styles.plainBodyWrap}
        />
      );
    }

    return (
      <>
        {secondaryMeta ? <Text style={styles.secondaryMeta}>{secondaryMeta}</Text> : null}
        {entry.meta && !secondaryMeta ? <Text style={styles.secondaryMeta}>{entry.meta}</Text> : null}
        {entry.excerpt ? (
          <FormattedInstructionText
            text={entry.excerpt}
            style={styles.cardBodyText}
            wrapStyle={styles.plainBodyWrap}
          />
        ) : null}
        {!entry.excerpt && entry.title && !entry.showFormattedBody ? (
          <Text style={styles.detailTitle}>{entry.title}</Text>
        ) : null}
      </>
    );
  };

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
            <View style={styles.cardActions}>
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
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.cardInner}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <Icon size={18} color={iconColor} strokeWidth={2.25} />
                </View>
                <View style={[styles.cardMain, hasHeaderActions ? styles.cardMainWithMenu : null]}>
                  <View style={styles.labelMetaRow}>
                    <Text style={styles.label}>{entry.label}</Text>
                    {when ? (
                      <>
                        <Text style={styles.labelMetaDot} accessibilityElementsHidden importantForAccessibility="no">
                          ·
                        </Text>
                        <Text style={styles.labelWhen}>{when}</Text>
                      </>
                    ) : null}
                  </View>
                  <View style={styles.cardBody}>
                    {renderBody()}
                    {renderMainContent()}
                    <BulletinPostAttachmentList materials={post?.materials} />
                  </View>
                </View>
              </View>
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
    padding: 24,
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
    maxWidth: 840,
    zIndex: 1,
  },
  card: {
    position: 'relative',
    width: '100%',
    maxHeight: Platform.OS === 'web' ? '80vh' : '86%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  cardActions: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardInner: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
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
    gap: 12,
  },
  cardMainWithMenu: {
    paddingRight: 72,
  },
  cardBody: {
    gap: 8,
  },
  labelMetaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: ACCENT_TEXT,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  labelMetaDot: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: '#CBD5E1',
    marginLeft: 4,
    marginRight: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  labelWhen: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: '#94A3B8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 22,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  secondaryMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    backgroundColor: '#FFFFFF',
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  plainBodyWrap: {
    marginTop: 0,
  },
  cardBodyText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
