import React from "react";
import { View, Text, Switch } from "react-native";

export type Child = { id: string; name: string };
export type FiltersState = {
  family: boolean;
  children: Record<string, boolean>;
  holidaysUS: boolean;
  holidaysFR: boolean;
};

type Props = {
  childrenList: Child[];
  value: FiltersState;
  onChange: (next: FiltersState) => void;
};

function setChild(value: FiltersState, id: string, on: boolean): FiltersState {
  return { ...value, children: { ...value.children, [id]: on } };
}

export const Filters: React.FC<Props> = ({ childrenList, value, onChange }) => {
  return (
    <View style={{
      marginTop: 16,
      padding: 12,
      backgroundColor: '#ffffff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#e5e7eb'
    }}>
      <Text style={{
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8
      }}>
        Filters
      </Text>

      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8
      }}>
        <Text style={{ color: '#1f2937' }}>Family</Text>
        <Switch
          value={value.family}
          onValueChange={(v) => onChange({ ...value, family: v })}
        />
      </View>

      <Text style={{
        fontSize: 12,
        color: '#6b7280',
        marginTop: 4,
        marginBottom: 4
      }}>
        Children
      </Text>
      {childrenList.map((c) => (
        <View key={c.id} style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 4
        }}>
          <Text style={{ color: '#1f2937' }}>{c.name}</Text>
          <Switch
            value={!!value.children[c.id]}
            onValueChange={(v) => onChange(setChild(value, c.id, v))}
          />
        </View>
      ))}

      <Text style={{
        fontSize: 12,
        color: '#6b7280',
        marginTop: 12,
        marginBottom: 4
      }}>
        Holidays
      </Text>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8
      }}>
        <Text style={{ color: '#1f2937' }}>Holidays in United States</Text>
        <Switch
          value={value.holidaysUS}
          onValueChange={(v) => onChange({ ...value, holidaysUS: v })}
        />
      </View>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8
      }}>
        <Text style={{ color: '#1f2937' }}>Holidays in France</Text>
        <Switch
          value={value.holidaysFR}
          onValueChange={(v) => onChange({ ...value, holidaysFR: v })}
        />
      </View>
    </View>
  );
};
