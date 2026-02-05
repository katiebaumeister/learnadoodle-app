import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, shadows } from '../../theme/colors';
import { BookOpen, FlaskConical, Palette, Music, Dumbbell, Code, Globe, Calculator } from 'lucide-react';

// Avatar-based color mapping
const AVATAR_COLORS = {
  prof1: '#FDCE5D',  // From user: Fdce5d
  prof2: '#3F9B97',  // From user: 3f9b97
  prof3: '#5D433D',  // From user: 5d433d
  prof4: '#8763B9',  // From user: 8763b9
  prof5: '#12BDE1',  // From user: 12bde1
  prof6: '#55BD98',  // From user: 55bd98
  prof7: '#F0A76C',  // From user: F0a76c
  prof8: '#2F4B7C',  // From user: 2f4b7c
  prof9: '#BAD692',  // From user: Bad692
  prof10: '#F2608C', // From user: F2608c
};

// Helper function to convert hex to RGB for opacity calculations
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Helper function to lighten a color (for light variant)
function lightenColor(hex, percent = 40) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.min(255, rgb.r + (255 - rgb.r) * (percent / 100));
  const g = Math.min(255, rgb.g + (255 - rgb.g) * (percent / 100));
  const b = Math.min(255, rgb.b + (255 - rgb.b) * (percent / 100));
  
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

// Helper function to darken a color (for border)
function darkenColor(hex, percent = 20) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.max(0, rgb.r * (1 - percent / 100));
  const g = Math.max(0, rgb.g * (1 - percent / 100));
  const b = Math.max(0, rgb.b * (1 - percent / 100));
  
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

// Helper function to desaturate a color (reduce saturation)
function desaturateColor(hex, percent = 30) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  // Calculate luminance (grayscale value)
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  
  // Mix original color with grayscale based on desaturation percent
  const r = Math.round(rgb.r + (luminance - rgb.r) * (percent / 100));
  const g = Math.round(rgb.g + (luminance - rgb.g) * (percent / 100));
  const b = Math.round(rgb.b + (luminance - rgb.b) * (percent / 100));
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Get child colors based on avatar
function getChildColorsFromAvatar(avatar) {
  if (!avatar) {
    // Debug: log when avatar is missing
    if (typeof window !== 'undefined' && window.console && process.env.NODE_ENV === 'development') {
    }
    return {
      solid: '#E5E7EB',
      light: '#F3F4F6',
      border: '#D1D5DB',
      dot: '#9CA3AF',
    };
  }
  
  // Normalize avatar name (handle "prof1", "Prof1", "prof1.png", "prof1.PNG", etc.)
  // Also handle paths like "assets/prof1.png" or just "prof1"
  let avatarKey = String(avatar).toLowerCase().trim();
  
  // Remove file extension
  avatarKey = avatarKey.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
  
  // Remove path prefix if present (e.g., "assets/prof1" -> "prof1")
  avatarKey = avatarKey.replace(/^.*[\/\\]/, '');
  
  // Remove any leading/trailing whitespace
  avatarKey = avatarKey.trim();
  
  const baseColor = AVATAR_COLORS[avatarKey];
  
  if (!baseColor) {
    // Debug: log when avatar doesn't match
    if (typeof window !== 'undefined' && window.console && process.env.NODE_ENV === 'development') {
    }
    // Default if avatar not found
    return {
      solid: '#E5E7EB',
      light: '#F3F4F6',
      border: '#D1D5DB',
      dot: '#9CA3AF',
    };
  }
  
  // Desaturate the base color for a more muted appearance
  const desaturatedBase = desaturateColor(baseColor, 25);
  
  return {
    solid: desaturatedBase,
    light: lightenColor(desaturatedBase, 40),
    border: darkenColor(desaturatedBase, 20),
    dot: desaturatedBase,
  };
}

// Subject category detection
function getSubjectCategory(subjectName) {
  if (!subjectName) return 'other';
  const name = subjectName.toLowerCase();
  
  // Core academics
  if (name.includes('math') || name.includes('mathematics') || name.includes('algebra') || name.includes('geometry') || name.includes('calculus')) {
    return 'core';
  }
  if (name.includes('science') || name.includes('biology') || name.includes('chemistry') || name.includes('physics')) {
    return 'core';
  }
  if (name.includes('language') || name.includes('ela') || name.includes('english') || name.includes('reading') || name.includes('writing')) {
    return 'core';
  }
  if (name.includes('history') || name.includes('social studies') || name.includes('geography') || name.includes('government') || name.includes('economics')) {
    return 'core';
  }
  
  // Arts / Creative
  if (name.includes('art') || name.includes('drawing') || name.includes('painting')) {
    return 'creative';
  }
  if (name.includes('music') || name.includes('band') || name.includes('choir')) {
    return 'creative';
  }
  if (name.includes('drama') || name.includes('theater')) {
    return 'creative';
  }
  
  // Physical
  if (name.includes('physical') || name.includes('pe') || name.includes('fitness') || name.includes('sport') || name.includes('gym')) {
    return 'physical';
  }
  
  // Technology
  if (name.includes('technology') || name.includes('tech') || name.includes('coding') || name.includes('computer') || name.includes('programming')) {
    return 'creative'; // Treat tech as creative/elective
  }
  
  return 'other';
}

// Get subject icon
function getSubjectIcon(subjectName, iconColor = '#6B7280') {
  if (!subjectName) return null;
  const name = subjectName.toLowerCase();
  const iconSize = 10;
  
  if (name.includes('math') || name.includes('mathematics') || name.includes('algebra') || name.includes('geometry') || name.includes('calculus')) {
    return <Calculator size={iconSize} color={iconColor} />;
  }
  if (name.includes('science') || name.includes('biology') || name.includes('chemistry') || name.includes('physics')) {
    return <FlaskConical size={iconSize} color={iconColor} />;
  }
  if (name.includes('language') || name.includes('ela') || name.includes('english') || name.includes('reading') || name.includes('writing')) {
    return <BookOpen size={iconSize} color={iconColor} />;
  }
  if (name.includes('history') || name.includes('social studies') || name.includes('geography') || name.includes('government') || name.includes('economics')) {
    return <Globe size={iconSize} color={iconColor} />;
  }
  if (name.includes('art') || name.includes('drawing') || name.includes('painting')) {
    return <Palette size={iconSize} color={iconColor} />;
  }
  if (name.includes('music') || name.includes('band') || name.includes('choir')) {
    return <Music size={iconSize} color={iconColor} />;
  }
  if (name.includes('physical') || name.includes('pe') || name.includes('fitness') || name.includes('sport') || name.includes('gym')) {
    return <Dumbbell size={iconSize} color={iconColor} />;
  }
  if (name.includes('technology') || name.includes('tech') || name.includes('coding') || name.includes('computer') || name.includes('programming')) {
    return <Code size={iconSize} color={iconColor} />;
  }
  
  return null;
}

// Get child name from ID
function getChildName(childId, children) {
  if (!childId || !children || !Array.isArray(children)) return null;
  const child = children.find(c => c.id === childId);
  return child ? (child.first_name || child.name) : null;
}

// Get child avatar from ID
function getChildAvatar(childId, children) {
  if (!childId || !children || !Array.isArray(children)) return null;
  const child = children.find(c => c.id === childId);
  if (!child) return null;
  
  // Return avatar if it exists, otherwise return null
  const avatar = child.avatar;
  
  // Debug logging (remove in production)
  if (typeof window !== 'undefined' && window.console && process.env.NODE_ENV === 'development') {
    if (!avatar && child) {
    }
  }
  
  return avatar || null;
}

// Helper function to convert hex to RGBA with opacity
function hexToRgba(hex, opacity = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

// EventNoteBadge component removed - notes feature has been removed
// Keeping as empty component to avoid breaking existing code
function EventNoteBadge({ eventId, familyId }) {
  // Notes feature removed - return null
  return null;
}

// Get event colors based on child avatar - unified styling for all events
function getEventColors(ev, children, isBlackoutDay) {
  if (isBlackoutDay) {
    return {
      topBar: '#EF4444',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      whiteOverlay: 'rgba(255, 255, 255, 0.6)',
      border: '#EF4444',
      text: '#EF4444',
      dot: '#EF4444',
    };
  }
  
  const childAvatar = getChildAvatar(ev.child_id, children);
  
  // Debug logging
  if (typeof window !== 'undefined' && window.console && process.env.NODE_ENV === 'development') {
    if (!childAvatar) {
    }
  }
  
  const childColors = getChildColorsFromAvatar(childAvatar);
  
  // Use very light fill (10% opacity) of the base color
  // Keep vivid color for top bar and border only
  return {
    topBar: childColors.solid, // Vivid color for top bar
    backgroundColor: hexToRgba(childColors.solid, 0.1), // 10% opacity fill
    whiteOverlay: 'rgba(255, 255, 255, 0.6)', // White tint overlay for softness
    border: childColors.solid, // Vivid color for border (can be subtle)
    text: '#374151',
    dot: childColors.solid, // Vivid color for dot
  };
}

export default function DraggableEvent({
  ev,
  dayStartMin,
  dayEndMin,
  totalMin,
  isBlackoutDay = false,
  onChanged,
  onClick,
  onRightClick,
  children = [], // Array of child objects with id and first_name
  focusedChildId = null, // For focus mode - fade other children
  isWrapped = false, // If true, wrapper handles positioning
  familyId = null, // For note preview tooltip
}) {
  const ref = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  
  // Note preview functionality removed - notes feature has been removed

  const durMin = useMemo(() => {
    const s = new Date(ev.start_ts);
    const e = new Date(ev.end_ts);
    return Math.max(5, Math.round((e.getTime() - s.getTime()) / 60000));
  }, [ev.start_ts, ev.end_ts]);

  // Compute current top/height using start_local from RPC (family timezone)
  let sMin;
  if (ev.start_local) {
    const [hours, minutes] = ev.start_local.split(':').map(Number);
    sMin = hours * 60 + minutes;
  } else {
    const eventDate = new Date(ev.start_ts);
    const localHours = eventDate.getHours();
    const localMinutes = eventDate.getMinutes();
    sMin = localHours * 60 + localMinutes;
  }
  
  // Calculate top position based on start time
  let top = ((sMin - dayStartMin) / totalMin) * 100;
  
  // Clamp top position to visible range
  if (top < 0) {
    top = 0;
  }
  
  if (top >= 100) {
    return null;
  }

  const childName = getChildName(ev.child_id, children);
  const subjectName = ev.subject_name || 'Event';
  const category = getSubjectCategory(subjectName);
  const categoryLabel = category === 'core' ? 'Core Subject' : category === 'creative' ? 'Creative' : category === 'physical' ? 'Physical' : 'Other';
  // Show event title, fallback to subject name if no title
  const eventTitle = ev.title || subjectName;
  
  // Calculate height for compact single-line card style
  // Padding: 6px top + 6px bottom = 12px
  // Content height: 24px (icon/avatar circle)
  // Total: 12px + 24px = 36px minimum
  const contentHeight = 36; // Fixed height for compact card
  
  // Convert pixel height to percentage of column height
  // Column minHeight is 1440px for a full day (24 hours * 60px)
  // Scale based on actual totalMin vs full day (1440 minutes)
  const fullDayMinutes = 24 * 60; // 1440 minutes
  const columnHeightPx = 1440; // Base column height in pixels
  const scaledColumnHeight = (totalMin / fullDayMinutes) * columnHeightPx;
  const heightPercent = (contentHeight / scaledColumnHeight) * 100;
  
  // Ensure chip doesn't overflow bottom of column
  const bottom = top + heightPercent;
  if (bottom > 100) {
    top = Math.max(0, 100 - heightPercent);
  }
  
  const eventColors = getEventColors(ev, children, isBlackoutDay);
  
  // Get background color based on event type (matching filter colors)
  const getEventTypeBackgroundColor = () => {
    const eventType = (ev.event_type || ev.type || '').toLowerCase();
    switch (eventType) {
      case 'lesson':
        return '#E3F0FF'; // Soft Blue
      case 'activity':
        return '#EDE6FF'; // Lavender
      case 'assignment':
        return '#DFF7E3'; // Soft Green
      case 'schedule block':
        return '#FFE8D1'; // Soft Orange / Peach
      case 'appointment':
        return '#F2F4F7'; // Warm Gray
      default:
        return '#F2F4F7'; // Default Warm Gray
    }
  };
  
  // Focus mode: fade events not for focused child
  const isFocused = !focusedChildId || ev.child_id === focusedChildId;
  const opacity = isFocused ? 1 : 0.4;

  return (
    <><div
        ref={ref}
        onClick={(e) => {
          // Only handle click if not wrapped (wrapper handles drag)
          if (!isWrapped) {
            e.stopPropagation();
            if (onClick) {
              onClick(ev);
            }
          } else {
            // When wrapped, don't handle click - let wrapper handle it
            // This prevents click from interfering with drag
          }
        }}
        onMouseDown={(e) => {
          // When wrapped, don't interfere with wrapper's drag handling
          // Let the event bubble up to the wrapper - don't stop propagation
          if (isWrapped) {
            // Let the event bubble up to wrapper's onMouseDown handler
            // Don't prevent default or stop propagation
            return;
          }
          // Only handle right-click if not wrapped
          if (e.button === 2 && onRightClick) {
            e.preventDefault();
            e.stopPropagation();
            // Pass the native event for position access
            const nativeEvent = e.nativeEvent || e;
            onRightClick(ev, nativeEvent);
          }
        }}
        onContextMenu={(e) => {
          if (!isWrapped && onRightClick) {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent?.stopPropagation?.(); // Also stop on native event if available
            // Pass the native event for position access
            const nativeEvent = e.nativeEvent || e;
            onRightClick(ev, nativeEvent);
            return false; // Additional prevention
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-event-id={ev.id}
        style={{
          position: isWrapped ? 'relative' : 'absolute',
          left: isWrapped ? 0 : 4,
          right: isWrapped ? 0 : 4,
          top: isWrapped ? 0 : `${top}%`,
          height: isWrapped ? '100%' : `${heightPercent}%`,
          minHeight: 32,
          width: '100%',
          // When wrapped, allow pointer events but don't interfere with drag
          pointerEvents: 'auto',
          // Background color based on event type (matching filter colors)
          backgroundColor: getEventTypeBackgroundColor(),
          borderRadius: 8,
          borderStyle: isBlackoutDay ? 'dashed' : 'solid',
          borderWidth: 0,
          cursor: isBlackoutDay ? 'not-allowed' : 'pointer',
          overflow: 'hidden',
          opacity: opacity,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 6,
          paddingBottom: 6,
          gap: 8,
          zIndex: isHovered ? 20 : 10,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transform: isHovered ? 'scale(1.01)' : 'scale(1)',
          transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out',
          boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
        }}
        title={`${eventTitle}${childName ? ` • ${childName}` : ''}`}
      ><Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: '#111827',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >{eventTitle}</Text><Text
          style={{
            fontSize: 12,
            fontWeight: '400',
            color: '#6B7280',
            flexShrink: 0,
          }}
        >{(() => {
            let hours, minutes;
            if (ev.start_local) {
              [hours, minutes] = ev.start_local.split(':').map(Number);
            } else {
              const eventDate = new Date(ev.start_ts);
              hours = eventDate.getHours();
              minutes = eventDate.getMinutes();
            }
            const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
            const period = hours >= 12 ? 'PM' : 'AM';
            return `${hour12} ${period}`;
          })()}</Text><View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#10B981',
            flexShrink: 0,
          }}
        /></div>
      {/* Note tooltip removed - notes feature has been removed */}
      </>
  );
}

const styles = StyleSheet.create({
  subjectName: {
    fontSize: 9,
    fontWeight: '400',
    color: '#374151',
    lineHeight: 10,
    margin: 0,
    padding: 0,
  },
  metaText: {
    fontSize: 7,
    fontWeight: '500',
    color: '#6B7280',
    lineHeight: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    margin: 0,
    padding: 0,
  },
  topicText: {
    fontSize: 8,
    fontWeight: '400',
    color: '#9CA3AF',
    lineHeight: 9,
    margin: 0,
    padding: 0,
  },
  eventTextBlackout: {
    color: colors.redBold,
  },
  blackoutBadge: {
    fontSize: 7,
    fontWeight: '400',
    color: colors.redBold,
    marginTop: 2,
    padding: 0,
  },
});
