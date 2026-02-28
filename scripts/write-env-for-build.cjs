/**
 * Writes .env with API URL from the build environment (e.g. Vercel).
 * Run before `expo export --platform web` so react-native-dotenv and Expo
 * can inject REACT_APP_API_URL / EXPO_PUBLIC_API_URL into the bundle.
 * (.cjs so Node treats as CommonJS when package.json has "type": "module")
 */
const fs = require('fs');
const path = require('path');

const apiUrl = process.env.EXPO_PUBLIC_API_URL || process.env.REACT_APP_API_URL || '';
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

if (!apiUrl) {
  console.warn('[write-env-for-build] WARNING: EXPO_PUBLIC_API_URL and REACT_APP_API_URL are both unset. Set one in Vercel → Settings → Environment Variables. App will use runtime fallback for learnadoodle.com.');
}

const lines = [
  `REACT_APP_API_URL=${apiUrl}`,
  `EXPO_PUBLIC_API_URL=${apiUrl}`,
];

// Preserve existing .env vars that aren't overridden (e.g. SUPABASE_*)
if (fs.existsSync(envPath)) {
  const existing = fs.readFileSync(envPath, 'utf8');
  existing.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('REACT_APP_API_URL=') && !trimmed.startsWith('EXPO_PUBLIC_API_URL=')) {
      lines.push(line);
    }
  });
}

fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
console.log('[write-env-for-build] Wrote .env with REACT_APP_API_URL/EXPO_PUBLIC_API_URL from build env');
