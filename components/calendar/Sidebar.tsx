import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { addMonths } from "date-fns";
import { MiniMonth } from "./MiniMonth";
import { Filters, FiltersState, Child } from "./Filters";

type Props = {
  initialDate?: Date;
  onDateChange?: (d: Date) => void;
  onOpenScheduling?: () => void;
  childrenList: Child[];
  onFiltersChange?: (f: FiltersState) => void;
  initialFilters?: Partial<FiltersState>;
};

const defaultFilters: FiltersState = {
  family: true,
  children: {},
  holidaysUS: true,
  holidaysFR: false,
};

export const Sidebar: React.FC<Props> = ({
  initialDate = new Date(),
  onDateChange,
  onOpenScheduling,
  childrenList,
  onFiltersChange,
  initialFilters,
}) => {
  const [month, setMonth] = useState(new Date(initialDate));
  const [selected, setSelected] = useState<Date>(initialDate);
  const [filters, setFilters] = useState<FiltersState>({
    ...defaultFilters,
    ...(initialFilters ?? {}),
  });

  const safeOnDate = (d: Date) => {
    setSelected(d);
    onDateChange?.(d);
  };

  const safeOnMonth = (d: Date) => {
    // guard: don't mutate on render
    setMonth(d);
  };

  const handleFilters = (f: FiltersState) => {
    setFilters(f);
    onFiltersChange?.(f);
  };

  // Fixed left column styling
  return (
    <View style={{
      backgroundColor: '#ffffff',
      borderRightWidth: 1,
      borderRightColor: '#e5e7eb',
      width: 280,
      height: '100%'
    }}>
      <View style={{ padding: 12 }}>
        <MiniMonth
          month={month}
          selectedDate={selected}
          onChangeMonth={safeOnMonth}
          onSelectDate={safeOnDate}
        />

        <Pressable
          accessibilityRole="button"
          onPress={onOpenScheduling}
          style={{
            marginTop: 12,
            backgroundColor: '#111827',
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 12,
            alignItems: 'center'
          }}
        >
          <Text style={{
            color: '#ffffff',
            fontWeight: '500'
          }}>
            Scheduling
          </Text>
        </Pressable>

        <Filters
          childrenList={childrenList}
          value={filters}
          onChange={handleFilters}
        />

        {/* Optional: small footer */}
        <View style={{
          marginTop: 16,
          opacity: 0.6
        }}>
          <Text style={{
            fontSize: 11,
            color: '#6b7280'
          }}>
            {Platform.OS === "web" ? "Web" : "App"} • White theme • v1.0
          </Text>
        </View>
      </View>
    </View>
  );
};
