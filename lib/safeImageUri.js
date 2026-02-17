/**
 * Safe image URI helpers so UUIDs (and other non-URL values) never get passed to
 * <Image source={{ uri }} /> and trigger 404s. Use everywhere we pass a URI to Image.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_WITH_SUFFIX_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;

/**
 * Returns true if the value looks like a UUID (bare or with suffix like -day-0).
 * Used to reject DB IDs mistakenly stored in avatar/url fields.
 */
export function isInvalidImageUri(uri) {
  if (!uri || typeof uri !== 'string') return true;
  const trimmed = uri.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('data:')) return false;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const path = url.pathname.replace(/^\/+|\/+$/g, '') || '';
      if (UUID_PATTERN.test(path) || UUID_WITH_SUFFIX_PATTERN.test(path)) return true;
    } catch (_) {}
    return false;
  }
  return UUID_PATTERN.test(trimmed) || UUID_WITH_SUFFIX_PATTERN.test(trimmed);
}

/**
 * Returns true if uri is safe to use as an image source (not a UUID, valid URL or data URI).
 */
export function isValidImageUri(uri) {
  return !isInvalidImageUri(uri);
}

/**
 * Returns the uri if it's safe for Image, otherwise null.
 * Use: source={safeImageUri(url) ? { uri: safeImageUri(url) } : defaultSource}
 */
export function safeImageUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  if (isInvalidImageUri(uri)) return null;
  return uri.trim();
}
