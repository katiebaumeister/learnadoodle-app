import { Platform, StyleSheet } from 'react-native';

export const CREATE_MODAL_MAX_WIDTH = 740;
export const CREATE_EVENT_MODAL_MAX_WIDTH = 880;
export const CREATE_ASSIGNMENT_MODAL_MAX_WIDTH = 1320;
export const CREATE_ASSIGNMENT_MODAL_HEIGHT = 820;
export const FG = '#111827';
export const MUTED = '#6b7280';
export const PLACEHOLDER = '#94A3B8';
export const BORDER = '#e5e7eb';
export const SUB = '#6b7280';
export const ACCENT = '#9ECFFB';
export const ACCENT_TEXT = '#6BB3E8';
export const ACCENT_CHIP_BORDER = '#9ECFFB';
export const ACCENT_CHIP_BG = 'rgba(158, 207, 251, 0.25)';
export const ACCENT_SOFT_BG = 'rgba(158, 207, 251, 0.12)';
export const ACCENT_LIST_ACTIVE_BG = 'rgba(158, 207, 251, 0.18)';

export const createModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrap: {
    width: '100%',
    maxWidth: CREATE_MODAL_MAX_WIDTH,
  },
  compactShell: {
    ...(Platform.OS === 'web'
      ? {
          height: 'auto',
          maxHeight: '92vh',
          minHeight: 392,
          borderRadius: 28,
          boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)',
        }
      : {
          height: 'auto',
          maxHeight: '88%',
          minHeight: 392,
        }),
    overflow: 'hidden',
  },
  compactTitleRow: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  shellBody: {
    paddingTop: 0,
    paddingBottom: 8,
  },
  contentContainer: {
    paddingBottom: 4,
  },
  formGroup: {
    marginBottom: 14,
  },
  assignmentFormRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    width: '100%',
    gap: 24,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  assignmentFormColumnMain: {
    flex: 1,
    flexBasis: 320,
    flexGrow: 1,
    minWidth: 280,
    maxWidth: '100%',
    minHeight: 0,
    gap: 16,
    alignSelf: 'stretch',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  assignmentFormColumnSide: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 260,
    width: 260,
    maxWidth: '100%',
    minHeight: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  assignmentSidePanel: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }),
  },
  assignmentContentPanel: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  assignmentContentPanelMain: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    flex: 1,
    flexGrow: 1,
    minHeight: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  assignmentContentPanelScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      overflowX: 'hidden',
    }),
  },
  assignmentContentPanelScrollInner: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 0,
  },
  assignmentAttachPanel: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexShrink: 0,
    flexGrow: 0,
    alignSelf: 'stretch',
  },
  assignmentInstructionsArea: {
    minHeight: 140,
  },
  assignmentModalShell: {
    ...(Platform.OS === 'web'
      ? {
          height: CREATE_ASSIGNMENT_MODAL_HEIGHT,
          minHeight: CREATE_ASSIGNMENT_MODAL_HEIGHT,
          maxHeight: CREATE_ASSIGNMENT_MODAL_HEIGHT,
          borderRadius: 28,
          boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)',
        }
      : {
          height: '88%',
          maxHeight: '88%',
          minHeight: CREATE_ASSIGNMENT_MODAL_HEIGHT,
        }),
    overflow: 'hidden',
  },
  assignmentSideFields: {
    gap: 16,
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
    }),
  },
  assignmentPanelFormGroup: {
    marginBottom: 12,
  },
  webInstructionsEditorWrap: {
    width: '100%',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  assignmentModalBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: SUB,
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  required: {
    color: '#ef4444',
  },
  fieldInput: {
    fontSize: 16,
    fontWeight: '400',
    color: FG,
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
    }),
  },
  fieldInputError: {
    borderBottomColor: '#ef4444',
  },
  errorTextSmall: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  fieldHint: {
    color: PLACEHOLDER,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  validationBannerContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  validationBannerText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  dropdownOption: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  dropdownOptionActive: {
    backgroundColor: ACCENT_CHIP_BG,
    borderColor: ACCENT_CHIP_BORDER,
  },
  dropdownOptionText: {
    fontSize: 14,
    color: FG,
    fontWeight: '500',
  },
  dropdownOptionTextActive: {
    color: ACCENT_TEXT,
  },
  assigneePill: {
    minHeight: 36,
  },
  assigneePillText: {
    fontSize: 14,
  },
  assigneePillTextActive: {
    color: ACCENT_TEXT,
  },
  accordionContent: {
    marginTop: 12,
    paddingTop: 8,
  },
  notesField: {
    marginBottom: 0,
  },
  notesTextArea: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    fontSize: 14,
    color: FG,
    minHeight: 140,
    textAlignVertical: 'top',
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
      overflow: 'hidden',
    }),
  },
  notesPlainInput: {
    minHeight: 140,
    textAlignVertical: 'top',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
    minHeight: 40,
  },
  chipText: {
    color: FG,
    fontSize: 14,
    fontWeight: '500',
  },
  scheduleColumn: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  /** Same width as one column in the 4-field event row (start/end date + start/end time). */
  scheduleColumnEventDate: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    minWidth: 0,
    ...(Platform.OS === 'web'
      ? {
          width: 'calc((100% - 36px) / 4)',
          maxWidth: 'calc((100% - 36px) / 4)',
        }
      : {
          width: '48%',
          maxWidth: '48%',
        }),
  },
  scheduleColumnCompact: {
    alignSelf: 'stretch',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  dateTimeInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-end',
    width: '100%',
  },
  scheduleDateChip: {
    width: '100%',
    minHeight: 40,
    height: 40,
    paddingHorizontal: 10,
    gap: 6,
  },
  scheduleDateChipCompact: {
    width: '100%',
  },
  scheduleDateChipLabel: {
    flex: 1,
    paddingHorizontal: 6,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleDateChipText: {
    color: FG,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    ...(Platform.OS === 'web' && { whiteSpace: 'nowrap' }),
  },
  scheduleDateChipLabelCompact: {
    flex: 1,
    minWidth: 0,
  },
  scheduleDateChipTextCompact: {
    ...(Platform.OS === 'web' && { whiteSpace: 'nowrap' }),
  },
  scheduleTimeInputWrap: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  scheduleTrailingColumn: {
    flexShrink: 0,
    alignSelf: 'flex-end',
    minWidth: 72,
  },
  recurringSectionContent: {
    marginTop: 4,
    paddingTop: 0,
  },
  repeatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    alignItems: 'flex-start',
    ...(Platform.OS === 'web' && {
      display: 'grid',
      gridTemplateColumns: 'minmax(150px, 1fr) minmax(250px, 1.7fr) minmax(170px, 1fr) minmax(150px, 1.2fr)',
      gap: 24,
      alignItems: 'start',
    }),
  },
  repeatGroup: {
    minWidth: 180,
    marginBottom: 8,
  },
  repeatGroupPattern: {
    flex: 1,
    minWidth: 170,
  },
  repeatGroupDays: {
    flex: 1.7,
    minWidth: 250,
  },
  repeatGroupEnds: {
    flex: 1,
    minWidth: 170,
  },
  repeatGroupEndInput: {
    flex: 1,
    minWidth: 140,
    width: '100%',
  },
  repeatDisabledHintWrap: {
    minHeight: 36,
    justifyContent: 'center',
  },
  recurrenceGroupLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldHelpText: {
    color: PLACEHOLDER,
    fontSize: 12,
  },
  recurrenceEndInput: {
    width: '100%',
    minHeight: 40,
    height: 40,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: FG,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
      boxSizing: 'border-box',
    }),
  },
  recurrenceEndInputError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  recurrenceEndDateChip: {
    width: '100%',
    minHeight: 40,
    height: 40,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  recurrenceEndDateChipError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  inlineSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    minHeight: 44,
  },
  selectText: {
    fontSize: 14,
    color: FG,
    flex: 1,
  },
  selectPlaceholder: {
    color: PLACEHOLDER,
  },
  studentResponseSelect: {
    alignSelf: 'flex-start',
    width: 176,
    maxWidth: '100%',
    gap: 6,
    paddingRight: 10,
  },
  studentResponseSelectText: {
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' && {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }),
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    letterSpacing: 0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.35)',
    marginVertical: 18,
  },
  settingsSectionPanel: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    }),
  },
  radioGroup: {
    gap: 8,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: ACCENT_TEXT,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT_TEXT,
  },
  radioLabel: {
    fontSize: 14,
    color: FG,
    fontWeight: '500',
  },
  attachActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attachActionButton: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  attachActionButtonActive: {
    backgroundColor: ACCENT_CHIP_BG,
    borderColor: ACCENT_CHIP_BORDER,
  },
  addNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderColor: ACCENT_CHIP_BORDER,
  },
  addNewButtonText: {
    fontSize: 14,
    color: ACCENT_TEXT,
    fontWeight: '500',
  },
  dropdownListItemActive: {
    backgroundColor: ACCENT_LIST_ACTIVE_BG,
  },
  attachActionText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  attachedResourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
  },
  attachedResourceText: {
    flex: 1,
    fontSize: 14,
    color: FG,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxBoxChecked: {
    borderColor: ACCENT_CHIP_BORDER,
    backgroundColor: ACCENT_SOFT_BG,
  },
  checkboxMark: {
    fontSize: 12,
    color: ACCENT_TEXT,
    fontWeight: '700',
  },
});
