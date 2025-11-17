import React, { useState } from 'react';
import { TouchableOpacity, Text, View, Alert } from 'react-native';
import ScheduleRulesManager from './ScheduleRulesManager';

const ScheduleRulesButton = ({ familyId, children, style }) => {
  const [showRulesManager, setShowRulesManager] = useState(false);

  return (
    <>
      <TouchableOpacity 
        style={[styles.button, style]}
        onPress={() => setShowRulesManager(true)}
      >
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📅</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Schedule Rules</Text>
          <Text style={styles.subtitle}>Set teaching hours & constraints</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <ScheduleRulesManager
        visible={showRulesManager}
        onClose={() => setShowRulesManager(false)}
        familyId={familyId}
        children={children}
      />
    </>
  );
};

const styles = {
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  arrow: {
    fontSize: 18,
    color: '#9ca3af',
    marginLeft: 8,
  },
};

export default ScheduleRulesButton;
