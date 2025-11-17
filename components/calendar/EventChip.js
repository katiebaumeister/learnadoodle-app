import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react';

export default function EventChip({ ev, compact = false, fullWidth = false, onPress, onRightClick, onComplete, showCheckmark = true, hideTime = false }) {
  const color = ev.color ?? 'teal';

  const getColorStyle = (currentColor) => {
    switch (currentColor) {
      case 'teal':
        return { backgroundColor: 'rgba(20, 184, 166, 0.25)', borderColor: 'rgba(20, 184, 166, 0.3)' };
      case 'violet':
        return { backgroundColor: 'rgba(139, 92, 246, 0.25)', borderColor: 'rgba(139, 92, 246, 0.3)' };
      case 'amber':
        return { backgroundColor: 'rgba(245, 158, 11, 0.25)', borderColor: 'rgba(245, 158, 11, 0.3)' };
      case 'sky':
        return { backgroundColor: 'rgba(14, 165, 233, 0.25)', borderColor: 'rgba(14, 165, 233, 0.3)' };
      default:
        return { backgroundColor: 'rgba(20, 184, 166, 0.25)', borderColor: 'rgba(20, 184, 166, 0.3)' };
    }
  };

  const getTextColor = (currentColor) => {
    switch (currentColor) {
      case 'teal':
        return '#0d9488'; // Darker teal
      case 'violet':
        return '#7c3aed'; // Darker violet
      case 'amber':
        return '#d97706'; // Darker amber/orange
      case 'sky':
        return '#0284c7'; // Darker sky blue
      default:
        return '#0d9488'; // Default to darker teal
    }
  };

  // Format time from various possible formats
  const formatTime = () => {
    const timeStr = ev.time || ev.start_local || ev.data?.start_local || ev.data?.time;
    if (!timeStr) return null;
    
    // Handle formats like "9:00", "09:00", "9:00 AM", "19:00"
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) return null;
    
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    
    // If already in 12-hour format (has AM/PM), return as-is but simplified
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      return minutes === '00' ? `${hours} ${timeStr.includes('AM') ? 'AM' : 'PM'}` : `${hours}:${minutes}`;
    }
    
    // Convert 24-hour to 12-hour format
    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours > 12) {
      hours -= 12;
    } else if (hours === 0) {
      hours = 12;
    }
    
    return minutes === '00' ? `${hours} ${period}` : `${hours}:${minutes}`;
  };

  const displayTime = formatTime();

  const renderWrapper = (style, children) => {
    if (onPress || onRightClick) {
      return (
        <TouchableOpacity 
          style={style} 
          activeOpacity={0.85} 
          onPress={onPress}
          {...(typeof window !== 'undefined' && onRightClick && {
            onMouseDown: (e) => {
              if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                onRightClick(ev, e);
              }
            },
            onContextMenu: (e) => {
              e.preventDefault();
              e.stopPropagation();
              onRightClick(ev, e);
            }
          })}
        >
          {children}
        </TouchableOpacity>
      );
    }
    return <View style={style}>{children}</View>;
  };

  if (compact && fullWidth) {
    const isDone = ev.status === 'done';
    const style = {
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 4,
      paddingVertical: 1,
      width: '100%',
      ...getColorStyle(color),
      opacity: isDone ? 0.6 : 1,
    };

    const handleCheckmarkPress = (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.nativeEvent && e.nativeEvent.stopPropagation) e.nativeEvent.stopPropagation();
      if (onComplete && !isDone) {
        console.log('[EventChip] Checkmark clicked for event:', ev.id, ev.title);
        onComplete(ev);
      }
    };

    const content = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 }}>
        {showCheckmark && onComplete && (
          <TouchableOpacity
            data-checkmark="true"
            onPress={handleCheckmarkPress}
            onPressIn={(e) => {
              if (e && e.stopPropagation) e.stopPropagation();
            }}
            style={{ padding: 1, zIndex: 10 }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
          >
            {isDone ? (
              <CheckCircle2 size={10} color="#10b981" />
            ) : (
              <Circle size={10} color="rgba(255,255,255,0.6)" />
            )}
          </TouchableOpacity>
        )}
        <Text
          style={{
            fontSize: 9,
            color: getTextColor(color),
            fontWeight: '500',
            textAlign: 'left',
            textDecorationLine: isDone ? 'line-through' : 'none',
            flex: 1,
            flexShrink: 1,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {ev.title || 'Untitled Event'}
        </Text>
        {displayTime && !hideTime && (
          <Text
            style={{
              fontSize: 9,
              color: getTextColor(color),
              fontWeight: '400',
              opacity: 0.8,
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            {displayTime}
          </Text>
        )}
      </View>
    );

    return renderWrapper(style, content);
  }

  if (compact) {
    const isDone = ev.status === 'done';
    const style = {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 2,
      maxWidth: '100%',
      ...getColorStyle(color),
      opacity: isDone ? 0.6 : 1,
    };

    const handleCheckmarkPress = (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.nativeEvent && e.nativeEvent.stopPropagation) e.nativeEvent.stopPropagation();
      if (onComplete && !isDone) {
        console.log('[EventChip] Checkmark clicked for event:', ev.id, ev.title);
        onComplete(ev);
      }
    };

    const content = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
        {showCheckmark && onComplete && (
          <TouchableOpacity
            data-checkmark="true"
            onPress={handleCheckmarkPress}
            onPressIn={(e) => {
              if (e && e.stopPropagation) e.stopPropagation();
            }}
            style={{ padding: 2, zIndex: 10 }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
          >
            {isDone ? (
              <CheckCircle2 size={12} color="#10b981" />
            ) : (
              <Circle size={12} color="rgba(255,255,255,0.6)" />
            )}
          </TouchableOpacity>
        )}
        <Text
          style={{
            fontSize: 10,
            color: getTextColor(color),
            fontWeight: '500',
            textAlign: 'left',
            textDecorationLine: isDone ? 'line-through' : 'none',
            flex: 1,
            flexShrink: 1,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {ev.title || 'Untitled Event'}
        </Text>
        {displayTime && !hideTime && (
          <Text
            style={{
              fontSize: 10,
              color: getTextColor(color),
              fontWeight: '400',
              opacity: 0.8,
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            {displayTime}
          </Text>
        )}
      </View>
    );

    return renderWrapper(style, content);
  }

  const isDone = ev.status === 'done';
  const style = {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    ...getColorStyle(color),
    opacity: isDone ? 0.6 : 1,
  };

  const handleCheckmarkPress = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.nativeEvent && e.nativeEvent.stopPropagation) e.nativeEvent.stopPropagation();
    if (onComplete && !isDone) {
      console.log('[EventChip] Checkmark clicked for event:', ev.id, ev.title);
      onComplete(ev);
    }
  };

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      {showCheckmark && onComplete && (
        <TouchableOpacity
          data-checkmark="true"
          onPress={handleCheckmarkPress}
          onPressIn={(e) => {
            if (e && e.stopPropagation) e.stopPropagation();
          }}
          style={{ padding: 2, zIndex: 10 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          {isDone ? (
            <CheckCircle2 size={16} color="#10b981" />
          ) : (
            <Circle size={16} color="rgba(255,255,255,0.6)" />
          )}
        </TouchableOpacity>
      )}
      <View style={{ flex: 1, flexShrink: 1 }}>
        <Text 
          style={{ 
            fontSize: 11, 
            color: getTextColor(color), 
            textAlign: 'left',
            textDecorationLine: isDone ? 'line-through' : 'none'
          }} 
          numberOfLines={1}
        >
          {ev.title || 'Untitled Event'}
        </Text>
      </View>
      {displayTime && !hideTime && (
        <Text
          style={{
            fontSize: 11,
            color: getTextColor(color),
            fontWeight: '400',
            opacity: 0.8,
            marginLeft: 4,
            flexShrink: 0,
          }}
        >
          {displayTime}
        </Text>
      )}
    </View>
  );

  return renderWrapper(style, content);
}
