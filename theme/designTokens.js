/**
 * Learnadoodle design tokens shared between native + web surfaces.
 * These tokens map to CSS variables that we hydrate on web via WebInitializer.
 */

export const designTokens = {
  colors: {
    ink: '#111827',
    paper: '#ffffff',
    rail: '#f8f9ff',
    surface: '#ffffff',
    border: '#E5E7EB',
    muted: '#6B7280',
    primary: '#6D6AFD',
    primaryInk: '#ffffff',
  },
  accents: {
    core: '#6366f1',
    math: '#4f46e5',
    reading: '#7c3aed',
    science: '#059669',
    creative: '#db2777',
    physical: '#0ea5e9',
  },
  softAccents: {
    core: '#eef2ff',
    math: '#eef2ff',
    reading: '#f3e8ff',
    science: '#ecfdf3',
    creative: '#fde2f4',
    physical: '#e0f2fe',
  },
  radius: 16,
  ring: '0 0 0 3px rgba(109,106,253,0.25)',
  fonts: {
    display: '"Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
};

export const cssVariableMap = {
  '--ld-ink': designTokens.colors.ink,
  '--ld-paper': designTokens.colors.paper,
  '--ld-rail': designTokens.colors.rail,
  '--ld-bg': designTokens.colors.paper,
  '--ld-surface': designTokens.colors.surface,
  '--ld-border': designTokens.colors.border,
  '--ld-text': designTokens.colors.ink,
  '--ld-muted': designTokens.colors.muted,
  '--ld-primary': designTokens.colors.primary,
  '--ld-primary-ink': designTokens.colors.primaryInk,
  '--ld-accent-core': designTokens.accents.core,
  '--ld-accent-math': designTokens.accents.math,
  '--ld-accent-reading': designTokens.accents.reading,
  '--ld-accent-science': designTokens.accents.science,
  '--ld-accent-creative': designTokens.accents.creative,
  '--ld-accent-physical': designTokens.accents.physical,
  '--ld-radius': `${designTokens.radius}px`,
  '--ld-ring': designTokens.ring,
  '--ld-font-display': designTokens.fonts.display,
  '--ld-font-sans': designTokens.fonts.sans,
};

const gradientStops = [
  '#f4b4f8',
  '#c4b5fd',
  '#93c5fd',
  '#a5f3fc',
  '#bbf7d0',
  '#facc15',
];

const rainbowGradient = `linear-gradient(90deg, ${gradientStops.join(', ')})`;

export const baseCssLayer = `
:root {
  --ld-bg: #ffffff;
  --ld-surface: #ffffff;
  --ld-border: #E5E7EB;
  --ld-text: #111827;
  --ld-muted: #6B7280;
  --ld-primary: #6D6AFD;
  --ld-primary-ink: #ffffff;
  --ld-ring: 0 0 0 3px rgba(109,106,253,.25);
  --ld-ink: var(--ld-text);
  --ld-paper: var(--ld-bg);
  --ld-rail: #f8f9ff;
  font-family: var(--ld-font-sans);
}

body {
  margin: 0;
  color: var(--ld-text);
  background: var(--ld-bg);
  font-family: var(--ld-font-sans);
  -webkit-font-smoothing: antialiased;
}

.bg-paper { background-color: var(--ld-paper); }
.bg-rail { background-color: var(--ld-rail); }
.text-ink { color: var(--ld-ink); }
.text-muted { color: rgba(15, 23, 42, 0.7); }
.rounded-xl { border-radius: var(--ld-radius); }
.font-display { font-family: var(--ld-font-display); }
.font-sans { font-family: var(--ld-font-sans); }

.ld-top-bar {
  position: sticky;
  top: 0;
  z-index: 40;
  width: 100%;
  border-bottom: 1px solid var(--ld-border);
  background: color-mix(in srgb, var(--ld-bg) 90%, transparent);
  backdrop-filter: blur(16px);
}

.ld-top-bar__inner {
  max-width: 1300px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
}

.ld-crumb-tag {
  margin-left: 4px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ld-border) 90%, transparent);
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1;
  color: var(--ld-muted);
}

.btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  border-radius: calc(var(--ld-radius) - 6px);
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: var(--ld-paper);
  color: var(--ld-ink);
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.btn:hover {
  background: rgba(15, 23, 42, 0.04);
}

.btn:focus-visible {
  outline: none;
  box-shadow: var(--ld-ring);
}

.btn-primary {
  background: var(--ld-accent-core);
  border-color: var(--ld-accent-core);
  color: #ffffff;
}

.btn-primary:hover {
  background: rgba(99, 102, 241, 0.92);
}

.btn-primary:focus-visible {
  outline: none;
  box-shadow: var(--ld-ring);
}

.nav-icon {
  width: 36px;
  height: 36px;
  border-radius: calc(var(--ld-radius) - 6px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  transition: background 0.2s ease, transform 0.2s ease;
}

.nav-icon:hover {
  background: rgba(99, 102, 241, 0.1);
}

.nav-icon:focus-visible {
  outline: none;
  box-shadow: var(--ld-ring);
}

.rainbow-underline {
  position: relative;
}

.rainbow-underline::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -6px;
  height: 2px;
  opacity: 0;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.3s ease, opacity 0.3s ease;
  background-image: ${rainbowGradient};
}

.rainbow-underline.is-active::after {
  opacity: 1;
  transform: scaleX(1);
}

@media (prefers-reduced-motion: reduce) {
  .btn,
  .btn::after,
  .nav-icon,
  .rainbow-underline::after {
    transition: none !important;
  }
}
`;

export function getSubjectAccent(subject) {
  const key = (subject || '').toLowerCase();
  const map = {
    core: 'core',
    math: 'math',
    mathematics: 'math',
    reading: 'reading',
    literacy: 'reading',
    science: 'science',
    stem: 'science',
    creative: 'creative',
    art: 'creative',
    arts: 'creative',
    music: 'creative',
    physical: 'physical',
    pe: 'physical',
    wellness: 'physical',
  };
  const resolved = map[key] || 'core';
  return {
    key: resolved,
    bold: designTokens.accents[resolved],
    soft: designTokens.softAccents[resolved],
  };
}


