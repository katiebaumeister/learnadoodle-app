import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronDown, ChevronUp, Sparkles, BarChart3 } from 'lucide-react';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import { useHoverDropdown } from '../ui/useHoverDropdown';

export default function SubjectClassworkSmartActions({
  onGapAnalysis,
  gapAnalysisWorking = false,
  buttonStyle,
  textStyle,
}) {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const smartActionsHover = useHoverDropdown({ open, setOpen });
  const showGap = typeof onGapAnalysis === 'function';
  if (!showGap) return null;

  const disabled = gapAnalysisWorking;

  return (
    <View style={styles.anchor}>
      <TouchableOpacity
        ref={triggerRef}
        style={[styles.btn, buttonStyle, disabled && styles.btnDisabled]}
        onPress={
          disabled
            ? undefined
            : smartActionsHover.wrapClickToggle(() => setOpen((value) => !value))
        }
        disabled={disabled}
        accessibilityLabel="Smart Actions"
        {...(disabled ? {} : smartActionsHover.triggerProps)}
        {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
      >
        <Sparkles size={16} color="rgba(15,23,42,0.85)" strokeWidth={2.25} />
        <Text style={[styles.text, textStyle]}>Smart Actions</Text>
        {open ? (
          <ChevronUp size={16} color="rgba(15,23,42,0.7)" />
        ) : (
          <ChevronDown size={16} color="rgba(15,23,42,0.7)" />
        )}
      </TouchableOpacity>
      <Dropdown
        visible={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        placement="bottom-end"
        width={240}
        offset={6}
        variant="context"
        panelProps={disabled ? null : smartActionsHover.panelProps}
      >
        <DropdownItem
          icon={Sparkles}
          label="Ask Doodle…"
          onPress={() => {
            setOpen(false);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('openDoodleCommandBar', {
                detail: { context: 'learning' },
              }));
            }
          }}
          variant="context"
        />
        {showGap ? (
          <DropdownItem
            icon={BarChart3}
            label={gapAnalysisWorking ? 'Working…' : 'Gap analysis'}
            onPress={() => {
              setOpen(false);
              onGapAnalysis();
            }}
            disabled={disabled}
            variant="context"
          />
        ) : null}
      </Dropdown>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    zIndex: 30,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    flexShrink: 0,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
