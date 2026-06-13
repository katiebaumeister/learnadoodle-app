import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Edit2, CalendarClock, List, FileText, MoreVertical, Plus } from 'lucide-react';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import Dropdown, { DropdownItem } from '../ui/Dropdown';

function getSubjectTermLabel(term) {
  const raw = String(term || '').trim().toLowerCase();
  if (raw === 'full_year') return 'Full year';
  if (raw === 'fall_term') return 'Fall term';
  if (raw === 'spring_term') return 'Spring term';
  return '';
}

export function buildSubjectCardYearTermLine(subject) {
  if (!subject) return '';
  const schoolYear = String(subject.school_year || '').trim();
  const termLabel = getSubjectTermLabel(subject.school_term);
  if (!schoolYear && !termLabel) return '';
  if (schoolYear && termLabel) return `${schoolYear} · ${termLabel}`;
  return schoolYear || termLabel;
}

export const subjectCardContainerStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: 20,
  borderWidth: 1,
  borderColor: 'rgba(148, 163, 184, 0.24)',
};

export default function SubjectCardHeader({
  subjectName,
  subject = null,
  yearTermLine: yearTermLineProp = null,
  assignedChildIds = [],
  familyChildren = [],
  unitsEditorLabel = 'Edit units',
  showActionsMenu = true,
  promoteActionsToTopRow = false,
  isParentViewer = true,
  onEditSubject,
  onConfigureSchedule,
  onEditUnits,
  onNewAssignment,
  needsHelpBadge = null,
  stopPropagationOnMenu = false,
}) {
  const menuBtnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addAssignmentHovered, setAddAssignmentHovered] = useState(false);

  const yearTermLine = yearTermLineProp ?? buildSubjectCardYearTermLine(subject);

  const assignedChildrenMeta = useMemo(
    () =>
      (assignedChildIds || [])
        .map((childId) => {
          const child = (familyChildren || []).find((c) => String(c.id) === String(childId));
          const name = child?.name || child?.first_name || null;
          if (!name) return null;
          return { id: String(child?.id || childId), name };
        })
        .filter(Boolean),
    [assignedChildIds, familyChildren],
  );

  const runMenuAction = (action) => {
    setMenuOpen(false);
    action?.();
  };

  const showEditSubject = isParentViewer && typeof onEditSubject === 'function';
  const showConfigure = typeof onConfigureSchedule === 'function';
  const showUnits = isParentViewer && typeof onEditUnits === 'function';
  const showAssignment = isParentViewer && typeof onNewAssignment === 'function';
  const showEditSubjectInMenu = showEditSubject && !promoteActionsToTopRow;
  const showConfigureInMenu = showConfigure && !promoteActionsToTopRow;
  const showUnitsInMenu = showUnits && !promoteActionsToTopRow;
  const showAssignmentInMenu = showAssignment && !promoteActionsToTopRow;
  const showAddAssignmentFooter = showAssignment && promoteActionsToTopRow;
  const hasMenu = showActionsMenu && (
    showEditSubjectInMenu || showConfigureInMenu || showUnitsInMenu || showAssignmentInMenu
  );

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.headerTitleRow}>
          <View style={styles.subjectTitleWithBadge}>
            <Text style={styles.subjectName} numberOfLines={2}>
              {subjectName}
            </Text>
            {needsHelpBadge}
          </View>
          {hasMenu ? (
            <View
              style={styles.cardMenuWrap}
              {...(stopPropagationOnMenu && Platform.OS === 'web'
                ? {
                    onClick: (e) => e.stopPropagation(),
                    onMouseDown: (e) => e.stopPropagation(),
                  }
                : {})}
            >
              <TouchableOpacity
                ref={menuBtnRef}
                style={[styles.cardMenuBtn, menuOpen && styles.cardMenuBtnActive]}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  setMenuOpen((open) => !open);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${subjectName} actions`}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <MoreVertical size={16} color="#94A3B8" />
              </TouchableOpacity>
              <Dropdown
                visible={menuOpen}
                triggerRef={menuBtnRef}
                onClose={() => setMenuOpen(false)}
                placement="bottom-end"
                width={220}
                variant="context"
              >
                {showEditSubjectInMenu ? (
                  <DropdownItem
                    icon={Edit2}
                    label="Edit Subject"
                    onPress={() => runMenuAction(onEditSubject)}
                  />
                ) : null}
                {showConfigureInMenu ? (
                  <DropdownItem
                    icon={CalendarClock}
                    label="Configure Schedule"
                    onPress={() => runMenuAction(onConfigureSchedule)}
                  />
                ) : null}
                {showUnitsInMenu ? (
                  <DropdownItem
                    icon={List}
                    label={unitsEditorLabel}
                    onPress={() => runMenuAction(onEditUnits)}
                  />
                ) : null}
                {showAssignmentInMenu ? (
                  <DropdownItem
                    icon={FileText}
                    label="New Assignment"
                    onPress={() => runMenuAction(onNewAssignment)}
                  />
                ) : null}
              </Dropdown>
            </View>
          ) : null}
        </View>
        {yearTermLine || assignedChildrenMeta.length > 0 ? (
          <View style={styles.subjectMetaRow}>
            {yearTermLine ? <Text style={styles.subjectMetaLine}>{yearTermLine}</Text> : null}
            {assignedChildrenMeta.length > 0 ? (
              <View style={styles.subjectAssigneeGroup}>
                {yearTermLine ? <Text style={styles.subjectMetaSeparator}> · </Text> : null}
                <View style={styles.subjectAssigneeInline}>
                  <ChildAvatarCluster
                    childIds={assignedChildrenMeta.map((child) => child.id)}
                    familyChildren={familyChildren}
                    size={30}
                    overlap={-9}
                  />
                  <Text style={styles.subjectStudentInlineName}>
                    {assignedChildrenMeta.map((child) => child.name).join(', ')}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {showAddAssignmentFooter ? (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[
              styles.addAssignmentButton,
              addAssignmentHovered && styles.addAssignmentButtonHovered,
            ]}
            onPress={onNewAssignment}
            onMouseEnter={() => Platform.OS === 'web' && setAddAssignmentHovered(true)}
            onMouseLeave={() => Platform.OS === 'web' && setAddAssignmentHovered(false)}
            accessibilityRole="button"
            accessibilityLabel="Add assignment"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={16} color="#6B7280" />
            <Text
              style={[
                styles.addAssignmentButtonText,
                addAssignmentHovered && styles.addAssignmentButtonTextHovered,
              ]}
            >
              Add assignment
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 0,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  cardMenuWrap: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
    marginTop: 2,
  },
  cardMenuBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  cardMenuBtnActive: {
    backgroundColor: '#F1F5F9',
  },
  subjectTitleWithBadge: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 4,
  },
  subjectName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectMetaLine: {
    marginTop: 4,
    fontSize: 12,
    color: '#374151',
    lineHeight: 16,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectMetaRow: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  subjectMetaSeparator: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectAssigneeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subjectAssigneeInline: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subjectStudentInlineName: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionBar: {
    paddingTop: 4,
    width: '100%',
  },
  addAssignmentButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      boxSizing: 'border-box',
    }),
  },
  addAssignmentButtonHovered: {
    backgroundColor: '#EFF6FF',
  },
  addAssignmentButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      transition: 'font-weight 0.2s ease',
    }),
  },
  addAssignmentButtonTextHovered: {
    fontWeight: '600',
  },
});
