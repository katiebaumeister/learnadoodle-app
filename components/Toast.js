import React, { createContext, useContext, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Animated } from 'react-native';
import { X } from 'lucide-react';

const ToastContext = createContext(null);
const DEFAULT_TOAST_DURATION_MS = 3000;
const ERROR_TOAST_DURATION_MS = 8000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info', persistent = false, durationMs = null) => {
    const id = Date.now().toString();
    const newToast = { id, message, type, persistent };
    setToasts((prev) => [...prev, newToast]);
    
    // Auto-dismiss unless persistent. Keep error toasts longer so users can capture details.
    if (!persistent) {
      const timeoutMs = Number.isFinite(durationMs)
        ? durationMs
        : (type === 'error' ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, timeoutMs);
    }
    
    return id;
  }, []);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <View style={[styles.container, { pointerEvents: 'box-none' }]}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={remove} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }) {
  return (
    <View style={[styles.toast, styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]]}>
      <Text style={styles.toastText}>{toast.message}</Text>
      <View style={styles.closeButton} onTouchEnd={() => onRemove(toast.id)}>
        <X size={14} color="#ffffff" />
      </View>
    </View>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return { push: () => {}, remove: () => {} };
  }
  return context;
}

const styles = StyleSheet.create({
  container: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 999999, // Higher than modal overlays
    gap: 8,
    alignItems: 'flex-end',
  },
  toast: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 200,
    maxWidth: 400,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    }),
  },
  toastInfo: {
    backgroundColor: '#3b82f6',
  },
  toastSuccess: {
    backgroundColor: '#10b981',
  },
  toastError: {
    backgroundColor: '#ef4444',
  },
  toastText: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
});

