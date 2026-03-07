/**
 * useOfflineSync Hook
 * Initializes background sync for offline storage
 */
import { useEffect } from 'react';
import * as instantSync from '../services/instantSync';

export function useOfflineSync(familyId) {
  useEffect(() => {
    if (!familyId) return;

    // Initialize background sync (periodic only; no immediate sync on mount to avoid
    // 404s when /api/events is not implemented and sync queue has pending items)
    instantSync.initBackgroundSync(familyId, 30000); // Sync every 30 seconds
  }, [familyId]);
}

