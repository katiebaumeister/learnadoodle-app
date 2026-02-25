/**
 * Compliance draft persistence. Uses localStorage on web; in-memory fallback when unavailable (e.g. native, SSR).
 * For native, call setStorageImpl(AsyncStorage) from app bootstrap if desired.
 */

const STORAGE_PREFIX = 'compliance_draft_';

type StorageLike = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

let storage: StorageLike | null = null;

function getStorage(): StorageLike {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return memoryStorage;
}

const memoryStorage: StorageLike = (() => {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
})();

/**
 * Optional: set a custom storage implementation (e.g. AsyncStorage on native).
 */
export function setStorageImpl(impl: StorageLike | null): void {
  storage = impl;
}

function storageKey(familyId: string, requirementId: string): string {
  return `${STORAGE_PREFIX}${familyId}_${requirementId}`;
}

export type ComplianceDraft = Record<string, unknown>;

/**
 * Get saved draft for a requirement. Returns null if none.
 */
export async function getComplianceDraft(
  familyId: string,
  requirementId: string
): Promise<ComplianceDraft | null> {
  const s = getStorage();
  const key = storageKey(familyId, requirementId);
  let raw: string | null = s.getItem(key);
  if (raw != null && typeof (raw as Promise<string | null>).then === 'function') {
    raw = await (raw as Promise<string | null>);
  }
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw) as ComplianceDraft;
  } catch {
    return null;
  }
}

/**
 * Save draft for a requirement.
 */
export async function setComplianceDraft(
  familyId: string,
  requirementId: string,
  draft: ComplianceDraft
): Promise<void> {
  const s = getStorage();
  const key = storageKey(familyId, requirementId);
  const value = JSON.stringify(draft);
  const result = s.setItem(key, value);
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    await (result as Promise<void>);
  }
}

/**
 * Placeholder for save handler: persists draft and closes modal. Called from modal Save button.
 */
export async function saveComplianceRequirementDraft(
  familyId: string,
  requirementId: string,
  draft: ComplianceDraft
): Promise<void> {
  await setComplianceDraft(familyId, requirementId, draft);
}
