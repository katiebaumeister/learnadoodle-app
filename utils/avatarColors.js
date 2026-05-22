/**
 * Avatar Color Utilities
 * Functions to get pastel colors based on child avatars
 */

// Avatar-based color mapping
const AVATAR_COLORS = {
  prof1: '#FDCE5D',  // From user: Fdce5d
  prof2: '#3F9B97',  // From user: 3f9b97
  prof3: '#5D433D',  // From user: 5d433d
  prof4: '#8763B9',  // From user: 8763b9
  prof5: '#12BDE1',  // From user: 12bde1
  prof6: '#55BD98',  // From user: 55bd98
  prof7: '#F0A76C',  // From user: F0a76c
  prof8: '#2F4B7C',  // From user: 2f4b7c
  prof9: '#BAD692',  // From user: Bad692
  prof10: '#F2608C', // From user: F2608c
};

// Helper function to convert hex to RGB for opacity calculations
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/** Convert hex color to rgba string with given opacity (0–1) */
export function hexToRgba(hex, alpha = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

// Helper function to lighten a color (for light variant)
function lightenColor(hex, percent = 40) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.min(255, rgb.r + (255 - rgb.r) * (percent / 100));
  const g = Math.min(255, rgb.g + (255 - rgb.g) * (percent / 100));
  const b = Math.min(255, rgb.b + (255 - rgb.b) * (percent / 100));
  
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

// Helper function to darken a color (for border)
function darkenColor(hex, percent = 20) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.max(0, rgb.r * (1 - percent / 100));
  const g = Math.max(0, rgb.g * (1 - percent / 100));
  const b = Math.max(0, rgb.b * (1 - percent / 100));
  
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

// Helper function to desaturate a color (reduce saturation for pastel effect)
function desaturateColor(hex, percent = 30) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  // Calculate luminance (grayscale value)
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  
  // Mix original color with grayscale based on desaturation percent
  const r = Math.round(rgb.r + (luminance - rgb.r) * (percent / 100));
  const g = Math.round(rgb.g + (luminance - rgb.g) * (percent / 100));
  const b = Math.round(rgb.b + (luminance - rgb.b) * (percent / 100));
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Get child colors based on avatar
 * Returns a pastel color matching the child's avatar
 * @param {string} avatar - Avatar name (e.g., "prof1", "prof1.png")
 * @returns {string} - Pastel hex color
 */
export function getChildColorFromAvatar(avatar) {
  if (!avatar) {
    return '#E5E7EB'; // Default gray
  }
  
  // Normalize avatar name (handle "prof1", "Prof1", "prof1.png", "prof1.PNG", etc.)
  // Also handle paths like "assets/prof1.png" or just "prof1"
  let avatarKey = String(avatar).toLowerCase().trim();
  
  // Remove file extension
  avatarKey = avatarKey.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
  
  // Remove path prefix if present (e.g., "assets/prof1" -> "prof1")
  avatarKey = avatarKey.replace(/^.*[\/\\]/, '');
  
  // Remove any leading/trailing whitespace
  avatarKey = avatarKey.trim();
  
  const baseColor = AVATAR_COLORS[avatarKey];
  
  if (!baseColor) {
    return '#E5E7EB'; // Default gray if avatar not found
  }
  
  // Desaturate the base color for a more muted/pastel appearance
  return desaturateColor(baseColor, 25);
}

/**
 * Get the exact mapped avatar color (non-desaturated), intended for small identity dots.
 * @param {string} avatar - Avatar name (e.g., "prof1", "prof1.png")
 * @returns {string} - Solid hex color from avatar palette
 */
export function getChildDotColorFromAvatar(avatar) {
  if (!avatar) return '#9CA3AF';
  let avatarKey = String(avatar).toLowerCase().trim();
  avatarKey = avatarKey.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
  avatarKey = avatarKey.replace(/^.*[\/\\]/, '');
  avatarKey = avatarKey.trim();
  return AVATAR_COLORS[avatarKey] || '#9CA3AF';
}

/**
 * Get child color from child object
 * @param {object} child - Child object with avatar property
 * @returns {string} - Pastel hex color
 */
export function getChildColor(child) {
  if (!child || !child.avatar) {
    return '#E5E7EB'; // Default gray
  }
  return getChildColorFromAvatar(child.avatar);
}

/**
 * Determine if a color is light or dark (for text color contrast)
 * @param {string} hex - Hex color string
 * @returns {boolean} - true if color is light (use dark text), false if dark (use light text)
 */
function isLightColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  
  // Calculate relative luminance
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5;
}

/**
 * Get appropriate text color (white or dark) for a background color
 * @param {string} hex - Hex color string
 * @returns {string} - '#FFFFFF' for dark backgrounds, '#000000' for light backgrounds
 */
export function getTextColorForBackground(hex) {
  return isLightColor(hex) ? '#1F2937' : '#FFFFFF';
}

