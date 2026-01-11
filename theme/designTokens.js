/**
 * Learnadoodle design tokens shared between native + web surfaces.
 * These tokens map to CSS variables that we hydrate on web via WebInitializer.
 */

export const designTokens = {
  colors: {
    ink: '#2E2E2E',
    paper: '#FFFFFF',
    rail: '#FAFAFA',
    surface: '#FFFFFF',
    border: '#E8E8E8',
    muted: '#8B8B8B',
    primary: '#8B7CF6',
    primaryInk: '#FFFFFF',
    // Pastel backgrounds
    pastelLavender: '#F5F3FF',
    pastelMint: '#F0FDF4',
    pastelPeach: '#FFF5F5',
    pastelSky: '#F0F9FF',
    pastelRose: '#FFF1F2',
    pastelYellow: '#FEFCE8',
  },
  accents: {
    core: '#8B7CF6',
    math: '#A78BFA',
    reading: '#C084FC',
    science: '#86EFAC',
    creative: '#F9A8D4',
    physical: '#7DD3FC',
  },
  softAccents: {
    core: '#F5F3FF',
    math: '#F5F3FF',
    reading: '#FAE8FF',
    science: '#F0FDF4',
    creative: '#FDF2F8',
    physical: '#F0F9FF',
  },
  radius: 12,
  ring: '0 0 0 3px rgba(139,124,246,0.15)',
  fonts: {
    display: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sans: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  --ld-bg: #FFFFFF;
  --ld-surface: #FFFFFF;
  --ld-border: #E8E8E8;
  --ld-text: #2E2E2E;
  --ld-muted: #8B8B8B;
  --ld-primary: #8B7CF6;
  --ld-primary-ink: #FFFFFF;
  --ld-ring: 0 0 0 3px rgba(139,124,246,0.15);
  --ld-ink: var(--ld-text);
  --ld-paper: var(--ld-bg);
  --ld-rail: #FAFAFA;
  --ld-pastel-lavender: #F5F3FF;
  --ld-pastel-mint: #F0FDF4;
  --ld-pastel-peach: #FFF5F5;
  --ld-pastel-sky: #F0F9FF;
  --ld-pastel-rose: #FFF1F2;
  --ld-pastel-yellow: #FEFCE8;
  
  /* Liquid Glass Design Tokens */
  --bg: #F6F7FB;
  --panel: rgba(255,255,255,.72);
  --panel-strong: rgba(255,255,255,.88);
  --stroke: rgba(15,23,42,0.08);
  --stroke-strong: rgba(17,24,39,.12);
  --shadow: 0 16px 40px rgba(17,24,39,.10);
  --shadow-soft: 0 10px 24px rgba(17,24,39,.08);
  --shadow-subtle: 0 2px 8px rgba(17,24,39,.04);
  --blur: 14px;
  --radius-lg: 24px;
  --radius-md: 20px;
  --radius-sm: 16px;
  --highlight: rgba(255, 255, 255, 0.6);
  
  font-family: var(--ld-font-sans);
}

body {
  margin: 0;
  color: var(--ld-text);
  background: var(--bg);
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
  border-radius: calc(var(--ld-radius) - 2px);
  border: 1px solid rgba(46, 46, 46, 0.06);
  background: var(--ld-paper);
  color: var(--ld-ink);
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.btn:hover {
  background: var(--ld-rail);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  transform: translateY(-1px);
}

.btn:focus-visible {
  outline: none;
  box-shadow: var(--ld-ring);
}

.btn-primary {
  background: var(--ld-primary);
  border-color: var(--ld-primary);
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(139, 124, 246, 0.2);
}

.btn-primary:hover {
  background: #7C6AE8;
  box-shadow: 0 4px 8px rgba(139, 124, 246, 0.3);
  transform: translateY(-1px);
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
  background: var(--ld-pastel-lavender);
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

/* Liquid Glass Classes */
.glass {
  background: var(--panel);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius-lg);
}

.glass-strong {
  background: var(--panel-strong);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius-lg);
}

.glass-frame {
  background: var(--bg);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-subtle);
  position: relative;
  overflow: hidden;
}

.glass-frame::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--highlight), transparent);
  pointer-events: none;
  z-index: 1;
}

.glass-surface {
  background: #FFFFFF;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.sidebarWash {
  background: radial-gradient(900px 500px at 0% 0%,
    rgba(227,240,255,.8), transparent 55%),
    radial-gradient(700px 420px at 0% 100%,
    rgba(237,230,255,.7), transparent 55%);
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

