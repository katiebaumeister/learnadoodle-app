/**
 * Learnadoodle modal system — import from here for new modals.
 *
 * Patterns:
 * - Panel: side slide-out (Create, Messages) — NOT AppModalOverlay
 * - Modal: centered creation/editing — AppModalOverlay + AppModalShell
 * - Fullscreen builder: size={MODAL_SIZE.fullscreen} — New Event, Plan Year, etc.
 *
 * Rules:
 * - One scroll area only (shell body)
 * - Sticky footer via ModalFooter
 * - Label above input via ModalField
 * - Sections via ModalSection + dividers
 * - Advanced fields in ModalAdvancedSection (collapsed by default)
 * - ✨ Generate in shell header via onGenerate
 */

export { default as AppModalShell } from './AppModalShell';
export { default as AppModalOverlay } from './AppModalOverlay';
export { ModalFooter } from './ModalFooter';
export { default as ModalSection, ModalSectionDivider } from './ModalSection';
export { default as ModalField } from './ModalField';
export { default as ModalAdvancedSection } from './ModalAdvancedSection';
export { MODAL_SIZE, MODAL_SIZE_STYLES, MODAL_VISUAL, modalSystemStyles } from './modalSystem';
export { modalFieldStyles } from './modalFieldStyles';
