/**
 * useOfflineSync Hook
 * Initializes background sync for offline storage
 */
import { useEffect } from 'react';
import * as instantSync from '../services/instantSync';

export function useOfflineSync(familyId) {
  useEffect(() => {
    if (!familyId) return;

    // Initialize background sync
    instantSync.initBackgroundSync(familyId, 30000); // Sync every 30 seconds

    // Also sync immediately on mount if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      instantSync.syncAllPending(familyId).catch(err => {
      });
    }
  }, [familyId]);
}

