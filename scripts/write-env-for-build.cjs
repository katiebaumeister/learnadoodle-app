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

// When building on Vercel/CI, env is set → write it so the bundle gets the API URL.
// When building locally with no env set → don't touch .env so your local REACT_APP_API_URL (e.g. localhost:8001) is used.
if (!apiUrl) {
  console.warn('[write-env-for-build] No EXPO_PUBLIC_API_URL or REACT_APP_API_URL set; leaving .env unchanged so local dev/build uses your existing .env.');
  process.exit(0);
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
