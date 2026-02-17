import React, { useLayoutEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { baseCssLayer, cssVariableMap } from '../theme/designTokens';

// Set up error suppression IMMEDIATELY on module load (before React renders)
// This must run before any other code to catch errors on initial page load
// Wrap everything in try-catch to prevent initialization failures
if (typeof window !== 'undefined') {
  try {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Pattern to match UUIDs with optional suffixes like -day-0, -day-1, etc.
    const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
    
    // Helper to check if a string is JUST a UUID (not a URL containing a UUID)
    const isJustUuid = (str) => {
      if (!str || typeof str !== 'string') return false;
      const trimmed = str.trim();
      // Check if it's a pure UUID or UUID with suffix (like -day-0)
      const isUuidOrWithSuffix = uuidPattern.test(trimmed) || uuidWithSuffixPattern.test(trimmed);
      return isUuidOrWithSuffix && !trimmed.includes('http') && !trimmed.includes('data:') && !trimmed.includes('/');
    };
    
    // Helper to check if error should be suppressed
    const shouldSuppress = (message) => {
      if (!message || typeof message !== 'string') return false;
      const hasUuid = uuidPattern.test(message);
      const is404 = message.includes('404') || 
                   message.includes('Failed to load resource') || 
                   message.includes('Not Found') ||
                   message.includes('the server responded with a status of 404') ||
                   message.includes('status of 404');
      return hasUuid && is404;
    };
    
    // Intercept console errors immediately - this catches errors logged through console.error
    try {
      const originalError = window.console.error;
      window.console.error = (...args) => {
        try {
          const message = args.join(' ');
          // Check message and all string arguments
          if (shouldSuppress(message) || args.some(arg => typeof arg === 'string' && shouldSuppress(arg))) {
            return; // Suppress this error
          }
          originalError.apply(console, args);
        } catch (e) {
          // If our interceptor fails, fall back to original
          originalError.apply(console, args);
        }
      };
    } catch (e) {
      console.warn('[WebInitializer] Failed to intercept console.error:', e);
    }

    // Also intercept console.warn
    try {
      const originalWarn = window.console.warn;
      window.console.warn = (...args) => {
        try {
          const message = args.join(' ');
          if (shouldSuppress(message) || args.some(arg => typeof arg === 'string' && shouldSuppress(arg))) {
            return; // Suppress this warning
          }
          originalWarn.apply(console, args);
        } catch (e) {
          originalWarn.apply(console, args);
        }
      };
    } catch (e) {
      console.warn('[WebInitializer] Failed to intercept console.warn:', e);
    }

    // Intercept fetch() so we never request URLs that are just a UUID (prevents 404s and console noise)
    try {
      const originalFetch = window.fetch;
      if (typeof originalFetch === 'function') {
        window.fetch = function (input, init) {
          try {
            let urlToCheck = typeof input === 'string' ? input : (input && input.url);
            if (urlToCheck) {
              const trimmed = String(urlToCheck).trim();
              if (uuidPattern.test(trimmed) || uuidWithSuffixPattern.test(trimmed)) {
                return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }));
              }
              try {
                const parsed = new URL(trimmed, window.location.origin);
                const pathSegment = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
                if (pathSegment && (uuidPattern.test(pathSegment) || uuidWithSuffixPattern.test(pathSegment))) {
                  return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }));
                }
              } catch (_) {
                // Not a valid URL, ignore
              }
            }
          } catch (_) {
            // Ignore
          }
          return originalFetch.apply(this, arguments);
        };
      }
    } catch (e) {
      console.warn('[WebInitializer] Failed to intercept fetch:', e);
    }

    // Intercept XMLHttpRequest.open so we never request UUID-only URLs
    try {
      const XHROpen = XMLHttpRequest.prototype.open;
      if (typeof XHROpen === 'function') {
        XMLHttpRequest.prototype.open = function (method, url) {
          try {
            const trimmed = String(url).trim();
            if (uuidPattern.test(trimmed) || uuidWithSuffixPattern.test(trimmed)) {
              this._blockedUuidUrl = true;
              return XHROpen.call(this, method, 'about:blank');
            }
            const parsed = new URL(trimmed, window.location.origin);
            const pathSegment = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
            if (pathSegment && (uuidPattern.test(pathSegment) || uuidWithSuffixPattern.test(pathSegment))) {
              this._blockedUuidUrl = true;
              return XHROpen.call(this, method, 'about:blank');
            }
          } catch (_) {
            // Ignore
          }
          return XHROpen.apply(this, arguments);
        };
      }
    } catch (e) {
      console.warn('[WebInitializer] Failed to intercept XMLHttpRequest.open:', e);
    }

    // Intercept HTMLImageElement.prototype.src at the prototype level (runs immediately)
    try {
      if (typeof HTMLImageElement !== 'undefined') {
        const originalImageSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        if (originalImageSrcDescriptor && originalImageSrcDescriptor.set) {
          Object.defineProperty(HTMLImageElement.prototype, 'src', {
            set: function(value) {
              try {
                // Only block if it's JUST a UUID (not a URL containing a UUID)
                if (isJustUuid(value)) {
                  // Don't set invalid UUID URLs - prevent the browser from attempting to load
                  if (this.style) {
                    this.style.display = 'none';
                  }
                  this.setAttribute('data-blocked-uuid', 'true');
                  return; // Don't call the original setter
                }
                // Valid URL - proceed normally
                originalImageSrcDescriptor.set.call(this, value);
              } catch (e) {
                // If our interceptor fails, try to call original
                try {
                  originalImageSrcDescriptor.set.call(this, value);
                } catch (e2) {
                  // Silently fail if we can't set
                }
              }
            },
            get: function() {
              try {
                if (this.getAttribute('data-blocked-uuid') === 'true') {
                  return '';
                }
                return originalImageSrcDescriptor.get ? originalImageSrcDescriptor.get.call(this) : this.getAttribute('src') || '';
              } catch (e) {
                return this.getAttribute('src') || '';
              }
            },
            configurable: true,
            enumerable: true
          });
        }
      }
    } catch (e) {
      console.warn('[WebInitializer] Failed to intercept HTMLImageElement.prototype.src:', e);
    }

    // Intercept HTMLIFrameElement.prototype.src at the prototype level (runs immediately)
    try {
      if (typeof HTMLIFrameElement !== 'undefined') {
        const originalIframeSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
        if (originalIframeSrcDescriptor && originalIframeSrcDescriptor.set) {
          Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
            set: function(value) {
              try {
                // Only block if it's JUST a UUID
                if (isJustUuid(value)) {
                  // Don't set invalid UUID URLs
                  if (this.style) {
                    this.style.display = 'none';
                  }
                  this.setAttribute('data-blocked-uuid', 'true');
                  return; // Don't call the original setter
                }
                // Valid URL - proceed normally
                originalIframeSrcDescriptor.set.call(this, value);
              } catch (e) {
                try {
                  originalIframeSrcDescriptor.set.call(this, value);
                } catch (e2) {
                  // Silently fail
                }
              }
            },
            get: function() {
              try {
                if (this.getAttribute('data-blocked-uuid') === 'true') {
                  return '';
                }
                return originalIframeSrcDescriptor.get ? originalIframeSrcDescriptor.get.call(this) : this.getAttribute('src') || '';
              } catch (e) {
                return this.getAttribute('src') || '';
              }
            },
            configurable: true,
            enumerable: true
          });
        }
      }
    } catch (e) {
      console.warn('[WebInitializer] Failed to intercept HTMLIFrameElement.prototype.src:', e);
    }

    // Patch setAttribute on img/iframe so src is never set to a UUID (catches React/setAttribute code paths)
    try {
      if (typeof HTMLImageElement !== 'undefined') {
        const imgSetAttribute = HTMLImageElement.prototype.setAttribute;
        if (typeof imgSetAttribute === 'function') {
          HTMLImageElement.prototype.setAttribute = function (name, value) {
            if (name === 'src' && value != null && typeof value === 'string' && isJustUuid(value)) {
              imgSetAttribute.call(this, 'data-blocked-uuid', 'true');
              if (this.style) this.style.display = 'none';
              return;
            }
            return imgSetAttribute.call(this, name, value);
          };
        }
      }
      if (typeof HTMLIFrameElement !== 'undefined') {
        const iframeSetAttribute = HTMLIFrameElement.prototype.setAttribute;
        if (typeof iframeSetAttribute === 'function') {
          HTMLIFrameElement.prototype.setAttribute = function (name, value) {
            if (name === 'src' && value != null && typeof value === 'string' && isJustUuid(value)) {
              iframeSetAttribute.call(this, 'data-blocked-uuid', 'true');
              if (this.style) this.style.display = 'none';
              return;
            }
            return iframeSetAttribute.call(this, name, value);
          };
        }
      }
    } catch (e) {
      console.warn('[WebInitializer] Failed to patch setAttribute for img/iframe:', e);
    }
  } catch (e) {
    console.error('[WebInitializer] Error setting up interceptors:', e);
    // Don't throw - allow app to continue loading
  }
}

export default function WebInitializer({ children }) {
  // No need for loading state - design tokens are applied synchronously in useLayoutEffect
  // This prevents any flash since we render children immediately
  const isInitializedRef = useRef(false);

  useLayoutEffect(() => {
    // Only apply web-specific logic on web platform
    if (Platform.OS !== 'web') {
      return;
    }

    // Prevent multiple initializations
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Clean up any invalid UUID URLs in the DOM immediately
    const cleanupInvalidUrls = () => {
      try {
        if (typeof document === 'undefined') return;
        
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        // Pattern to match UUIDs with optional suffixes like -day-0, -day-1, etc.
        const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
        
        const isJustUuid = (str) => {
          if (!str || typeof str !== 'string') return false;
          const trimmed = str.trim();
          // Check if it's a pure UUID or UUID with suffix (like -day-0)
          const isUuidOrWithSuffix = uuidPattern.test(trimmed) || uuidWithSuffixPattern.test(trimmed);
          return isUuidOrWithSuffix && !trimmed.includes('http') && !trimmed.includes('data:') && !trimmed.includes('/');
        };
        
        // Clean up images
        try {
          const images = document.querySelectorAll('img');
          images.forEach(img => {
            try {
              const src = img.src || img.getAttribute('src') || '';
              if (isJustUuid(src)) {
                img.removeAttribute('src');
                if (img.style) img.style.display = 'none';
                img.setAttribute('data-blocked-uuid', 'true');
              }
            } catch (e) {
              // Skip this image if cleanup fails
            }
          });
        } catch (e) {
          // Skip image cleanup if it fails
        }
        
        // Clean up iframes
        try {
          const iframes = document.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            try {
              const src = iframe.src || iframe.getAttribute('src') || '';
              if (isJustUuid(src)) {
                iframe.removeAttribute('src');
                if (iframe.style) iframe.style.display = 'none';
                iframe.setAttribute('data-blocked-uuid', 'true');
              }
            } catch (e) {
              // Skip this iframe if cleanup fails
            }
          });
        } catch (e) {
          // Skip iframe cleanup if it fails
        }
      } catch (e) {
        // Silently fail - don't break initialization
      }
    };

    // Load Cooper Hewitt font family (all weights), League Spartan for sidebar, and JetBrains Mono for code
    const loadFonts = () => {
      // Guard against mobile environments
      if (typeof document === 'undefined') return;
      
      // Note: Cooper Hewitt is loaded via @font-face in CSS or from local files
      // The font-family references in designTokens.js will use Cooper Hewitt
      // No need to load from Google Fonts as Cooper Hewitt is not available there
      
      // Load League Spartan for sidebar navigation
      if (!document.getElementById('league-spartan-link')) {
        const leagueSpartanLink = document.createElement('link');
        leagueSpartanLink.id = 'league-spartan-link';
        leagueSpartanLink.rel = 'stylesheet';
        leagueSpartanLink.href = 'https://fonts.googleapis.com/css2?family=League+Spartan:wght@100;200;300;400;500;600;700;800;900&display=swap';
        document.head.appendChild(leagueSpartanLink);
      }
      
      // Load Libre Baskerville for button text
      if (!document.getElementById('libre-baskerville-link')) {
        const libreBaskervilleLink = document.createElement('link');
        libreBaskervilleLink.id = 'libre-baskerville-link';
        libreBaskervilleLink.rel = 'stylesheet';
        libreBaskervilleLink.href = 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap';
        document.head.appendChild(libreBaskervilleLink);
      }
      
      // Load JetBrains Mono for code/metadata (optional, keep for monospace needs)
      if (!document.getElementById('mono-link')) {
        const monoLink = document.createElement('link');
        monoLink.id = 'mono-link';
        monoLink.rel = 'stylesheet';
        monoLink.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap';
        document.head.appendChild(monoLink);
      }
    };

    // Web-specific initialization
    const applyDesignTokens = () => {
      try {
        // Guard against mobile environments
        if (typeof document === 'undefined') return;
        
        // Load fonts first
        loadFonts();

        const root = document.documentElement;
        if (root) {
          Object.entries(cssVariableMap).forEach(([token, value]) => {
            try {
              root.style.setProperty(token, value);
            } catch (e) {
              // Skip this token if it fails
            }
          });
        }

        if (!document.getElementById('ld-base-styles')) {
          const styleTag = document.createElement('style');
          styleTag.id = 'ld-base-styles';
          styleTag.innerHTML = baseCssLayer;
          document.head.appendChild(styleTag);
        }
      } catch (e) {
        console.error('[WebInitializer] Error applying design tokens:', e);
      }
    };

    // Apply design tokens immediately (safe to do multiple times)
    // Since we're using useLayoutEffect, this runs synchronously before paint
    try {
      applyDesignTokens();
    } catch (e) {
      console.error('[WebInitializer] Error applying design tokens:', e);
    }

    // Run cleanup after a short delay to avoid interfering with initialization
    // Don't run cleanup immediately - let the app load first
    const cleanupTimeout = setTimeout(() => {
      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', cleanupInvalidUrls);
        } else {
          cleanupInvalidUrls();
        }
      }
    }, 1000);
    
    // Also run cleanup periodically to catch dynamically added elements (less frequently)
    const cleanupInterval = setInterval(cleanupInvalidUrls, 5000);
    
    // Clean up interval on unmount
    return () => {
      try {
        clearTimeout(cleanupTimeout);
        clearInterval(cleanupInterval);
        if (document.removeEventListener) {
          document.removeEventListener('DOMContentLoaded', cleanupInvalidUrls);
        }
      } catch (e) {
        // Silently fail during cleanup
      }
    };
  }, []);

  // Always render children immediately - design tokens are applied synchronously
  return children;
}
