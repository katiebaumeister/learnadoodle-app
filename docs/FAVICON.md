# Favicon (learnadoodle.com tab icon)

- **Source:** `assets/favicon.png` → build generates `dist/favicon.ico` (and `dist/_expo/static/favicon.ico`).
- **Safari:** Safari does **not** support data-URL favicons; it only uses real URLs. The app serves the icon at `/favicon.ico` (cache-busted) and `vercel.json` excludes that path from the SPA rewrite and sets no-cache headers.

If you still see an old or generic icon in Safari after deploying:

1. **Clear Safari’s favicon cache** (macOS): Quit Safari, then delete the favicon cache and reopen:
   - `rm -rf ~/Library/Safari/Favicon\ Cache`
   - Or: Safari → Develop → Empty Caches (if Develop menu is enabled).
2. **Hard refresh:** Cmd+Shift+R on the site.
3. **Verify in another browser:** Open learnadoodle.com in Chrome or Firefox to confirm the correct icon loads there.
