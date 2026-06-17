/**
 * Formatted bulletin post body (bullets + inline bold/italic/underline).
 */

import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import FormattedInstructionText from '../create/shared/FormattedInstructionText';

export default function BulletinLearnadoodleBody({ body, textStyle = null }) {
  return (
    <FormattedInstructionText
      text={body}
      style={textStyle || styles.bodyText}
      wrapStyle={styles.wrap}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'pre-wrap',
    }),
  },
});
