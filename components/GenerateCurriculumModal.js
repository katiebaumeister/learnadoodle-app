/**
 * @deprecated Use EditSubjectUnitsModal via dispatchOpenSubjectUnitsEditor().
 * Redirect stub — prevents legacy UI from rendering.
 */

import { useEffect } from 'react';
import { dispatchOpenSubjectUnitsEditor } from '../lib/subjectUnitsEditor';

export default function GenerateCurriculumModal({
  visible,
  onClose,
  subjectId,
  subjectName,
  childIds = [],
}) {
  useEffect(() => {
    if (!visible || !subjectId) return;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[GenerateCurriculumModal] Deprecated. Use dispatchOpenSubjectUnitsEditor / EditSubjectUnitsModal instead.',
      );
    }
    dispatchOpenSubjectUnitsEditor({
      subjectId,
      subjectName,
      method: 'generate',
      childIds,
    });
    onClose?.();
  }, [visible, subjectId, subjectName, childIds, onClose]);

  return null;
}
