/**
 * Patches dist/index.html to point favicon at /favicon.png with cache-bust.
 * Uses favicon.png (single source: assets/favicon.png). Safari and other
 * browsers use real URLs; rewrite excludes /favicon.png so it is served from dist.
 */
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(distPath)) {
  console.warn('[patch-favicon] dist/index.html not found, skipping');
  process.exit(0);
}

const q = 'v=' + Date.now();
const faviconHref = '/favicon.png?' + q;
const faviconTag = '<link rel="icon" href="' + faviconHref + '">';
let html = fs.readFileSync(distPath, 'utf8');

// Remove any existing icon link(s) so we control favicon for all routes (including /invites/...)
html = html.replace(/<link[^>]*\srel=["']icon["'][^>]*>/gi, '');

// Inject a single root-relative favicon so it works on / and /invites/xxx
if (!/<\/head>/i.test(html)) {
  console.warn('[patch-favicon] No </head> found, skipping inject');
} else {
  html = html.replace('</head>', faviconTag + '\n</head>');
}

fs.writeFileSync(distPath, html);
console.log('[patch-favicon] Set favicon link to /favicon.png?' + q);
