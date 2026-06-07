import React from 'react';
import { View, Text } from 'react-native';
import { modalSystemStyles } from './modalSystem';

export default function ModalField({ label, required = false, children }) {
  return (
    <View style={modalSystemStyles.field}>
      {label ? (
        <Text style={modalSystemStyles.fieldLabel}>
          {label}
          {required ? <Text style={modalSystemStyles.fieldRequired}> *</Text> : null}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
