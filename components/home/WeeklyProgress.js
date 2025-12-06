import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ArrowRight } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function WeeklyProgress({ 
  children = [],
  progress = {},
  progressLoading = false,
  interpretiveLine,
  onViewFull
}) {
  if (children.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        <View style={styles.leftSection}>
          <Text style={styles.sectionTitle}>Weekly progress</Text>
          {progressLoading ? (
            <ActivityIndicator size="small" color={colors.muted} style={styles.loader} />
          ) : (
            <>
              <View style={styles.progressTextContainer}>
                {children.map((child, index) => {
                  const p = progress[child.id] || { completed: 0, total: 0 };
                  const name = child.first_name || child.name || 'Child';
                  return (
                    <React.Fragment key={child.id}>
                      <Text style={styles.progressText}>
                        {name}: {p.completed}/{p.total}
                      </Text>
                      {index < children.length - 1 && (
                        <Text style={styles.separator}> · </Text>
                      )}
                    </React.Fragment>
                  );
                })}
              </View>
              {interpretiveLine && (
                <Text style={styles.interpretiveLine}>{interpretiveLine}</Text>
              )}
            </>
          )}
        </View>
        {onViewFull && !progressLoading && (
          <TouchableOpacity
            style={styles.viewLink}
            onPress={onViewFull}
          >
            <Text style={styles.viewLinkText}>View full insights</Text>
            <ArrowRight size={12} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  leftSection: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  loader: {
    marginTop: 8,
  },
  progressTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
  },
  progressText: {
    fontSize: 12,
    color: colors.muted,
  },
  separator: {
    fontSize: 12,
    color: colors.muted,
    marginHorizontal: 4,
  },
  interpretiveLine: {
    fontSize: 12,
    color: '#94a3b8', // slate-400
    marginTop: 4,
    lineHeight: 18,
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  viewLinkText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
});

