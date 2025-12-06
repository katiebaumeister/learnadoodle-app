/**
 * Skills Radar Chart Component
 * Displays skills as a radar/spider chart
 */
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../../theme/colors';

const { width } = Dimensions.get('window');
const CHART_SIZE = Math.min(width - 80, 300);
const CENTER = CHART_SIZE / 2;
const RADIUS = CHART_SIZE / 2 - 20;

export default function SkillsRadarChart({ skills }) {
  if (!skills || skills.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No skills data available</Text>
      </View>
    );
  }

  // Limit to top 8 skills for readability
  const displaySkills = skills.slice(0, 8);
  const angleStep = (2 * Math.PI) / displaySkills.length;

  // Calculate points for each skill
  const points = displaySkills.map((skill, index) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    const distance = (skill.level / 5) * RADIUS;
    const x = CENTER + distance * Math.cos(angle);
    const y = CENTER + distance * Math.sin(angle);
    return { x, y, skill: skill.skill, level: skill.level, angle };
  });

  // Create path for the polygon
  const pathData = points.map((p, i) => 
    i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
  ).join(' ') + ' Z';

  return (
    <View style={styles.container}>
      <Text style={styles.chartTitle}>Skill Levels</Text>
      
      <View style={styles.chartWrapper}>
        <View style={[styles.chart, { width: CHART_SIZE, height: CHART_SIZE }]}>
          {/* Grid circles */}
          {[1, 2, 3, 4, 5].map((level) => (
            <View
              key={level}
              style={[
                styles.gridCircle,
                {
                  width: (level / 5) * RADIUS * 2,
                  height: (level / 5) * RADIUS * 2,
                  borderRadius: (level / 5) * RADIUS,
                  borderColor: colors.border,
                },
              ]}
            />
          ))}

          {/* Grid lines */}
          {displaySkills.map((_, index) => {
            const angle = index * angleStep - Math.PI / 2;
            const x2 = CENTER + RADIUS * Math.cos(angle);
            const y2 = CENTER + RADIUS * Math.sin(angle);
            return (
              <View
                key={index}
                style={[
                  styles.gridLine,
                  {
                    left: CENTER,
                    top: CENTER,
                    width: RADIUS,
                    transform: [{ rotate: `${angle}rad` }],
                  },
                ]}
              />
            );
          })}

          {/* Skill points */}
          {points.map((point, index) => (
            <View
              key={`point-${index}`}
              style={[
                styles.skillPoint,
                {
                  left: point.x - 6,
                  top: point.y - 6,
                  backgroundColor: 
                    point.level >= 4
                      ? colors.greenBold
                      : point.level >= 3
                      ? colors.blueBold
                      : point.level >= 2
                      ? colors.orangeBold
                      : colors.redBold,
                },
              ]}
            />
          ))}

          {/* Skill labels */}
          {points.map((point, index) => {
            const labelAngle = point.angle;
            const labelRadius = RADIUS + 25;
            const labelX = CENTER + labelRadius * Math.cos(labelAngle);
            const labelY = CENTER + labelRadius * Math.sin(labelAngle);

            return (
              <View
                key={index}
                style={[
                  styles.labelContainer,
                  {
                    left: labelX - 40,
                    top: labelY - 10,
                  },
                ]}
              >
                <Text style={styles.labelText} numberOfLines={1}>
                  {point.skill.length > 15 ? point.skill.substring(0, 15) + '...' : point.skill}
                </Text>
                <View style={styles.labelLevel}>
                  <View
                    style={[
                      styles.labelDot,
                      {
                        backgroundColor:
                          point.level >= 4
                            ? colors.greenBold
                            : point.level >= 3
                            ? colors.blueBold
                            : point.level >= 2
                            ? colors.orangeBold
                            : colors.redBold,
                      },
                    ]}
                  />
                  <Text style={styles.labelLevelText}>{point.level.toFixed(1)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.greenBold }]} />
          <Text style={styles.legendText}>Advanced (4-5)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.blueBold }]} />
          <Text style={styles.legendText}>Proficient (3-4)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.orangeBold }]} />
          <Text style={styles.legendText}>Developing (2-3)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.redBold }]} />
          <Text style={styles.legendText}>Beginner (0-2)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 20,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCircle: {
    position: 'absolute',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  gridLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: colors.border,
    transformOrigin: 'left center',
  },
  skillPoint: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.card,
  },
  labelContainer: {
    position: 'absolute',
    width: 80,
    alignItems: 'center',
  },
  labelText: {
    fontSize: 10,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  labelLevel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  labelLevelText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: colors.muted,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    padding: 40,
  },
});

