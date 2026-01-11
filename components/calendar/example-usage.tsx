import React from "react";
import { View } from "react-native";
import { Sidebar, ErrorBoundary } from "./index";

const childrenList = [
  { id: "c1", name: "Max" },
  { id: "c2", name: "Lilly" },
];

export default function CalendarExample() {
  return (
    <View style={{ flexDirection: 'row', flex: 1 }}>
      <ErrorBoundary fallback={<View style={{ width: 280 }} />}>
        <Sidebar
          childrenList={childrenList}
          onOpenScheduling={() => 
}
