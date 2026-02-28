/**
 * Patches dist/index.html to point favicon at /favicon.ico with cache-bust.
 * Safari does NOT support data-URL favicons; it only uses real URLs. We serve
 * the generated icon at /favicon.ico (rewrite excludes it) and bust cache so
 * Safari fetches fresh. Clear Safari Favicon Cache if still seeing old icon.
 */
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(distPath)) {
  console.warn('[patch-favicon] dist/index.html not found, skipping');
  process.exit(0);
}

const q = 'v=' + Date.now();
const faviconHref = '/favicon.ico?' + q;
let html = fs.readFileSync(distPath, 'utf8');
html = html.replace(
  new RegExp('<link rel="icon" href="[^"]*"\\s*/>'),
  '<link rel="icon" href="' + faviconHref + '" />'
);
fs.writeFileSync(distPath, html);
console.log('[patch-favicon] Set favicon link to /favicon.ico?' + q);
