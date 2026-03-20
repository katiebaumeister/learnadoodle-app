/**
 * DOM-only patch: block UUID image URIs at the browser layer.
 * No require() or import - runs before any other app code so img/src and style never see a UUID.
 * Must be the very first import in index.js.
 */
if (typeof window !== 'undefined') {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
  const isInvalidUri = (uri) => {
    if (!uri || typeof uri !== 'string') return false;
    const trimmed = uri.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('data:')) return false;
    if (uuidPattern.test(trimmed) || uuidWithSuffixPattern.test(trimmed)) return true;
    try {
      const url = new URL(trimmed, 'http://x');
      const path = url.pathname.replace(/^\/+|\/+$/g, '') || '';
      if (uuidPattern.test(path) || uuidWithSuffixPattern.test(path)) return true;
    } catch (_) {}
    return false;
  };
  const transparentGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // window.Image
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

  // HTMLImageElement.prototype.src
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

  // style.backgroundImage and setProperty and cssText
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
                value = 'url("' + transparentGif + '")';
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
              value = 'url("' + transparentGif + '")';
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

  // setAttribute: img src, iframe src, and style sanitize
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

  // Console: suppress "Failed to load resource" 404 (UUID) when logged via console
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
      if (msg.includes('pointerEvents') && msg.includes('deprecated') && msg.includes('style.pointerEvents')) return;
      // React Native Web: on desktop, mouse clicks can emit touchend without touchstart
      if (msg.includes('Cannot record touch end without a touch start') || msg.includes('Cannot record touch move without a touch start')) return;
      origWarn.apply(console, args);
    };
  } catch (_) {}

  // Service worker: intercept UUID URL requests and return 200 + transparent GIF (avoids 404 logs)
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-uuid-intercept.js', { scope: '/' }).catch(function () {});
    }
  } catch (_) {}
}
