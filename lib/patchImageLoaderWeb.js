/**
 * Patch web so UUID (and UUID-day-N) URIs never trigger image requests (404s).
 * Must be imported first in index.js so it runs before any other code.
 * 1) Clear any stale home_data_ cache that may contain UUID avatars.
 * 2) Patch window.Image so new Image(); img.src = uuid never loads.
 * 3) Patch HTMLImageElement.prototype.src and setAttribute.
 * 4) Patch ImageLoader and wrap react-native Image.
 */
if (typeof window !== 'undefined') {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;

  const isInvalidUri = (uri) => {
    if (!uri || typeof uri !== 'string') return false;
    const trimmed = uri.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('data:')) return false;
    // Bare UUID or UUID with suffix (e.g. uuid-day-0)
    if (uuidPattern.test(trimmed) || uuidWithSuffixPattern.test(trimmed)) return true;
    // Full URL whose path is only a UUID (e.g. https://origin/uuid or https://origin/uuid-day-0)
    try {
      const url = new URL(trimmed, 'http://x');
      const path = url.pathname.replace(/^\/+|\/+$/g, '') || '';
      if (uuidPattern.test(path) || uuidWithSuffixPattern.test(path)) return true;
    } catch (_) {}
    return false;
  };

  const transparentGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // --- DOM PATCHES FIRST (no require), so any later code that sets img.src or style hits these ---
  try {
    const NativeImage = window.Image;
    window.Image = function Image() {
      const img = new NativeImage();
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (desc && desc.set) {
        const origSet = desc.set;
        try {
          Object.defineProperty(img, 'src', {
            set(value) {
              if (isInvalidUri(value)) {
                origSet.call(this, transparentGif);
                return;
              }
              origSet.call(this, value);
            },
            get: desc.get ? function () { return desc.get.call(this); } : function () { return this.getAttribute('src') || ''; },
            configurable: true,
            enumerable: true
          });
        } catch (_) {}
      }
      return img;
    };
  } catch (_) {}
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set) {
      const origSet = desc.set;
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set(value) {
          if (isInvalidUri(value)) {
            this.setAttribute('data-blocked-uuid', '1');
            origSet.call(this, transparentGif);
            return;
          }
          origSet.call(this, value);
        },
        get: desc.get || function () { return this.getAttribute('src') || ''; },
        configurable: true,
        enumerable: true
      });
    }
  } catch (_) {}
  try {
    const CSSStyleDeclaration = window.CSSStyleDeclaration;
    if (CSSStyleDeclaration && CSSStyleDeclaration.prototype) {
      const desc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'backgroundImage');
      if (desc && desc.set) {
        const origSet = desc.set;
        Object.defineProperty(CSSStyleDeclaration.prototype, 'backgroundImage', {
          set(value) {
            if (value && typeof value === 'string') {
              const m = value.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/);
              if (m && m[1] && isInvalidUri(m[1].trim())) {
                value = 'url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")';
              }
            }
            origSet.call(this, value);
          },
          get: desc.get,
          configurable: true,
          enumerable: true
        });
      }
      const origSetProperty = CSSStyleDeclaration.prototype.setProperty;
      if (typeof origSetProperty === 'function') {
        CSSStyleDeclaration.prototype.setProperty = function (name, value) {
          if ((name === 'background-image' || name === 'backgroundImage') && value && typeof value === 'string') {
            const m = value.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/);
            if (m && m[1] && isInvalidUri(m[1].trim())) {
              value = 'url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")';
            }
          }
          return origSetProperty.call(this, name, value);
        };
      }
      const descCssText = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText');
      if (descCssText && descCssText.set) {
        const origCssTextSet = descCssText.set;
        Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
          set(value) {
            if (value && typeof value === 'string') {
              value = value.replace(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/g, (match, urlPart) => {
                if (urlPart && isInvalidUri(urlPart.trim())) return 'url("' + transparentGif + '")';
                return match;
              });
            }
            origCssTextSet.call(this, value);
          },
          get: descCssText.get,
          configurable: true,
          enumerable: true
        });
      }
    }
  } catch (_) {}
  try {
    const sanitizeStyleValue = (value) => {
      if (typeof value !== 'string') return value;
      return value.replace(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/g, (match, urlPart) => {
        if (urlPart && isInvalidUri(urlPart.trim())) return 'url("' + transparentGif + '")';
        return match;
      });
    };
    const Ctor = window.HTMLImageElement;
    if (Ctor && Ctor.prototype) {
      const orig = Ctor.prototype.setAttribute;
      if (typeof orig === 'function') {
        Ctor.prototype.setAttribute = function (name, value) {
          if (name === 'src' && value != null && isInvalidUri(String(value))) {
            orig.call(this, 'data-blocked-uuid', '1');
            orig.call(this, 'src', transparentGif);
            return;
          }
          return orig.call(this, name, value);
        };
      }
    }
    const CtorIframe = window.HTMLIFrameElement;
    if (CtorIframe && CtorIframe.prototype) {
      const orig = CtorIframe.prototype.setAttribute;
      if (typeof orig === 'function') {
        CtorIframe.prototype.setAttribute = function (name, value) {
          if (name === 'src' && value != null && isInvalidUri(String(value))) {
            orig.call(this, 'data-blocked-uuid', '1');
            return;
          }
          return orig.call(this, name, value);
        };
      }
    }
    const HTMLEl = window.HTMLElement;
    if (HTMLEl && HTMLEl.prototype) {
      const origSetAttr = HTMLEl.prototype.setAttribute;
      if (typeof origSetAttr === 'function') {
        HTMLEl.prototype.setAttribute = function (name, value) {
          if (name === 'style' && value != null && typeof value === 'string') {
            value = sanitizeStyleValue(value);
          }
          return origSetAttr.call(this, name, value);
        };
      }
    }
  } catch (_) {}

  // --- 0b) Patch React.createElement so EVERY img created by React gets safe src (works regardless of bundler/iframe) ---
  const applyReactCreateElementPatch = () => {
    try {
      const React = require('react');
      if (!React || typeof React.createElement !== 'function') return;
      if (React.createElement.__uuidPatch) return; // already patched
      const origCreateElement = React.createElement.bind(React);
      const patched = function (type, props, ...children) {
        if (type === 'img' && props && typeof props === 'object' && props !== null) {
          const src = props.src;
          if (src != null && isInvalidUri(String(src))) {
            props = { ...props, src: transparentGif };
          }
        }
        return origCreateElement(type, props, ...children);
      };
      patched.__uuidPatch = true;
      React.createElement = patched;
    } catch (_) {}
  };
  applyReactCreateElementPatch();
  // Re-apply after first tick in case React used by app was loaded asynchronously
  if (typeof setTimeout !== 'undefined') {
    setTimeout(applyReactCreateElementPatch, 0);
    setTimeout(applyReactCreateElementPatch, 10);
  }

  // --- 0a) Suppress "Failed to load resource" 404 (UUID) in console; browser may log these directly or via console.error ---
  try {
    const uuidInMessage = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?/i;
    const stringifyArg = (a) => {
      if (a == null) return '';
      if (typeof a === 'string') return a;
      if (typeof a === 'object' && a !== null && typeof a.message === 'string') return a.message;
      try { return String(a); } catch (_) { return ''; }
    };
    const hasUuidAnd404 = (args) => {
      const full = args.map(stringifyArg).join(' ');
      if (!uuidInMessage.test(full)) return false;
      return full.includes('404') || full.includes('Failed to load resource') || full.includes('Not Found') || args.some((a) => typeof a === 'string' && uuidInMessage.test(a));
    };
    const origError = console.error;
    const origWarn = console.warn;
    console.error = function (...args) {
      if (hasUuidAnd404(args)) return;
      origError.apply(console, args);
    };
    console.warn = function (...args) {
      if (hasUuidAnd404(args)) return;
      const msg = args.map(stringifyArg).join(' ');
      if (msg.includes('shadow') && msg.includes('deprecated') && msg.includes('boxShadow')) return;
      origWarn.apply(console, args);
    };
  } catch (_) {}

  // --- 0) Clear stale home_data_ cache once (version bump) so next load gets fresh cleaned data ---
  try {
    const CACHE_VERSION = 'avatar-uuid-clean-v1';
    if (localStorage.getItem('ld_cache_version') !== CACHE_VERSION) {
      const keys = Object.keys(localStorage);
      keys.forEach((k) => {
        if (k.startsWith('home_data_')) localStorage.removeItem(k);
      });
      localStorage.setItem('ld_cache_version', CACHE_VERSION);
    }
  } catch (_) {}

  // --- 3) Patch ImageLoader (dist, dist/cjs, and src so we catch whichever the bundler uses) ---
  const patchImageLoaderLoad = (ImageLoader) => {
    if (!ImageLoader || typeof ImageLoader.load !== 'function') return;
    if (ImageLoader.load.__uuidPatch) return;
    const originalLoad = ImageLoader.load.bind(ImageLoader);
    let dummyId = 1e9;
    ImageLoader.load = function (uri, onLoad, onError) {
      if (isInvalidUri(uri)) {
        if (typeof onError === 'function') {
          try { onError(); } catch (_) {}
        }
        return (dummyId += 1);
      }
      return originalLoad(uri, onLoad, onError);
    };
    ImageLoader.load.__uuidPatch = true;
  };
  try {
    try {
      patchImageLoaderLoad(require('react-native-web/dist/modules/ImageLoader').default);
    } catch (_) {}
    try {
      patchImageLoaderLoad(require('react-native-web/dist/cjs/modules/ImageLoader').default);
    } catch (_) {}
    try {
      patchImageLoaderLoad(require('react-native-web/src/modules/ImageLoader').default);
    } catch (_) {}
  } catch (_) {}

  // --- 3b) Patch react-native-web createElement so img never gets src=UUID (backup if React patch not used) ---
  const wrapCreateElement = (OriginalCreateElement) => {
    if (typeof OriginalCreateElement !== 'function') return OriginalCreateElement;
    return function createElement(component, props, options) {
      if (component === 'img' && props && props != null && typeof props === 'object') {
        const src = props.src;
        if (src != null && isInvalidUri(String(src))) {
          props = { ...props, src: transparentGif };
        }
      }
      return OriginalCreateElement.apply(this, [component, props, options]);
    };
  };
  try {
    const rnwCreateElementEs = require('react-native-web/dist/exports/createElement');
    if (rnwCreateElementEs && rnwCreateElementEs.default) {
      rnwCreateElementEs.default = wrapCreateElement(rnwCreateElementEs.default);
    }
  } catch (_) {}
  try {
    const rnwCreateElementCjs = require('react-native-web/dist/cjs/exports/createElement');
    if (rnwCreateElementCjs && rnwCreateElementCjs.default) {
      rnwCreateElementCjs.default = wrapCreateElement(rnwCreateElementCjs.default);
    }
  } catch (_) {}

  // --- 4) Wrap Image so source.uri is never a UUID (patch both react-native and react-native-web) ---
  const wrapImage = (OriginalImage, React) => {
    if (!OriginalImage || !React || !React.createElement) return;
    const Patched = function PatchedImage(props) {
      const source = props && props.source;
      const uri = source != null && typeof source === 'object' && typeof source.uri === 'string'
        ? source.uri
        : typeof source === 'string' ? source : null;
      if (uri && isInvalidUri(uri)) {
        props = { ...props, source: { uri: transparentGif } };
      }
      return React.createElement(OriginalImage, props);
    };
    Patched.displayName = 'Image';
    if (OriginalImage.getSize) Patched.getSize = OriginalImage.getSize;
    if (OriginalImage.prefetch) Patched.prefetch = OriginalImage.prefetch;
    if (OriginalImage.queryCache) Patched.queryCache = OriginalImage.queryCache;
    return Patched;
  };
  try {
    const React = require('react');
    const RN = require('react-native');
    if (RN && RN.Image) {
      RN.Image = wrapImage(RN.Image, React) || RN.Image;
    }
  } catch (_) {}
  try {
    const RNW = require('react-native-web');
    if (RNW && RNW.Image) {
      const React = require('react');
      RNW.Image = wrapImage(RNW.Image, React) || RNW.Image;
    }
  } catch (_) {}

  // --- 5) MutationObserver: catch any img/src or backgroundImage set to UUID that slipped through ---
  const fixElement = (el) => {
    if (!el || !el.nodeName) return;
    const tag = el.nodeName.toUpperCase();
    if (tag === 'IMG') {
      const src = el.getAttribute ? el.getAttribute('src') : el.src;
      if (src && isInvalidUri(src)) {
        el.setAttribute('data-blocked-uuid', '1');
        try {
          el.setAttribute('src', transparentGif);
          if (el.src !== transparentGif) el.src = transparentGif;
        } catch (_) {}
      }
    }
    const style = el.style;
    if (style && style.backgroundImage) {
      const m = String(style.backgroundImage).match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/);
      if (m && m[1] && isInvalidUri(m[1].trim())) {
        style.backgroundImage = 'url("' + transparentGif + '")';
      }
    }
  };
  const scanAndFix = (root) => {
    if (!root) return;
    if (root.nodeType === 1) {
      fixElement(root);
      if (root.querySelectorAll) {
        root.querySelectorAll('img').forEach(fixElement);
      }
    }
    if (root.querySelectorAll) {
      const withBg = root.querySelectorAll('[style*="background-image"]');
      withBg.forEach((el) => fixElement(el));
    }
  };
  const runObserver = () => {
    if (document.body) scanAndFix(document.body);
  };
  try {
    const obs = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            fixElement(node);
            if (node.querySelectorAll) {
              node.querySelectorAll('img').forEach(fixElement);
              node.querySelectorAll('[style*="background-image"]').forEach(fixElement);
            }
          }
        });
        if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
          fixElement(m.target);
        }
      });
    });
    const observe = () => {
      if (!document.body) return;
      runObserver();
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observe);
    } else {
      observe();
    }
  } catch (_) {}
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(runObserver);
  }
  setTimeout(runObserver, 0);
  setTimeout(runObserver, 50);
  setTimeout(runObserver, 500);
  setTimeout(runObserver, 2000);
}
