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

// Crop from top and bottom (more from bottom) so the subject fills the frame better
const CROP_HEIGHT_FRAC = 0.78;   // use 78% of height (crop less)
const CROP_TOP_FRAC = 0.04;      // take 4% from top
const CROP_WIDTH_FRAC = 0.78;    // use 78% of width (centered)

sharp(input)
  .metadata()
  .then(({ width, height }) => {
    const w = width || 512;
    const h = height || 512;
    const cropW = Math.round(w * CROP_WIDTH_FRAC);
    const cropH = Math.round(h * CROP_HEIGHT_FRAC);
    const left = Math.round((w - cropW) / 2);
    const top = Math.round(h * CROP_TOP_FRAC); // more remaining space is at bottom (36% cropped from bottom)
    return sharp(input)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(w, h)
      .png()
      .toBuffer();
  })
  .then((zoomed) => {
    // Write zoomed favicon.png to dist root and app/
    fs.writeFileSync(faviconPngRoot, zoomed);
    fs.writeFileSync(appIconPng, zoomed);
    return zoomed;
  })
  .then((zoomed) =>
    Promise.all([
      toIco(zoomed, { resize: true }).then((buf) => {
        fs.writeFileSync(icoPath, buf);
        fs.writeFileSync(icoPathRoot, buf);
        return 'favicon.ico';
      }),
      sharp(zoomed)
        .resize(32, 32)
        .png()
        .toBuffer()
        .then((buf) => {
          fs.writeFileSync(png32Path, buf);
          return 'favicon-32.png';
        }),
    ])
  )
  .then(([a, b]) => {
    console.log('[generate-favicon] Wrote dist/favicon.png, app/icon.png, dist/_expo/static/' + a + ', ' + b);
  })
  .catch((err) => {
    console.error('[generate-favicon]', err.message);
    process.exit(1);
  });
