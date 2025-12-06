/**
 * ConstraintsTimeline
 * Horizontal ribbon showing weekly schedule constraints above PlannerWeek
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Clock, Moon } from 'lucide-react';
import { useConstraintsStore } from '../../state/useConstraintsStore';
import { DailyConstraint } from '../../helpers/mergeConstraints';

interface ConstraintsTimelineProps {
  weekStart: Date;
  childIds?: string[];
  familyId?: string;
  onDayClick?: (date: string, constraint: DailyConstraint) => void;
}

export default function ConstraintsTimeline({
  weekStart,
  childIds,
  familyId,
  onDayClick,
}: ConstraintsTimelineProps) {
  const { weekConstraints, loading, fetchConstraints } = useConstraintsStore();

  // Fetch constraints when weekStart or childIds change
  React.useEffect(() => {
    if (weekStart && familyId) {
      fetchConstraints(weekStart, childIds, familyId);
    }
  }, [weekStart, childIds, familyId, fetchConstraints]);

  // Group constraints by date (handle multiple children)
  const constraintsByDate = useMemo(() => {
    const grouped: { [date: string]: DailyConstraint[] } = {};
    
    weekConstraints.forEach(constraint => {
      if (!grouped[constraint.date]) {
        grouped[constraint.date] = [];
      }
      grouped[constraint.date].push(constraint);
    });
    
    return grouped;
  }, [weekConstraints]);

  // Generate week days
  const weekDays = useMemo(() => {
    const days: Array<{ date: Date; dateStr: string; dayName: string }> = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dateStr = formatDate(date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      days.push({ date, dateStr, dayName });
    }
    return days;
  }, [weekStart]);

  // Get constraint for a date (prioritize child-specific, fall back to family-level)
  const getConstraintForDate = (dateStr: string): DailyConstraint | null => {
    const constraints = constraintsByDate[dateStr] || [];
    
    // If childIds provided, prefer child-specific constraints
    if (childIds && childIds.length > 0) {
      // Find constraint for first child (or combine if multiple)
      const childConstraint = constraints.find(c => 
        c.child_id && childIds.includes(c.child_id)
      );
      if (childConstraint) return childConstraint;
    }
    
    // Fall back to family-level constraint
    const familyConstraint = constraints.find(c => !c.child_id);
    return familyConstraint || null;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading constraints...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.timeline}>
        {weekDays.map(({ date, dateStr, dayName }) => {
          const constraint = getConstraintForDate(dateStr);
          const status = constraint?.status || 'teach';
          const hasOverride = !!(constraint?.start_override || constraint?.end_override);
          
          return (
            <DayPill
              key={dateStr}
              dateStr={dateStr}
              dayName={dayName}
              constraint={constraint}
              status={status}
              hasOverride={hasOverride}
              onPress={() => {
                if (onDayClick && constraint) {
                  onDayClick(dateStr, constraint);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

interface DayPillProps {
  dateStr: string;
  dayName: string;
  constraint: DailyConstraint | null;
  status: 'off' | 'partial' | 'teach';
  hasOverride: boolean;
  onPress?: () => void;
}

function DayPill({
  dateStr,
  dayName,
  constraint,
  status,
  hasOverride,
  onPress,
}: DayPillProps) {
  const [showTooltip, setShowTooltip] = React.useState(false);
  
  const statusColors = {
    off: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
    partial: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
    teach: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  };
  
  const colors = statusColors[status];
  
  const getOverrideIcon = () => {
    if (!constraint) return null;
    
    if (constraint.reason === 'late_start' || constraint.reason === 'early_end') {
      return <Clock size={12} color={colors.text} />;
    }
    if (constraint.reason === 'shorter_day' || constraint.reason === 'custom_hours') {
      return <Moon size={12} color={colors.text} />;
    }
    
    return null;
  };
  
  const getTooltipText = (): string => {
    if (!constraint) return `${dayName}\nNormal day`;
    
    let text = `${dayName}\n`;
    
    if (constraint.reason) {
      const reasonLabels: { [key: string]: string } = {
        vacation: 'Vacation',
        no_school: 'No School',
        late_start: 'Late Start',
        early_end: 'Early End',
        shorter_day: 'Shorter Day',
        custom_hours: 'Custom Hours',
      };
      text += reasonLabels[constraint.reason] || constraint.reason;
    } else {
      text += status === 'off' ? 'No School' : status === 'partial' ? 'Partial Day' : 'Normal Day';
    }
    
    if (constraint.start_override || constraint.end_override) {
      text += '\n';
      if (constraint.start_override) {
        text += `Start: ${constraint.start_override}`;
      }
      if (constraint.end_override) {
        if (constraint.start_override) text += ' | ';
        text += `End: ${constraint.end_override}`;
      }
    }
    
    return text;
  };
  
  return (
    <View style={styles.pillWrapper}>
      <TouchableOpacity
        style={[
          styles.pill,
          {
            backgroundColor: colors.bg,
            borderColor: colors.border,
          },
        ]}
        onPress={onPress}
        onMouseEnter={() => Platform.OS === 'web' && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        activeOpacity={0.7}
      >
        <Text style={[styles.dayName, { color: colors.text }]}>{dayName}</Text>
        {hasOverride && (
          <View style={styles.iconContainer}>
            {getOverrideIcon()}
          </View>
        )}
      </TouchableOpacity>
      
      {showTooltip && Platform.OS === 'web' && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{getTooltipText()}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  loadingText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  timeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  pillWrapper: {
    flex: 1,
    position: 'relative',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 36,
    gap: 4,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }),
  },
  dayName: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  iconContainer: {
    marginLeft: 2,
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: [{ translateX: -50 }],
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#1F2937',
    borderRadius: 6,
    minWidth: 120,
    zIndex: 1000,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    }),
  },
  tooltipText: {
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 16,
  },
});

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

