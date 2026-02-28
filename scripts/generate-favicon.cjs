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
const icoPath = path.join(expoStaticDir, 'favicon.ico');
const icoPathRoot = path.join(distDir, 'favicon.ico'); // Safari requests /favicon.ico by default; must be at root
const png32Path = path.join(expoStaticDir, 'favicon-32.png');

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

const input = fs.readFileSync(pngPath);

Promise.all([
  toIco(input, { resize: true }).then((buf) => {
    fs.writeFileSync(icoPath, buf);
    fs.writeFileSync(icoPathRoot, buf); // also at root so /favicon.ico serves our icon
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
    console.log('[generate-favicon] Wrote dist/_expo/static/' + a + ' and ' + b);
  })
  .catch((err) => {
    console.error('[generate-favicon]', err.message);
    process.exit(1);
  });
