/**
 * Local Storage Sync Service
 * Basic implementation for offline/local-first storage
 * Uses IndexedDB for web, AsyncStorage for React Native
 */

const DB_NAME = 'learnadoodle_local';
const DB_VERSION = 1;
const STORE_NAME = 'files';

let db = null;

/**
 * Initialize IndexedDB (web only)
 */
async function initDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'upload_id' });
      }
    };
  });
}

/**
 * Get database instance
 */
async function getDB() {
  if (!db) {
    db = await initDB();
  }
  return db;
}

/**
 * Store file locally for offline access
 * @param {string} uploadId - Upload ID
 * @param {Blob|ArrayBuffer} fileData - File data
 * @param {object} metadata - File metadata
 */
export async function storeFileLocally(uploadId, fileData, metadata = {}) {
  try {
    if (typeof window === 'undefined' || !window.indexedDB) {
      // Fallback to localStorage for metadata only
      localStorage.setItem(`file_meta_${uploadId}`, JSON.stringify({
        uploadId,
        ...metadata,
        storedAt: new Date().toISOString(),
      }));
      return { success: true, method: 'localStorage' };
    }

    const database = await getDB();
    if (!database) {
      return { success: false, error: 'IndexedDB not available' };
    }

    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const request = store.put({
        upload_id: uploadId,
        data: fileData,
        metadata: {
          ...metadata,
          storedAt: new Date().toISOString(),
        },
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    return { success: true, method: 'indexedDB' };
  } catch (error) {
    console.error('Error storing file locally:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get file from local storage
 * @param {string} uploadId - Upload ID
 */
export async function getFileLocally(uploadId) {
  try {
    if (typeof window === 'undefined' || !window.indexedDB) {
      // Fallback to localStorage
      const meta = localStorage.getItem(`file_meta_${uploadId}`);
      return meta ? { metadata: JSON.parse(meta), data: null } : null;
    }

    const database = await getDB();
    if (!database) {
      return null;
    }

    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(uploadId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting file locally:', error);
    return null;
  }
}

/**
 * Remove file from local storage
 * @param {string} uploadId - Upload ID
 */
export async function removeFileLocally(uploadId) {
  try {
    if (typeof window === 'undefined' || !window.indexedDB) {
      localStorage.removeItem(`file_meta_${uploadId}`);
      return { success: true };
    }

    const database = await getDB();
    if (!database) {
      return { success: false };
    }

    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const request = store.delete(uploadId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    return { success: true };
  } catch (error) {
    console.error('Error removing file locally:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync local files with server
 * Call this when online to sync cached files
 */
export async function syncLocalFiles(familyId) {
  // This would iterate through local files and sync them
  // For now, it's a placeholder
  console.log('Sync local files for family:', familyId);
  return { success: true, synced: 0 };
}

/**
 * Check if file is available locally
 * @param {string} uploadId - Upload ID
 */
export async function isFileLocal(uploadId) {
  const file = await getFileLocally(uploadId);
  return file !== null;
}

