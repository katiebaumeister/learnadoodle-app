import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const DEFAULT_MODAL_Z = 9999;
const ELEVATED_MODAL_Z = 10001;
/** Open above modals that use ELEVATED_MODAL_Z (e.g. Add Material from Add Subject). */
export const NESTED_MODAL_STACK_Z = 10050;
/** Open above create/edit modals that also use NESTED_MODAL_STACK_Z (e.g. Add Material from Assignment). */
export const NESTED_OVER_PARENT_MODAL_Z = 10100;

/**
 * On web, elevates this modal's portal so it appears above other modals (e.g. Plan Year).
 * Pass a ref to the overlay View inside your Modal; when visible, the modal's root z-index is set.
 * @param {React.RefObject} overlayRef - Ref attached to the overlay View (first child of Modal)
 * @param {boolean} visible - Whether the modal is visible
 * @param {number} [zIndex=10001] - Z-index to apply when visible (default above Plan Year)
 */
export function useModalStackElevation(overlayRef, visible, zIndex = ELEVATED_MODAL_Z) {
  const appliedRef = useRef(null);
  const portalRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!visible) {
      if (appliedRef.current) {
        appliedRef.current.style.zIndex = String(DEFAULT_MODAL_Z);
        appliedRef.current = null;
      }
      if (portalRef.current) {
        portalRef.current.style.zIndex = '';
        portalRef.current = null;
      }
      return;
    }
    const apply = () => {
      const node = overlayRef?.current;
      if (!node) return;
      const el = node.nodeType === 1 ? node : (node.getNativeNode?.() ?? node._nativeNode ?? node);
      if (!el || !el.parentElement) return;
      let portal = el;
      while (portal.parentElement && portal.parentElement !== document.body) {
        portal = portal.parentElement;
      }
      if (portal.parentElement !== document.body) return;
      portalRef.current = portal;
      if (typeof portal.style !== 'undefined') {
        portal.style.zIndex = String(zIndex);
      }
      const animationDiv = portal.firstElementChild;
      if (animationDiv && typeof animationDiv.style !== 'undefined') {
        animationDiv.style.zIndex = String(zIndex);
        appliedRef.current = animationDiv;
      }
    };
    const t = setTimeout(apply, 50);
    return () => {
      clearTimeout(t);
      if (appliedRef.current) {
        appliedRef.current.style.zIndex = String(DEFAULT_MODAL_Z);
        appliedRef.current = null;
      }
      if (portalRef.current) {
        portalRef.current.style.zIndex = '';
        portalRef.current = null;
      }
    };
  }, [visible, zIndex, overlayRef]);
}
