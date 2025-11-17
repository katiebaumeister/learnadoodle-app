import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { addMonths, format, isSameMonth, isToday } from "date-fns";
import { buildMonthMatrix, sameDay } from "./dateUtils";

type MiniMonthProps = {
  month: Date;
  selectedDate?: Date | null;
  onChangeMonth: (d: Date) => void;
  onSelectDate: (d: Date) => void;
  weekStartsOn?: 0 | 1; // Sunday or Monday
};

export const MiniMonth: React.FC<MiniMonthProps> = ({
  month,
  selectedDate,
  onChangeMonth,
  onSelectDate,
  weekStartsOn = 0,
}) => {
  const matrix = useMemo(() => buildMonthMatrix(month, weekStartsOn), [month, weekStartsOn]);
  const weekLabels = weekStartsOn === 1
    ? ["M","T","W","T","F","S","S"]
    : ["S","M","T","W","T","F","S"];

  return (
    <View style={{
      padding: 12,
      backgroundColor: '#ffffff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#e5e7eb'
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChangeMonth(addMonths(month, -1))}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8
          }}
        >
          <Text style={{ fontSize: 20, color: '#374151' }}>‹</Text>
        </Pressable>
        <Text style={{
          fontSize: 16,
          fontWeight: '600',
          color: '#111827'
        }}>
          {format(month, "MMMM yyyy")}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChangeMonth(addMonths(month, 1))}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8
          }}
        >
          <Text style={{ fontSize: 20, color: '#374151' }}>›</Text>
        </Pressable>
      </View>

      {/* Week labels */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4
      }}>
        {weekLabels.map((d) => (
          <Text key={d} style={{
            width: 32,
            textAlign: 'center',
            fontSize: 12,
            color: '#6b7280'
          }}>
            {d}
          </Text>
        ))}
      </View>

      {/* Grid */}
      <View style={{ gap: 4 }}>
        {matrix.map((row, rIdx) => (
          <View key={rIdx} style={{
            flexDirection: 'row',
            justifyContent: 'space-between'
          }}>
            {row.map((day, cIdx) => {
              const inMonth = isSameMonth(day, month);
              const isSel = sameDay(day, selectedDate);
              const isTod = isToday(day);

              return (
                <Pressable
                  key={`${rIdx}-${cIdx}`}
                  onPress={() => onSelectDate(day)}
                  style={{
                    width: 32,
                    height: 32,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSel ? '#111827' : '#ffffff',
                    borderWidth: isTod && !isSel ? 1 : 0,
                    borderColor: isTod && !isSel ? '#d1d5db' : 'transparent'
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    color: isSel ? '#ffffff' : inMonth ? '#111827' : '#9ca3af'
                  }}>
                    {format(day, "d")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};
