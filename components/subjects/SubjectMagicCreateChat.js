/**
 * In-modal Doodle chat for magic Create (assignment / single learning day).
 * Isolated provider + fresh AI conversation stream (does not use left-pane thread).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { DoodleCommandProvider } from '../../app/state/useDoodleCommandStore';
import DoodleCommandPane from '../doodle/DoodleCommandPane';
import { getChildren } from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';

function MagicCreateChatInner({
  familyId,
  subjectId,
  subjectName,
  academicYearId,
  childIds = [],
  purpose,
  withDates,
  sourceMethod,
  seedPrompt,
  onDone,
}) {
  const { user } = useAuth() || {};
  const [children, setChildren] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getChildren();
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : (Array.isArray(data?.children) ? data.children : []);
        setChildren(rows.filter(Boolean));
      } catch (_) {
        if (!cancelled) setChildren([]);
      }
    })();
    return () => { cancelled = true; };
  }, [familyId]);

  const roster = useMemo(() => {
    const scoped = Array.isArray(childIds) && childIds.length
      ? children.filter((c) => childIds.map(String).includes(String(c.id)))
      : children;
    return {
      children: scoped.length ? scoped : children,
      subjects: subjectId
        ? [{ id: subjectId, name: subjectName || 'Subject', title: subjectName || 'Subject' }]
        : [],
    };
  }, [children, childIds, subjectId, subjectName]);

  const shellContextInput = useMemo(() => ({
    activeTab: 'subjects',
    familyId,
    schoolYearId: academicYearId || null,
    selectedSubjectId: subjectId || null,
    selectedChildIds: Array.isArray(childIds) ? childIds.map(String) : [],
    userId: user?.id || null,
    userRole: 'parent',
    enabledFeatures: {},
  }), [familyId, academicYearId, subjectId, childIds, user?.id]);

  const capabilities = useMemo(() => ({
    canManageEvents: true,
    canMarkAttendance: true,
    canUseDoodleBot: true,
  }), []);

  const headerSubtitle = purpose === 'assignment'
    ? 'Create an assignment'
    : 'Create a learning day';

  return (
    <View style={styles.wrap}>
      <DoodleCommandPane
        embedded
        skipHydrate
        contextArea="learning"
        shellContextInput={shellContextInput}
        roster={roster}
        capabilities={capabilities}
        seedPrompt={seedPrompt}
        seedAutoSubmit={sourceMethod === 'generate'}
        freshConversation={{
          familyId,
          title: `Create · ${subjectName || 'Subject'}`,
          conversationType: 'subject_magic',
          metadata: {
            subjectId,
            purpose,
            withDates: !!withDates,
            sourceMethod,
          },
        }}
        headerTitleOverride="Create"
        headerSubtitleOverride={headerSubtitle}
        onActionCompleted={(result) => {
          onDone?.(result);
        }}
      />
    </View>
  );
}

export default function SubjectMagicCreateChat(props) {
  return (
    <DoodleCommandProvider>
      <MagicCreateChatInner {...props} />
    </DoodleCommandProvider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS !== 'web' ? { minHeight: 420 } : null),
  },
});
