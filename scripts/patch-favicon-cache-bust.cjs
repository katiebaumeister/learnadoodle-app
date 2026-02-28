/**
 * Patches dist/index.html to embed the favicon as a data URL so no separate request
 * can be cached or rewritten (fixes Safari showing old/generic icon).
 */
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'index.html');
const favicon32Path = path.join(__dirname, '..', 'dist', '_expo', 'static', 'favicon-32.png');

if (!fs.existsSync(distPath)) {
  console.warn('[patch-favicon] dist/index.html not found, skipping');
  process.exit(0);
}
if (!fs.existsSync(favicon32Path)) {
  console.warn('[patch-favicon] favicon-32.png not found, run generate-favicon first');
  process.exit(0);
}

const pngBase64 = fs.readFileSync(favicon32Path).toString('base64');
const dataUrl = 'data:image/png;base64,' + pngBase64;

let html = fs.readFileSync(distPath, 'utf8');
html = html.replace(
  new RegExp('<link rel="icon" href="[^"]*"\\s*/>'),
  '<link rel="icon" href="' + dataUrl + '" />'
);
fs.writeFileSync(distPath, html);
console.log('[patch-favicon] Embedded favicon as data URL in index.html');
