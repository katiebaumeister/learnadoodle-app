/**
 * @deprecated Use EditSubjectUnitsModal via dispatchOpenSubjectUnitsEditor().
 * Redirect stub — prevents legacy UI from rendering.
 */

import { useEffect } from 'react';
import { dispatchOpenSubjectUnitsEditor } from '../lib/subjectUnitsEditor';

export default function ParsePlainTextModal({
  visible,
  onClose,
  subjectId,
  subjectName,
  childIds = [],
  initialMaterialId = null,
  autoStartOnOpen = false,
}) {
  useEffect(() => {
    if (!visible || !subjectId) return;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[ParsePlainTextModal] Deprecated. Use dispatchOpenSubjectUnitsEditor / EditSubjectUnitsModal instead.',
      );
    }
    dispatchOpenSubjectUnitsEditor({
      subjectId,
      subjectName,
      method: initialMaterialId ? 'upload' : 'paste_plain',
      childIds,
      initialMaterialId,
      autoContinueOnOpen: autoStartOnOpen && !!initialMaterialId,
    });
    onClose?.();
  }, [visible, subjectId, subjectName, childIds, initialMaterialId, autoStartOnOpen, onClose]);

  return null;
}
