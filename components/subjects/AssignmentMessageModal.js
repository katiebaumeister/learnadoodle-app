import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { findLinkedAssignment, getChildIdsFromEvent } from '../../lib/assignmentWorkflowClient';
import AskParentHelpModal from '../child/AskParentHelpModal';

/**
 * Child-facing assignment message entry (ask parent for help).
 * Parent nudges use NudgeEventPickerModal instead.
 */
export default function AssignmentMessageModal({
  visible = false,
  onClose,
  onSent,
  familyId,
  event = null,
  assignment = null,
  isParentViewer = true,
  children = [],
  subjectId = null,
  assignedChildIds = [],
}) {
  const [loadedAssignment, setLoadedAssignment] = useState(assignment);

  const childIds = useMemo(
    () => getChildIdsFromEvent(event, assignedChildIds),
    [event, assignedChildIds],
  );
  const primaryChildId = childIds[0] || null;

  useEffect(() => {
    if (!visible) return;
    setLoadedAssignment(assignment);
  }, [visible, assignment]);

  useEffect(() => {
    if (!visible || isParentViewer || !familyId || !event?.id || !primaryChildId) return;
    let cancelled = false;
    findLinkedAssignment({ familyId, childId: primaryChildId, eventId: event.id })
      .then((row) => {
        if (!cancelled) setLoadedAssignment(row || assignment || null);
      })
      .catch(() => {
        if (!cancelled) setLoadedAssignment(assignment || null);
      });
    return () => { cancelled = true; };
  }, [visible, isParentViewer, familyId, event?.id, primaryChildId, assignment]);

  if (isParentViewer || !visible) return null;

  return (
    <AskParentHelpModal
      visible={visible}
      onClose={onClose}
      onSent={onSent}
      familyId={familyId}
      childId={primaryChildId}
      assignment={loadedAssignment}
      eventContext={
        event?.id
          ? {
              id: event.id,
              title: event.title,
              start_ts: event.start_ts,
              end_ts: event.end_ts,
              subject_id: event.subject_id || subjectId || null,
            }
          : null
      }
      titleOverride="Message parent about assignment"
      ctaTextOverride="Send message"
    />
  );
}
