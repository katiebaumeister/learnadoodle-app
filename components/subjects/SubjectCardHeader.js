import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Pencil } from 'lucide-react';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';

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
  isParentViewer = true,
  onEditSubject,
  needsHelpBadge = null,
  stopPropagationOnMenu = false,
}) {
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

  const showEditSubject = isParentViewer && typeof onEditSubject === 'function';

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
          {showEditSubject ? (
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
                style={styles.editSubjectIconButton}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  onEditSubject?.();
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${subjectName}`}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Pencil size={16} color="#374151" strokeWidth={2} />
              </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  cardMenuWrap: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
  },
  editSubjectIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'opacity 0.2s ease',
    }),
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
});
