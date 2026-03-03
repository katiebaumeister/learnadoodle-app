/**
 * Patches dist/index.html to point favicon at /favicon.png with cache-bust.
 * Uses favicon.png (single source: assets/favicon.png). Safari and other
 * browsers use real URLs; rewrite excludes /favicon.png so it is served from dist.
 */
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(distPath)) {
  console.warn('[patch-favicon] dist/index.html not found, skipping');
  process.exit(0);
}

const q = 'v=' + Date.now();
const faviconHref = '/favicon.png?' + q;
let html = fs.readFileSync(distPath, 'utf8');
// Replace any existing icon link (Expo may inject various formats)
html = html.replace(
  new RegExp('<link rel="icon" href="[^"]*"\\s*/>'),
  '<link rel="icon" href="' + faviconHref + '" />'
);
fs.writeFileSync(distPath, html);
console.log('[patch-favicon] Set favicon link to /favicon.png?' + q);
