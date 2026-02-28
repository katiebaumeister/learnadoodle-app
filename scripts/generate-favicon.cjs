/**
 * Overwrite dist/favicon.ico with one generated from assets/favicon.png.
 * Run after expo export so we serve the correct icon (Expo's can be wrong on some setups).
 */
const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');

const root = path.join(__dirname, '..');
const pngPath = path.join(root, 'assets', 'favicon.png');
const icoPath = path.join(root, 'dist', 'favicon.ico');

if (!fs.existsSync(pngPath)) {
  console.warn('[generate-favicon] assets/favicon.png not found, skipping');
  process.exit(0);
}
if (!fs.existsSync(path.join(root, 'dist'))) {
  console.warn('[generate-favicon] dist/ not found, run after expo export');
  process.exit(0);
}

const input = fs.readFileSync(pngPath);
toIco(input, { resize: true })
  .then((buf) => {
    fs.writeFileSync(icoPath, buf);
    console.log('[generate-favicon] Wrote dist/favicon.ico from assets/favicon.png');
  })
  .catch((err) => {
    console.error('[generate-favicon]', err.message);
    process.exit(1);
  });
