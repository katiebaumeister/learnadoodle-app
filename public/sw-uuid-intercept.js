/**
 * Service worker: intercept requests for UUID URLs (e.g. mistaken img src) and return
 * a 200 response with a 1x1 transparent GIF so the browser never gets 404.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_SUFFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;

function isUuidPath(pathname) {
  const segment = pathname.replace(/^\/+|\/+$/g, '') || pathname;
  if (UUID.test(segment) || UUID_SUFFIX.test(segment)) return true;
  const lastSegment = segment.split('/').pop() || '';
  return UUID.test(lastSegment) || UUID_SUFFIX.test(lastSegment);
}

const GIF_BINARY = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), function (c) { return c.charCodeAt(0); });

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (event) {
  try {
    const pathname = new URL(event.request.url).pathname;
    if (!isUuidPath(pathname)) return;
    event.respondWith(
      new Response(GIF_BINARY, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'image/gif' }
      })
    );
  } catch (_) {}
});
