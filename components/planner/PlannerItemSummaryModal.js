import React, { useMemo } from 'react';
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
import AppModalShell from '../ui/AppModalShell';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import { ModalFooter } from '../ui/ModalFooter';
import { MODAL_ACCENT } from '../ui/modalButtonStyles';
import { createModalStyles as sharedStyles } from '../create/shared/createModalStyles';
import { buildPlannerItemSummaryModel } from '../../lib/planner/plannerItemSummaryModel';
import { getEventChildIdsForDisplay } from '../../lib/utils/eventChildIds';

const MODAL_MAX_WIDTH = 520;
const WEB_DIALOG_Z_INDEX = 2147483647;
const LEAGUE_FONT = '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function SummaryBody({
  model,
  event,
  children,
}) {
  const childIds = getEventChildIdsForDisplay(event, children);
  const childNamesLine = childIds
    .map((id) => {
      const child = (children || []).find((row) => String(row?.id) === String(id));
      return String(child?.first_name || child?.name || '').trim();
    })
    .filter(Boolean)
    .join(' · ');
  const isAssignment = model.category === 'Assignment';
  const namesBesideAvatars = isAssignment ? childNamesLine : (model.subheadline || childNamesLine);

  return (
    <View style={styles.bodyStack}>
      <View style={styles.headlineBlock}>
        <Text style={styles.headline}>{model.headline}</Text>
        {isAssignment && model.subheadline ? (
          <Text style={styles.subheadline}>{model.subheadline}</Text>
        ) : null}
        {childIds.length > 0 && namesBesideAvatars ? (
          <View style={styles.metaRow}>
            <ChildAvatarCluster
              childIds={childIds}
              familyChildren={children || []}
              size={22}
            />
            <Text style={styles.subheadline}>{namesBesideAvatars}</Text>
          </View>
        ) : (
          !isAssignment && model.subheadline ? (
            <Text style={styles.subheadline}>{model.subheadline}</Text>
          ) : null
        )}
      </View>

      <View style={styles.rowsCard}>
        {model.rows.map((row, index) => (
          <View
            key={row.label}
            style={[
              styles.row,
              index === model.rows.length - 1 && styles.rowLast,
            ]}
          >
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      {model.notesPreview ? (
        <View style={styles.notesBlock}>
          <Text style={styles.notesLabel}>
            {model.category === 'Assignment' ? 'Instructions' : model.category === 'Learning day' ? 'Session notes' : 'Notes'}
          </Text>
          <Text style={styles.notesText}>{model.notesPreview}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function PlannerItemSummaryModal({
  visible,
  onClose,
  event,
  assignment = null,
  category = null,
  children = [],
  subjects = [],
  readOnly = false,
  onEdit,
}) {
  const model = useMemo(
    () => buildPlannerItemSummaryModel({
      event,
      assignment,
      category,
      children,
      subjects,
    }),
    [event, assignment, category, children, subjects],
  );

  if (!visible || !event) return null;

  const content = (
    <View style={[styles.overlay, Platform.OS === 'web' && styles.overlayWebPortal]}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
        {...(Platform.OS === 'web' && { cursor: 'default' })}
      />
      <View style={styles.modalWrap}>
        <AppModalShell
          title={model.categoryLabel}
          onClose={onClose}
          shellStyle={[sharedStyles.compactShell, styles.shell, { borderTopColor: model.accentSoft }]}
          titleRowStyle={sharedStyles.compactTitleRow}
          contentContainerStyle={sharedStyles.contentContainer}
          bodyStyle={sharedStyles.shellBody}
          disableShellScroll
          maxWidth={MODAL_MAX_WIDTH}
        >
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <SummaryBody
              model={model}
              event={event}
              children={children}
            />
          </ScrollView>
          <View style={styles.footerWrap}>
            {readOnly ? (
              <TouchableOpacity
                onPress={onClose}
                style={styles.readOnlyCloseBtn}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Close"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={16} color="#374151" />
                <Text style={styles.readOnlyCloseText}>Close</Text>
              </TouchableOpacity>
            ) : (
              <ModalFooter
                mode="edit"
                primaryLabel="Edit"
                onCancel={onClose}
                onPrimary={onEdit}
                accent={MODAL_ACCENT}
              />
            )}
          </View>
        </AppModalShell>
      </View>
    </View>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body) {
    try {
      const ReactDOM = require('react-dom');
      if (ReactDOM.createPortal) {
        return ReactDOM.createPortal(content, document.body);
      }
    } catch (_) {}
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {content}
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
      zIndex: 1000000,
    }),
  },
  overlayWebPortal: {
    zIndex: WEB_DIALOG_Z_INDEX,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  modalWrap: {
    width: '100%',
    maxWidth: MODAL_MAX_WIDTH,
    zIndex: 1,
  },
  shell: {
    maxWidth: MODAL_MAX_WIDTH,
    minHeight: 0,
    height: 'auto',
    borderTopWidth: 4,
    ...(Platform.OS === 'web' && {
      maxHeight: '88vh',
      boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)',
    }),
  },
  bodyScroll: {
    maxHeight: Platform.OS === 'web' ? 420 : 360,
  },
  bodyScrollContent: {
    paddingBottom: 4,
  },
  bodyStack: {
    gap: 14,
  },
  headlineBlock: {
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  headline: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  subheadline: {
    fontSize: 14,
    color: '#64748B',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  rowsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingVertical: 4,
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  rowValue: {
    fontSize: 15,
    lineHeight: 21,
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  notesBlock: {
    gap: 6,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
  footerWrap: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  readOnlyCloseBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  readOnlyCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && { fontFamily: LEAGUE_FONT }),
  },
});
