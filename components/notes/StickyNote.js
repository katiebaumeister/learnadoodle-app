/**
 * Sticky Note Component
 * Draggable, positioned sticky notes that stay visible
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, PanResponder, Platform } from 'react-native';
import { X, GripVertical } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function StickyNote({
  note,
  onUpdate,
  onDelete,
  initialPosition = null,
  zIndex = 1,
}) {
  const [isEditing, setIsEditing] = useState(!note.text);
  const [text, setText] = useState(note.text || '');
  const [position, setPosition] = useState(
    initialPosition || note.position || { x: 100, y: 100 }
  );
  const panResponder = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    panResponder.current = PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => {
        // Only allow dragging from the grip handle area
        const { locationX, locationY } = evt.nativeEvent;
        return locationX < 40 && locationY < 40;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        // Start dragging
      },
      onPanResponderMove: (evt, gestureState) => {
        if (Platform.OS === 'web') {
          const newX = position.x + gestureState.dx;
          const newY = position.y + gestureState.dy;
          setPosition({ x: newX, y: newY });
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        const newX = position.x + gestureState.dx;
        const newY = position.y + gestureState.dy;
        const finalPosition = { x: newX, y: newY };
        setPosition(finalPosition);
        if (onUpdate) {
          onUpdate({ ...note, position: finalPosition });
        }
      },
    });
  }, [position, note, onUpdate]);

  const handleSave = () => {
    setIsEditing(false);
    if (onUpdate) {
      onUpdate({ ...note, text });
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(note.id);
    }
  };

  const handleMouseDown = (e) => {
    if (Platform.OS === 'web') {
      const startX = e.clientX - position.x;
      const startY = e.clientY - position.y;

      const handleMouseMove = (e) => {
        const newX = e.clientX - startX;
        const newY = e.clientY - startY;
        setPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (onUpdate) {
          onUpdate({ ...note, position });
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  const noteColors = [
    { bg: '#FEFCE8', border: '#FDE047', text: '#713F12' },
    { bg: '#F0FDF4', border: '#86EFAC', text: '#166534' },
    { bg: '#F5F3FF', border: '#C4B5FD', text: '#5B21B6' },
    { bg: '#FFF1F2', border: '#F9A8D4', text: '#9F1239' },
    { bg: '#F0F9FF', border: '#7DD3FC', text: '#0C4A6E' },
  ];
  const colorIndex = (note.id || 0) % noteColors.length;
  const noteColor = noteColors[colorIndex];

  return (
    <View
      ref={viewRef}
      style={[
        styles.container,
        {
          left: position.x,
          top: position.y,
          zIndex,
          backgroundColor: noteColor.bg,
          borderColor: noteColor.border,
        },
        Platform.OS === 'web' && { position: 'fixed' },
      ]}
      {...(Platform.OS !== 'web' ? panResponder.current?.panHandlers : {})}
    >
      {/* Drag handle */}
      <View
        style={styles.dragHandle}
        onMouseDown={Platform.OS === 'web' ? handleMouseDown : undefined}
      >
        <GripVertical size={12} color={noteColor.text} />
      </View>

      {/* Close button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleDelete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <X size={14} color={noteColor.text} />
      </TouchableOpacity>

      {/* Content */}
      {isEditing ? (
        <TextInput
          style={[styles.input, { color: noteColor.text }]}
          value={text}
          onChangeText={setText}
          placeholder="Write a note..."
          placeholderTextColor={noteColor.text + '80'}
          multiline
          autoFocus
          onBlur={handleSave}
          onSubmitEditing={handleSave}
        />
      ) : (
        <TouchableOpacity
          style={styles.textContainer}
          onPress={() => setIsEditing(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.text, { color: noteColor.text }]}>
            {text || 'Tap to add note...'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 200,
    minHeight: 150,
    borderRadius: 8,
    borderWidth: 2,
    padding: 12,
    ...(Platform.OS === 'web' 
      ? { boxShadow: shadows.md.boxShadow }
      : {
          shadowColor: shadows.md.shadowColor,
          shadowOffset: shadows.md.shadowOffset,
          shadowOpacity: shadows.md.shadowOpacity,
          shadowRadius: shadows.md.shadowRadius,
          elevation: shadows.md.elevation,
        }
    ),
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
  },
  dragHandle: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: Platform.OS === 'web' ? 'grab' : 'default',
    zIndex: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  textContainer: {
    flex: 1,
    paddingTop: 20,
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === 'web' ? 'Cooper Hewitt, sans-serif' : undefined,
  },
  input: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    paddingTop: 20,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'web' ? 'Cooper Hewitt, sans-serif' : undefined,
  },
});

