/**
 * Patches dist/index.html to add a cache-busting query param to the favicon link
 * so browsers (especially Safari) fetch the icon instead of using a cached generic one.
 */
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(distPath)) {
  console.warn('[patch-favicon] dist/index.html not found, skipping');
  process.exit(0);
}

const q = 'v=' + Date.now();
let html = fs.readFileSync(distPath, 'utf8');
// Use _expo/static/favicon.ico so the path is excluded from SPA rewrite; cache-bust so browsers fetch fresh
const faviconHref = '/_expo/static/favicon.ico?' + q;
html = html.replace(
  new RegExp('<link rel="icon" href="[^"]*"\\s*/>'),
  '<link rel="icon" href="' + faviconHref + '" />'
);
fs.writeFileSync(distPath, html);
console.log('[patch-favicon] Added cache-bust to favicon link');
