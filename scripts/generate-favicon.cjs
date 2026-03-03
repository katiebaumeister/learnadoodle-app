/**
 * Generate favicon.ico and a small PNG for inline use from assets/favicon.png.
 * Run after expo export.
 */
const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const pngPath = path.join(root, 'assets', 'favicon.png');
const distDir = path.join(root, 'dist');
const expoStaticDir = path.join(distDir, '_expo', 'static');
const appDir = path.join(root, 'app');
const icoPath = path.join(expoStaticDir, 'favicon.ico');
const icoPathRoot = path.join(distDir, 'favicon.ico');
const png32Path = path.join(expoStaticDir, 'favicon-32.png');
const faviconPngRoot = path.join(distDir, 'favicon.png'); // Primary: serve favicon.png at root (used by index.html)
const appIconPng = path.join(appDir, 'icon.png'); // App Router convention: app/icon.png for Next.js/similar

if (!fs.existsSync(pngPath)) {
  console.warn('[generate-favicon] assets/favicon.png not found, skipping');
  process.exit(0);
}
if (!fs.existsSync(distDir)) {
  console.warn('[generate-favicon] dist/ not found, run after expo export');
  process.exit(0);
}
if (!fs.existsSync(expoStaticDir)) {
  fs.mkdirSync(expoStaticDir, { recursive: true });
}
if (!fs.existsSync(appDir)) {
  fs.mkdirSync(appDir, { recursive: true });
}

const input = fs.readFileSync(pngPath);

// Write favicon.png to dist root and app/ for App Router convention (single source: assets/favicon.png)
fs.writeFileSync(faviconPngRoot, input);
fs.writeFileSync(appIconPng, input);

Promise.all([
  toIco(input, { resize: true }).then((buf) => {
    fs.writeFileSync(icoPath, buf);
    fs.writeFileSync(icoPathRoot, buf);
    return 'favicon.ico';
  }),
  sharp(input)
    .resize(32, 32)
    .png()
    .toBuffer()
    .then((buf) => {
      fs.writeFileSync(png32Path, buf);
      return 'favicon-32.png';
    }),
])
  .then(([a, b]) => {
    console.log('[generate-favicon] Wrote dist/favicon.png, app/icon.png, dist/_expo/static/' + a + ', ' + b);
  })
  .catch((err) => {
    console.error('[generate-favicon]', err.message);
    process.exit(1);
  });
