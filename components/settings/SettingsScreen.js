import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import FamilyPanel from './FamilyPanel';
import AppContainer from '../ui/AppContainer';

export default function SettingsScreen({ user, family = null, familyId = null, onFamilyUpdate = null, profile = null }) {
  return (
    <AppContainer fullWidth noPadding>
      <View style={styles.container}>
        <FamilyPanel user={user} family={family} familyId={familyId} onFamilyUpdate={onFamilyUpdate} profile={profile} />
      </View>
    </AppContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    flexDirection: 'column',
    minHeight: Platform.OS === 'web' ? 'calc(100vh - 32px)' : undefined,
  },
});
