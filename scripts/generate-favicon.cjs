/**
 * Overwrite dist/favicon.ico with one generated from assets/favicon.png.
 * Run after expo export so we serve the correct icon (Expo's can be wrong on some setups).
 */
const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');

const root = path.join(__dirname, '..');
const pngPath = path.join(root, 'assets', 'favicon.png');
// Serve from _expo/static so the path is excluded from SPA rewrite and always served as static
const icoPath = path.join(root, 'dist', '_expo', 'static', 'favicon.ico');

if (!fs.existsSync(pngPath)) {
  console.warn('[generate-favicon] assets/favicon.png not found, skipping');
  process.exit(0);
}
const distDir = path.join(root, 'dist');
const expoStaticDir = path.join(distDir, '_expo', 'static');
if (!fs.existsSync(distDir)) {
  console.warn('[generate-favicon] dist/ not found, run after expo export');
  process.exit(0);
}
if (!fs.existsSync(expoStaticDir)) {
  fs.mkdirSync(expoStaticDir, { recursive: true });
}

const input = fs.readFileSync(pngPath);
toIco(input, { resize: true })
  .then((buf) => {
    fs.writeFileSync(icoPath, buf);
    console.log('[generate-favicon] Wrote dist/_expo/static/favicon.ico from assets/favicon.png');
  })
  .catch((err) => {
    console.error('[generate-favicon]', err.message);
    process.exit(1);
  });
