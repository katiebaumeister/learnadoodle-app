import React, { useState } from 'react';
import { View } from 'react-native';
import CalendarHeader from './CalendarHeader';
import MonthGrid from './MonthGrid';
import { addMonths, startOfToday } from './utils/date';

export default function MonthCalendar({ events = [] }) {
  const [viewDate, setViewDate] = useState(startOfToday());
  const [selectedDate, setSelectedDate] = useState(null);

  const gotoPrev = () => setViewDate(d => addMonths(d, -1));
  const gotoNext = () => setViewDate(d => addMonths(d, 1));
  const gotoToday = () => setViewDate(startOfToday());

  return (
    <View style={{ flexDirection: 'column' }}>
      <View style={{ marginBottom: 16 }}>
        <CalendarHeader
          date={viewDate}
          onPrev={gotoPrev}
          onNext={gotoNext}
          onToday={gotoToday}
        />
      </View>
      <MonthGrid
        date={viewDate}
        events={events}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    </View>
  );
}
