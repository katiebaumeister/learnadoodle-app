// Redirect signup confirmation to /set-password before React loads (Supabase tokens in hash or query)
if (typeof window !== 'undefined') {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const hashParams = new URLSearchParams(hash ? hash.substring(1) : '');
  const searchParams = new URLSearchParams(search ? search.substring(1) : '');
  const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
  const type = hashParams.get('type') || searchParams.get('type');
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  if (accessToken && (type === 'email' || type === 'signup') && path !== '/set-password') {
    try {
      sessionStorage.setItem('learnadoodle_needs_password_set', 'true');
    } catch (_) {}
    const host = window.location.hostname || '';
    const canonical = (host === 'www.learnadoodle.com' || host === 'learnadoodle.com')
      ? 'https://learnadoodle.com'
      : window.location.origin;
    const fragment = hash || (search ? '#' + search.substring(1) : '');
    window.location.replace(canonical + '/set-password' + fragment);
  }
}

// Must run first: block UUID image URIs at DOM layer (no deps), then React/ImageLoader
import './lib/patchImageLoaderWebDom';
import './lib/patchImageLoaderWeb';

// Must be imported early for React Navigation
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import { ensureWebShellImagesLoaded } from './components/AppLoader';
import { ensureLandingHeroLoaded } from './lib/landingHeroPreload';

// Decode marketing hero + shell assets ASAP (parallel with app JS parse/eval)
if (typeof window !== 'undefined') {
  ensureLandingHeroLoaded();
  ensureWebShellImagesLoaded();
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
