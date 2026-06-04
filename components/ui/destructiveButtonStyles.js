import { Platform, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export const destructiveIconColor = colors.redBold;

export const destructiveButtonStyles = StyleSheet.create({
  button: {
    minHeight: 50,
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.redSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  buttonCompact: {
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.redSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  buttonDisabled: {
    backgroundColor: colors.redSoft,
    opacity: 0.65,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  buttonText: {
    color: colors.redBold,
    fontWeight: '700',
    fontSize: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  buttonTextCompact: {
    color: colors.redBold,
    fontWeight: '700',
    fontSize: 15,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  buttonTextDisabled: {
    opacity: 0.8,
  },
});
