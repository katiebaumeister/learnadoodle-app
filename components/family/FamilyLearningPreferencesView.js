import React from 'react';
import { View, Text } from 'react-native';
import PlannerSettingsContent from '../settings/PlannerSettingsContent';
import { familyStyles } from './familyDesignTokens';

export default function FamilyLearningPreferencesView({
  familyId,
  preloadedPlannerSettings = null,
  readOnly = false,
}) {
  return (
    <View style={familyStyles.pageContent}>
      <View style={[familyStyles.card, localStyles.plannerCard]}>
        <Text style={familyStyles.cardTitle}>Scheduling defaults</Text>
        <PlannerSettingsContent
          familyId={familyId}
          initialData={preloadedPlannerSettings}
          readOnly={readOnly}
          embeddedInFamily
          hidePageTitle
        />
      </View>
    </View>
  );
}

const localStyles = {
  plannerCard: {
    paddingBottom: 8,
    overflow: 'hidden',
  },
};
