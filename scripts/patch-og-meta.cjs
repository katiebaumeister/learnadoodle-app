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
const META_DESCRIPTION = 'Flexible homeschool planning for real families: adaptive schedules, one-place curriculum, progress tracking, privacy-first. Built for different learners and real life.';

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

const KEYWORDS = 'homeschool planning, homeschool app, flexible curriculum, homeschool schedule, learning progress, homeschool records, neurodiverse learning, homeschool for families';

const metaTags = [
  '<meta name="description" content="' + META_DESCRIPTION.replace(/"/g, '&quot;') + '" />',
  '<meta name="keywords" content="' + KEYWORDS + '" />',
  '<meta name="robots" content="index, follow" />',
  '<link rel="canonical" href="' + SITE_URL + '/" />',
  '<meta property="og:type" content="website" />',
  '<meta property="og:url" content="' + SITE_URL + '" />',
  '<meta property="og:title" content="' + TITLE.replace(/"/g, '&quot;') + '" />',
  '<meta property="og:description" content="' + META_DESCRIPTION.replace(/"/g, '&quot;') + '" />',
  '<meta property="og:image" content="' + imageUrl + '" />',
  '<meta property="og:site_name" content="Learnadoodle" />',
  '<meta name="twitter:card" content="summary_large_image" />',
  '<meta name="twitter:title" content="' + TITLE.replace(/"/g, '&quot;') + '" />',
  '<meta name="twitter:description" content="' + META_DESCRIPTION.replace(/"/g, '&quot;') + '" />',
  '<meta name="twitter:image" content="' + imageUrl + '" />',
].join('\n    ');

let html = fs.readFileSync(distHtml, 'utf8');

// Set document title (replace whatever Expo put in)
html = html.replace(/<title>[^<]*<\/title>/, '<title>' + TITLE.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</title>');

// Remove existing description/keywords/robots/canonical and OG/Twitter meta so we don't duplicate
const metaDescriptionRegex = /<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>\s*\n?/gi;
const metaKeywordsRegex = /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?\s*>\s*\n?/gi;
const metaRobotsRegex = /<meta\s+name="robots"\s+content="[^"]*"\s*\/?\s*>\s*\n?/gi;
const canonicalRegex = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?\s*>\s*\n?/gi;
const ogTwitterRegex = /<meta\s+(property="og:[^"]+"|name="twitter:[^"]+")\s+content="[^"]*"\s*\/?\s*>\s*\n?/gi;
html = html.replace(metaDescriptionRegex, '').replace(metaKeywordsRegex, '').replace(metaRobotsRegex, '').replace(canonicalRegex, '').replace(ogTwitterRegex, '');

// Inject after <head> or at start of head
if (html.includes('<head>')) {
  html = html.replace('<head>', '<head>\n    ' + metaTags);
} else {
  html = html.replace(/<head[^>]*>/, (m) => m + '\n    ' + metaTags);
}

fs.writeFileSync(distHtml, html);
console.log('[patch-og-meta] Injected Open Graph and Twitter meta tags into dist/index.html');
