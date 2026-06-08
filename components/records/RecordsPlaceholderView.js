import React from 'react';
import { View, Text, Platform } from 'react-native';
import { familyStyles } from '../family/familyDesignTokens';

export default function RecordsPlaceholderView({ title, description }) {
  return (
    <View style={familyStyles.pageContent}>
      <View style={familyStyles.card}>
        <Text style={familyStyles.cardTitle}>{title}</Text>
        <Text style={familyStyles.bodyText}>{description}</Text>
      </View>
    </View>
  );
}
