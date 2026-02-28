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
html = html.replace(
  /href="\/favicon\.ico"/,
  'href="/favicon.ico?' + q + '"'
);
fs.writeFileSync(distPath, html);
console.log('[patch-favicon] Added cache-bust to favicon link');
