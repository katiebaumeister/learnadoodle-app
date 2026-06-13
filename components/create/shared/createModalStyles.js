import { Platform, StyleSheet } from 'react-native';

export const CREATE_MODAL_MAX_WIDTH = 740;
export const CREATE_EVENT_MODAL_MAX_WIDTH = 880;
export const CREATE_ASSIGNMENT_MODAL_MAX_WIDTH = 820;
export const FG = '#111827';
export const MUTED = '#6b7280';
export const PLACEHOLDER = '#94A3B8';
export const BORDER = '#e5e7eb';
export const SUB = '#6b7280';
export const ACCENT = '#9ECFFB';

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
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: FG,
    fontWeight: '500',
  },
  dropdownOptionTextActive: {
    color: '#1D4ED8',
  },
  assigneePill: {
    minHeight: 36,
  },
  assigneePillText: {
    fontSize: 14,
  },
  assigneePillTextActive: {
    color: '#1D4ED8',
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    fontSize: 14,
    color: FG,
    minHeight: 80,
    textAlignVertical: 'top',
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
    }),
  },
  notesPlainInput: {
    minHeight: 80,
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
  scheduleColumnCompact: {
    alignSelf: 'flex-start',
    flexGrow: 0,
    flexShrink: 0,
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
    width: 'auto',
    alignSelf: 'flex-start',
  },
  scheduleDateChipLabel: {
    flex: 1,
    paddingHorizontal: 6,
    minWidth: 0,
    alignItems: 'center',
  },
  scheduleDateChipLabelCompact: {
    flex: 0,
    flexShrink: 0,
    paddingHorizontal: 4,
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
    borderColor: '#2563EB',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
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
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  checkboxMark: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '700',
  },
});
