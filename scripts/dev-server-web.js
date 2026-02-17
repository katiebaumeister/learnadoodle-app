/**
 * Dev proxy for web: intercepts requests for UUID paths and returns 200 + 1x1 GIF
 * so the console isn't flooded with 404s.
 * 1) Start Expo: npx expo start --web
 * 2) Run: node scripts/dev-server-web.js
 * 3) Open http://localhost:8082
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EXPORT_PORT = Number(process.env.EXPO_DEV_PORT) || 8081;
const PROXY_PORT = Number(process.env.UUID_PROXY_PORT) || 8082;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_SUFFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
function isUuidPath(pathname) {
  const segment = pathname.replace(/^\/+|\/+$/g, '') || pathname;
  if (UUID.test(segment) || UUID_SUFFIX.test(segment)) return true;
  const last = segment.split('/').pop() || '';
  return UUID.test(last) || UUID_SUFFIX.test(last);
}

const GIF_BINARY = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function proxyToExpo(req, res) {
  const headers = { ...req.headers };
  headers.host = `127.0.0.1:${EXPORT_PORT}`;
  const opts = {
    hostname: '127.0.0.1',
    port: EXPORT_PORT,
    path: req.url,
    method: req.method,
    headers,
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway. Start Expo first: npx expo start --web');
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://x').pathname;

  if (req.method === 'GET' && isUuidPath(pathname)) {
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    res.end(GIF_BINARY);
    return;
  }

  if (req.method === 'GET' && pathname === '/sw-uuid-intercept.js') {
    const file = path.join(ROOT, 'public', 'sw-uuid-intercept.js');
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }

  proxyToExpo(req, res);
});

server.listen(PROXY_PORT, () => {
  console.log(`Web dev proxy: http://localhost:${PROXY_PORT} (proxies to ${EXPORT_PORT}, UUID paths -> GIF)`);
  console.log('Start Expo in another terminal: npx expo start --web');
});
