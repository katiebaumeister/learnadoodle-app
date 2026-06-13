import { StyleSheet } from 'react-native';
import { MODAL_ACCENT, MODAL_ACCENT_TEXT } from './modalButtonStyles';

export const modalFieldStyles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B3345',
    marginBottom: 8,
  },
  required: {
    color: '#F08A8A',
  },
  input: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5EAF1',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#2E3850',
  },
  titleInput: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5EAF1',
    paddingHorizontal: 18,
    fontSize: 24,
    fontWeight: '800',
    color: '#1E2A3A',
  },
  helperBanner: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#F5F7FB',
    borderWidth: 1,
    borderColor: '#E7EBF2',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  helperBannerText: {
    fontSize: 14,
    color: '#6A768A',
    lineHeight: 20,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  chip: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8DEE9',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: '#EEF6FF',
    borderColor: '#66AEEE',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#667187',
  },
  chipTextSelected: {
    color: '#4E8DDE',
    fontWeight: '700',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 16,
  },
  col: {
    flex: 1,
  },
  secondaryActionPill: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: MODAL_ACCENT,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: MODAL_ACCENT_TEXT,
    fontSize: 13,
    fontWeight: '700',
  },
});

