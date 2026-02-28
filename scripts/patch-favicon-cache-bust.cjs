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
// Cache-bust favicon.ico and add PNG fallback (Safari often prefers PNG)
html = html.replace(
  new RegExp('href="/favicon.ico(?:\\?[^"]*)?"'),
  'href="/favicon.ico?' + q + '"'
);
// Add PNG icon link after the existing icon link if not already present
if (!html.includes('favicon.png')) {
  html = html.replace(
    /(<link rel="icon" href="[^"]+favicon\.ico[^"]*" \/>)/,
    '$1<link rel="icon" type="image/png" href="/favicon.png?' + q + '" />'
  );
}
fs.writeFileSync(distPath, html);
console.log('[patch-favicon] Added cache-bust and PNG fallback to favicon links');
