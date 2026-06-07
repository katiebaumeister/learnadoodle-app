import React from 'react';
import { View, Text } from 'react-native';
import { modalSystemStyles } from './modalSystem';

export function ModalSectionDivider() {
  return <View style={modalSystemStyles.divider} />;
}

export default function ModalSection({ title, children, showDividerAfter = true }) {
  return (
    <View style={modalSystemStyles.sectionBlock}>
      {title ? <Text style={modalSystemStyles.sectionLabel}>{title}</Text> : null}
      {children}
      {showDividerAfter ? <ModalSectionDivider /> : null}
    </View>
  );
}
