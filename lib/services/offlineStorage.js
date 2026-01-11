/**
 * Comprehensive Offline Storage Service
 * Local-first storage with IndexedDB for events, templates, plans, and sync queue
 */

const DB_NAME = 'learnadoodle_offline';
const DB_VERSION = 2;

// Object store names
const STORES = {
  EVENTS: 'events',
  TEMPLATES: 'templates',
  PLANS: 'plans',
  SYNC_QUEUE: 'sync_queue',
  SUBJECTS: 'subjects',
  CHILDREN: 'children',
};

let db = null;
let initPromise = null;

/**
 * Initialize IndexedDB with all object stores
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
      const database = event.target.result;

      // Events store
      if (!database.objectStoreNames.contains(STORES.EVENTS)) {
        const eventsStore = database.createObjectStore(STORES.EVENTS, { keyPath: 'id' });
        eventsStore.createIndex('family_id', 'family_id', { unique: false });
        eventsStore.createIndex('start_ts', 'start_ts', { unique: false });
        eventsStore.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // Templates store
      if (!database.objectStoreNames.contains(STORES.TEMPLATES)) {
        const templatesStore = database.createObjectStore(STORES.TEMPLATES, { keyPath: 'id' });
        templatesStore.createIndex('family_id', 'family_id', { unique: false });
        templatesStore.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // Plans store
      if (!database.objectStoreNames.contains(STORES.PLANS)) {
        const plansStore = database.createObjectStore(STORES.PLANS, { keyPath: 'id' });
        plansStore.createIndex('family_id', 'family_id', { unique: false });
        plansStore.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // Sync queue store
      if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('table_name', 'table_name', { unique: false });
        syncStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Subjects store
      if (!database.objectStoreNames.contains(STORES.SUBJECTS)) {
        const subjectsStore = database.createObjectStore(STORES.SUBJECTS, { keyPath: 'id' });
        subjectsStore.createIndex('family_id', 'family_id', { unique: false });
      }

      // Children store
      if (!database.objectStoreNames.contains(STORES.CHILDREN)) {
        const childrenStore = database.createObjectStore(STORES.CHILDREN, { keyPath: 'id' });
        childrenStore.createIndex('family_id', 'family_id', { unique: false });
      }
    };
  });
}

/**
 * Get database instance (singleton)
 */
async function getDB() {
  if (!db) {
    if (!initPromise) {
      initPromise = initDB();
    }
    db = await initPromise;
  }
  return db;
}

/**
 * Check if offline storage is available
 */
export function isOfflineStorageAvailable() {
  return typeof window !== 'undefined' && window.indexedDB !== undefined;
}

/**
 * Generic store function
 */
async function store(storeName, data, options = {}) {
  const database = await getDB();
  if (!database) {
    // Fallback to localStorage
    if (data.id) {
      localStorage.setItem(`${storeName}_${data.id}`, JSON.stringify({
        ...data,
        storedAt: new Date().toISOString(),
        sync_status: options.sync_status || 'pending',
      }));
    }
    return { success: true, method: 'localStorage' };
  }

  const transaction = database.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);

  const record = {
    ...data,
    storedAt: new Date().toISOString(),
    sync_status: options.sync_status || 'synced',
    updatedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve({ success: true, method: 'indexedDB' });
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic get function
 */
async function get(storeName, id) {
  const database = await getDB();
  if (!database) {
    // Fallback to localStorage
    const item = localStorage.getItem(`${storeName}_${id}`);
    return item ? JSON.parse(item) : null;
  }

  const transaction = database.transaction([storeName], 'readonly');
  const store = transaction.objectStore(storeName);

  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic getAll function with optional filter
 */
async function getAll(storeName, filter = {}) {
  const database = await getDB();
  if (!database) {
    // Fallback to localStorage
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${storeName}_`)) {
        const item = JSON.parse(localStorage.getItem(key));
        if (!filter.family_id || item.family_id === filter.family_id) {
          items.push(item);
        }
      }
    }
    return items;
  }

  const transaction = database.transaction([storeName], 'readonly');
  const store = transaction.objectStore(storeName);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      let results = request.result || [];
      
      // Apply filters
      if (filter.family_id) {
        results = results.filter(item => item.family_id === filter.family_id);
      }
      if (filter.sync_status) {
        results = results.filter(item => item.sync_status === filter.sync_status);
      }
      if (filter.start_ts) {
        results = results.filter(item => {
          if (!item.start_ts) return false;
          const itemDate = new Date(item.start_ts);
          const filterDate = new Date(filter.start_ts);
          return itemDate >= filterDate;
        });
      }
      if (filter.end_ts) {
        results = results.filter(item => {
          if (!item.start_ts) return false;
          const itemDate = new Date(item.start_ts);
          const filterDate = new Date(filter.end_ts);
          return itemDate <= filterDate;
        });
      }

      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic delete function
 */
async function remove(storeName, id) {
  const database = await getDB();
  if (!database) {
    localStorage.removeItem(`${storeName}_${id}`);
    return { success: true };
  }

  const transaction = database.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);

  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve({ success: true });
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// Events API
// ============================================

export async function storeEvent(event, options = {}) {
  return store(STORES.EVENTS, event, options);
}

export async function getEvent(eventId) {
  return get(STORES.EVENTS, eventId);
}

export async function getAllEvents(familyId, dateRange = {}) {
  return getAll(STORES.EVENTS, { family_id: familyId, ...dateRange });
}

export async function removeEvent(eventId) {
  return remove(STORES.EVENTS, eventId);
}

// ============================================
// Templates API
// ============================================

export async function storeTemplate(template, options = {}) {
  return store(STORES.TEMPLATES, template, options);
}

export async function getTemplate(templateId) {
  return get(STORES.TEMPLATES, templateId);
}

export async function getAllTemplates(familyId) {
  return getAll(STORES.TEMPLATES, { family_id: familyId });
}

export async function removeTemplate(templateId) {
  return remove(STORES.TEMPLATES, templateId);
}

// ============================================
// Plans API
// ============================================

export async function storePlan(plan, options = {}) {
  return store(STORES.PLANS, plan, options);
}

export async function getPlan(planId) {
  return get(STORES.PLANS, planId);
}

export async function getAllPlans(familyId) {
  return getAll(STORES.PLANS, { family_id: familyId });
}

export async function removePlan(planId) {
  return remove(STORES.PLANS, planId);
}

// ============================================
// Sync Queue API
// ============================================

export async function addToSyncQueue(operation) {
  const database = await getDB();
  if (!database) {
    // Fallback: store in localStorage array
    const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
    queue.push({
      id: Date.now().toString(),
      ...operation,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('sync_queue', JSON.stringify(queue));
    return { success: true };
  }

  const transaction = database.transaction([STORES.SYNC_QUEUE], 'readwrite');
  const store = transaction.objectStore(STORES.SYNC_QUEUE);

  const queueItem = {
    ...operation,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const request = store.add(queueItem);
    request.onsuccess = () => resolve({ success: true, id: request.result });
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncQueue(status = 'pending') {
  const database = await getDB();
  if (!database) {
    const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
    return status === 'pending' 
      ? queue.filter(item => item.status === 'pending')
      : queue;
  }

  const transaction = database.transaction([STORES.SYNC_QUEUE], 'readonly');
  const store = transaction.objectStore(STORES.SYNC_QUEUE);
  const index = store.index('status');

  return new Promise((resolve, reject) => {
    const request = status === 'pending' 
      ? index.getAll(status)
      : store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function updateSyncQueueItem(id, updates) {
  const database = await getDB();
  if (!database) {
    const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates };
      localStorage.setItem('sync_queue', JSON.stringify(queue));
    }
    return { success: true };
  }

  const transaction = database.transaction([STORES.SYNC_QUEUE], 'readwrite');
  const store = transaction.objectStore(STORES.SYNC_QUEUE);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (!item) {
        reject(new Error('Queue item not found'));
        return;
      }

      const updated = { ...item, ...updates };
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve({ success: true });
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeSyncQueueItem(id) {
  const database = await getDB();
  if (!database) {
    const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
    const filtered = queue.filter(item => item.id !== id);
    localStorage.setItem('sync_queue', JSON.stringify(filtered));
    return { success: true };
  }

  return remove(STORES.SYNC_QUEUE, id);
}

// ============================================
// Subjects & Children API
// ============================================

export async function storeSubject(subject, options = {}) {
  return store(STORES.SUBJECTS, subject, options);
}

export async function getAllSubjects(familyId) {
  return getAll(STORES.SUBJECTS, { family_id: familyId });
}

export async function storeChild(child, options = {}) {
  return store(STORES.CHILDREN, child, options);
}

export async function getAllChildren(familyId) {
  return getAll(STORES.CHILDREN, { family_id: familyId });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Clear all offline data for a family
 */
export async function clearFamilyData(familyId) {
  const database = await getDB();
  if (!database) {
    // Clear localStorage items
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes(familyId)) {
        localStorage.removeItem(key);
      }
    });
    return { success: true };
  }

  // Clear from all stores
  const stores = Object.values(STORES);
  for (const storeName of stores) {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    await new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.family_id === familyId) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  return { success: true };
}

/**
 * Get sync status summary
 */
export async function getSyncStatus(familyId) {
  const pendingQueue = await getSyncQueue('pending');
  const pendingEvents = await getAll(STORES.EVENTS, { 
    family_id: familyId, 
    sync_status: 'pending' 
  });
  const pendingTemplates = await getAll(STORES.TEMPLATES, { 
    family_id: familyId, 
    sync_status: 'pending' 
  });

  return {
    pendingQueue: pendingQueue.length,
    pendingEvents: pendingEvents.length,
    pendingTemplates: pendingTemplates.length,
    totalPending: pendingQueue.length + pendingEvents.length + pendingTemplates.length,
  };
}

