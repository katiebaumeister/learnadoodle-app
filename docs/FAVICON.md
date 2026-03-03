# Favicon (learnadoodle.com tab icon)

- **Source:** `assets/favicon.png` (single source of truth).
- **Build:** The script `scripts/generate-favicon.cjs` (run after `expo export --platform web`):
  - Writes `dist/favicon.png` so the site serves the icon at `/favicon.png`.
  - Writes `app/icon.png` for App Router convention (Next.js/similar looks for `app/icon.png`).
  - Still generates `dist/favicon.ico` and `dist/_expo/static/favicon.ico` for fallback.
- **HTML:** `scripts/patch-favicon-cache-bust.cjs` patches `dist/index.html` to use `<link rel="icon" href="/favicon.png?v=...">` (no metadata `icons` field; standard favicon link).
- **Vercel:** `vercel.json` excludes `favicon.ico` and `favicon.png` from the SPA rewrite and sets no-cache headers for both so the icon is served from `dist/`.

If you still see an old or generic icon after deploying:

1. **Clear Safari’s favicon cache** (macOS): Quit Safari, then delete the favicon cache and reopen:
   - `rm -rf ~/Library/Safari/Favicon\ Cache`
   - Or: Safari → Develop → Empty Caches (if Develop menu is enabled).
2. **Hard refresh:** Cmd+Shift+R on the site.
3. **Verify in another browser:** Open learnadoodle.com in Chrome or Firefox to confirm the correct icon loads there.
