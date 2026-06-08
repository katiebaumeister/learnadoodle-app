import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import {
  Calendar,
  MoreHorizontal,
  Eye,
  Plus,
  MessageCircle,
  Pencil,
  Archive,
} from 'lucide-react';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import {
  formatAttentionSummary,
  formatGradeLabel,
  formatRelativeScheduleDate,
  getSubjectStatusDisplay,
  getSubjectVisual,
} from '../../lib/subjectDisplayUtils';

export default function LearningSubjectRow({
  subject,
  children = [],
  onPress,
  onViewSubject,
  onCreateEvent,
  onSendMessage,
  onEditSubject,
  onArchiveSubject,
  canManageSubjects = false,
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);
  const { Icon, color, bg } = getSubjectVisual(subject?.name);
  const statusDisplay = getSubjectStatusDisplay(
    subject?.status,
    subject?.progressPercent,
    subject?.progressCompleted
  );
  const attention = formatAttentionSummary(subject);
  const completed = subject?.progressCompleted ?? 0;
  const total = subject?.progressTotal ?? 0;
  const progressPercent = subject?.progressPercent ?? (total > 0 ? Math.round((completed / total) * 100) : 0);
  const nextItem = subject?.nextItem;
  const assignedChildIds = subject?.assignedChildren || [];
  const primaryChildId = assignedChildIds[0];
  const primaryChild = children.find((c) => String(c.id) === String(primaryChildId));
  const studentName = primaryChild?.name || primaryChild?.first_name || assignedChildIds.length > 1
    ? `${assignedChildIds.length} students`
    : 'Student';
  const gradeLabel = formatGradeLabel(primaryChild);
  const studentLine = [studentName, gradeLabel].filter(Boolean).join(' • ');

  const runMenuAction = (action) => {
    setMenuOpen(false);
    action?.(subject);
  };

  return (
    <View
      style={[styles.row, hovered && styles.rowHovered]}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      })}
    >
      <TouchableOpacity
        style={styles.rowMain}
        onPress={() => onPress?.(subject)}
        activeOpacity={0.85}
        accessibilityRole="button"
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <View style={styles.subjectCol}>
        <View style={[styles.iconWrap, { backgroundColor: bg }]}>
          <Icon size={20} color={color} strokeWidth={2} />
        </View>
        <View style={styles.subjectTextWrap}>
          <Text style={styles.subjectName} numberOfLines={1}>{subject?.name || 'Subject'}</Text>
          {studentLine ? (
            <Text style={styles.subjectMeta} numberOfLines={1}>{studentLine}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.progressCol}>
        <View style={[styles.statusBadge, { backgroundColor: statusDisplay.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusDisplay.color }]}>
            {statusDisplay.label}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.max(0, Math.min(100, progressPercent))}%`,
                backgroundColor: statusDisplay.color,
              },
            ]}
          />
        </View>
        <Text style={styles.progressMeta}>
          {total > 0 ? `${completed} / ${total} lessons` : `${progressPercent || 0}% complete`}
        </Text>
      </View>

      <View style={styles.upcomingCol}>
        {nextItem ? (
          <>
            <View style={styles.upcomingTitleRow}>
              <Calendar size={14} color="#64748B" />
              <Text style={styles.upcomingTitle} numberOfLines={1}>
                {nextItem.title || 'Upcoming lesson'}
              </Text>
            </View>
            <Text style={styles.upcomingMeta} numberOfLines={1}>
              {formatRelativeScheduleDate(nextItem.startTs || nextItem.dueDate)}
            </Text>
          </>
        ) : (
          <Text style={styles.upcomingEmpty}>Nothing scheduled</Text>
        )}
      </View>

      <View style={styles.attentionCol}>
        <Text
          style={[
            styles.attentionTitle,
            attention.tone === 'warning' ? styles.attentionWarning : styles.attentionPositive,
          ]}
          numberOfLines={1}
        >
          {attention.title}
        </Text>
        <Text style={styles.attentionSubtitle} numberOfLines={1}>{attention.subtitle}</Text>
      </View>
      </TouchableOpacity>

      <View style={styles.actionsCol}>
        <TouchableOpacity
          ref={menuBtnRef}
          style={[styles.menuBtn, menuOpen && styles.menuBtnActive]}
          onPress={(e) => {
            e?.stopPropagation?.();
            setMenuOpen((open) => !open);
          }}
          accessibilityRole="button"
          accessibilityLabel="Subject actions"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <MoreHorizontal size={18} color="#64748B" />
        </TouchableOpacity>

        <Dropdown
          visible={menuOpen}
          triggerRef={menuBtnRef}
          onClose={() => setMenuOpen(false)}
          placement="bottom-end"
          width={220}
        >
          <DropdownItem
            icon={Eye}
            label="View Subject"
            onPress={() => runMenuAction(onViewSubject || onPress)}
          />
          <DropdownItem
            icon={Plus}
            label="Create Event"
            onPress={() => runMenuAction(onCreateEvent)}
          />
          <DropdownItem
            icon={MessageCircle}
            label="Send Message"
            onPress={() => runMenuAction(onSendMessage)}
          />
          {canManageSubjects ? (
            <>
              <DropdownItem
                icon={Pencil}
                label="Edit Subject"
                onPress={() => runMenuAction(onEditSubject)}
              />
              <DropdownItem
                icon={Archive}
                label="Archive Subject"
                danger
                onPress={() => runMenuAction(onArchiveSubject)}
              />
            </>
          ) : null}
        </Dropdown>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { transition: 'background-color 0.15s ease' }),
  },
  rowHovered: {
    backgroundColor: '#FAFBFC',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  subjectCol: {
    flex: 1.4,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subjectTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  subjectMeta: {
    marginTop: 2,
    fontSize: 13,
    color: '#64748B',
  },
  progressCol: {
    flex: 1.1,
    minWidth: 0,
    gap: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  upcomingCol: {
    flex: 1.1,
    minWidth: 0,
    gap: 4,
  },
  upcomingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upcomingTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  upcomingMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  upcomingEmpty: {
    fontSize: 13,
    color: '#94A3B8',
  },
  attentionCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  attentionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  attentionWarning: {
    color: '#EA580C',
  },
  attentionPositive: {
    color: '#059669',
  },
  attentionSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  actionsCol: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  menuBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnActive: {
    backgroundColor: '#F1F5F9',
  },
});
