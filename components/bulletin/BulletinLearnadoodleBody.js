/**
 * Formatted bulletin post body (bullets + inline bold/italic/underline).
 */

import React, { useMemo } from 'react';
import { StyleSheet, Platform } from 'react-native';
import FormattedInstructionText from '../create/shared/FormattedInstructionText';
import { normalizeSubjectGettingStartedBulletinBody } from '../../lib/subjectGettingStartedBulletin';

export default function BulletinLearnadoodleBody({ body, textStyle = null }) {
  const displayBody = useMemo(
    () => normalizeSubjectGettingStartedBulletinBody(body),
    [body],
  );

  return (
    <FormattedInstructionText
      text={displayBody}
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
