/**
 * Hold browser File blobs between Doodle preview and confirmed execute.
 * Commands only carry attachmentId + metadata (Files are not serializable).
 */

const holds = new Map();

export function holdDoodleAttachment(id, file) {
  const key = String(id || '').trim();
  if (!key || !file) return null;
  holds.set(key, file);
  return key;
}

export function peekDoodleAttachment(id) {
  return holds.get(String(id || '').trim()) || null;
}

export function takeDoodleAttachment(id) {
  const key = String(id || '').trim();
  const file = holds.get(key) || null;
  if (key) holds.delete(key);
  return file;
}

export function releaseDoodleAttachment(id) {
  holds.delete(String(id || '').trim());
}

export function fileExtLabel(nameOrMime = '') {
  const name = String(nameOrMime || '');
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (ext && ext.length <= 5) return ext.toUpperCase();
  if (name.startsWith('image/')) return 'IMG';
  if (name.includes('pdf')) return 'PDF';
  return 'FILE';
}

export function makeAttachmentId() {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
