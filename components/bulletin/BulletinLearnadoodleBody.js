/**
 * Formatted bulletin post body (bullets + inline bold/italic/underline).
 */

import React, { useMemo } from 'react';
import { StyleSheet, Platform } from 'react-native';
import FormattedInstructionText from '../create/shared/FormattedInstructionText';
import SubjectWelcomeBulletinBody from './SubjectWelcomeBulletinBody';
import HomeWelcomeBulletinBody from './HomeWelcomeBulletinBody';
import {
  normalizeSubjectGettingStartedBulletinBody,
  SUBJECT_GETTING_STARTED_SYSTEM_KIND,
} from '../../lib/subjectGettingStartedBulletin';
import { HOME_GETTING_STARTED_SYSTEM_KIND } from '../../lib/homeWelcomeBulletin';

export default function BulletinLearnadoodleBody({
  body,
  textStyle = null,
  systemKind = null,
  subjectName = null,
}) {
  if (systemKind === SUBJECT_GETTING_STARTED_SYSTEM_KIND) {
    return <SubjectWelcomeBulletinBody subjectName={subjectName} textStyle={textStyle} />;
  }

  if (systemKind === HOME_GETTING_STARTED_SYSTEM_KIND) {
    return <HomeWelcomeBulletinBody textStyle={textStyle} />;
  }

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
