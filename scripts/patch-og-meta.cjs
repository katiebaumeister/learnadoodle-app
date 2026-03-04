/**
 * Patches dist/index.html with Open Graph and Twitter Card meta tags so link
 * previews (iMessage, Slack, etc.) show the correct title, description, and image.
 *
 * Image: uses assets/og-image.png if present, else dist/favicon.png (already built).
 * Copy assets/og-image.png → dist/og-image.png so /og-image.png is served.
 * Recommended size for og-image.png: 1200×630.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const distHtml = path.join(distDir, 'index.html');
const ogAsset = path.join(root, 'assets', 'og-image.png');
const ogDist = path.join(distDir, 'og-image.png');
const faviconDist = path.join(distDir, 'favicon.png');

const SITE_URL = process.env.SITE_URL || 'https://learnadoodle.com';
const TITLE = 'Learnadoodle';
const DESCRIPTION = 'Plan, track, and celebrate learning with your family.';

if (!fs.existsSync(distHtml)) {
  console.warn('[patch-og-meta] dist/index.html not found, skipping');
  process.exit(0);
}

// Ensure dist has an image for link preview: prefer assets/og-image.png, else favicon
if (fs.existsSync(ogAsset)) {
  fs.copyFileSync(ogAsset, ogDist);
  console.log('[patch-og-meta] Copied assets/og-image.png → dist/og-image.png');
} else if (fs.existsSync(faviconDist)) {
  fs.copyFileSync(faviconDist, ogDist);
  console.log('[patch-og-meta] No assets/og-image.png; using favicon as og-image');
} else {
  console.warn('[patch-og-meta] No og-image.png or favicon.png in dist, OG image may 404');
}

const imageUrl = SITE_URL + '/og-image.png';

const metaTags = [
  '<meta property="og:type" content="website" />',
  '<meta property="og:url" content="' + SITE_URL + '" />',
  '<meta property="og:title" content="' + TITLE + '" />',
  '<meta property="og:description" content="' + DESCRIPTION + '" />',
  '<meta property="og:image" content="' + imageUrl + '" />',
  '<meta name="twitter:card" content="summary_large_image" />',
  '<meta name="twitter:title" content="' + TITLE + '" />',
  '<meta name="twitter:description" content="' + DESCRIPTION + '" />',
  '<meta name="twitter:image" content="' + imageUrl + '" />',
].join('\n    ');

let html = fs.readFileSync(distHtml, 'utf8');

// Remove existing OG/Twitter meta tags so we don't duplicate
const ogTwitterRegex = /<meta\s+(property="og:[^"]+"|name="twitter:[^"]+")\s+content="[^"]*"\s*\/?\s*>\s*\n?/gi;
html = html.replace(ogTwitterRegex, '');

// Inject after <head> or at start of head
if (html.includes('<head>')) {
  html = html.replace('<head>', '<head>\n    ' + metaTags);
} else {
  html = html.replace(/<head[^>]*>/, (m) => m + '\n    ' + metaTags);
}

fs.writeFileSync(distHtml, html);
console.log('[patch-og-meta] Injected Open Graph and Twitter meta tags into dist/index.html');
