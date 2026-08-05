/**
 * Copies the optimized landing hero into dist/ and injects a high-priority
 * <link rel="preload"> into dist/index.html so the browser fetches it before JS.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const distHtml = path.join(distDir, 'index.html');
const heroSrc = path.join(root, 'assets', 'landing-hero.png');
const heroPublic = path.join(root, 'public', 'landing-hero.png');
const heroDist = path.join(distDir, 'landing-hero.png');

if (!fs.existsSync(distHtml)) {
  console.warn('[patch-landing-hero-preload] dist/index.html not found, skipping');
  process.exit(0);
}

const copyFrom = fs.existsSync(heroSrc) ? heroSrc : heroPublic;
if (!fs.existsSync(copyFrom)) {
  console.warn('[patch-landing-hero-preload] landing-hero.png missing, skipping');
  process.exit(0);
}

fs.copyFileSync(copyFrom, heroDist);
console.log('[patch-landing-hero-preload] Copied landing-hero.png → dist/landing-hero.png');

let html = fs.readFileSync(distHtml, 'utf8');

// Remove any previous injected preload so rebuilds stay clean
html = html.replace(
  /\s*<link\s+rel="preload"\s+as="image"\s+href="\/landing-hero\.png"[^>]*>\s*/gi,
  '\n'
);

const preloadTag =
  '<link rel="preload" as="image" href="/landing-hero.png" fetchpriority="high" />';

if (/<head[^>]*>/i.test(html)) {
  html = html.replace(/<head[^>]*>/i, (match) => `${match}\n    ${preloadTag}`);
} else {
  console.warn('[patch-landing-hero-preload] No <head> found in index.html');
  process.exit(0);
}

fs.writeFileSync(distHtml, html);
console.log('[patch-landing-hero-preload] Injected hero image preload into index.html');
