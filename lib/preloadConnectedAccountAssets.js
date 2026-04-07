/**
 * Connected accounts row logos (Family → connections) — load after sign-in, non-blocking.
 */
import { Image, Platform } from 'react-native';

const PROVIDER_IDS = ['google', 'dropbox', 'notion', 'youtube', 'quizlet', 'vimeo', 'canvas'];
const PROVIDER_SOURCES = {
  google: require('../assets/google.png'),
  dropbox: require('../assets/dropbox.png'),
  notion: require('../assets/notion.png'),
  youtube: require('../assets/youtube.png'),
  quizlet: require('../assets/quizlet.png'),
  vimeo: require('../assets/vimeo.png'),
  canvas: require('../assets/canvas.png'),
};

let providerLogosPromise = null;

function resolveUri(source) {
  try {
    const r = Image.resolveAssetSource(source);
    return r && r.uri ? r.uri : null;
  } catch {
    return null;
  }
}

export function preloadProviderConnectionLogos() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (providerLogosPromise) return providerLogosPromise;
  const total = PROVIDER_IDS.length;
  providerLogosPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const loaded = new Set();
    const onDone = (id) => {
      if (loaded.has(id)) return;
      loaded.add(id);
      if (loaded.size >= total) finish();
    };
    PROVIDER_IDS.forEach((id) => {
      const uri = resolveUri(PROVIDER_SOURCES[id]);
      if (!uri) {
        onDone(id);
        return;
      }
      const img = new window.Image();
      const mark = () => {
        if (typeof img.decode === 'function') {
          img.decode().then(() => onDone(id)).catch(() => onDone(id));
        } else {
          onDone(id);
        }
      };
      img.onload = mark;
      img.onerror = () => onDone(id);
      img.src = uri;
    });
    setTimeout(finish, 30000);
  });
  return providerLogosPromise;
}
