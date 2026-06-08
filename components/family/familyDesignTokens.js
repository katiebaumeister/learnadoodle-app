import { Platform, StyleSheet } from 'react-native';

export const FAMILY_PAGE_PADDING = 24;
export const FAMILY_SECTION_GAP = 20;
export const FAMILY_CARD_GAP = 16;

export const familyCardStyle = {
  padding: 18,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(148, 163, 184, 0.24)',
  backgroundColor: '#FFFFFF',
};

export const familyStyles = StyleSheet.create({
  pageContent: {
    padding: FAMILY_PAGE_PADDING,
    gap: FAMILY_SECTION_GAP,
  },
  card: {
    ...familyCardStyle,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cardAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  labelCaps: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(15, 23, 42, 0.45)',
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(15, 23, 42, 0.62)',
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.55)',
  },
});
