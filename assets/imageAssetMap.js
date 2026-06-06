export const AVATAR_ASSETS = Object.freeze({
  prof1: require('./prof1.png'),
  prof2: require('./prof2.png'),
  prof3: require('./prof3.png'),
  prof4: require('./prof4.png'),
  prof5: require('./prof5.png'),
  prof6: require('./prof6.png'),
  prof7: require('./prof7.png'),
  prof8: require('./prof8.png'),
  prof9: require('./prof9.png'),
  prof10: require('./prof10.png'),
});

export const AVATAR_KEYS = Object.freeze(Object.keys(AVATAR_ASSETS));
export const DEFAULT_AVATAR_KEY = 'prof1';

export function normalizeAvatarAssetKey(rawValue) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/^.*[\\/]/, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
  return AVATAR_KEYS.includes(normalized) ? normalized : null;
}

export function resolveBundledAvatarSource(rawValue) {
  const key = normalizeAvatarAssetKey(rawValue) || DEFAULT_AVATAR_KEY;
  return AVATAR_ASSETS[key];
}

export const LEARNADOODLE_LOGO_ASSET = require('./learnadoodle-logo.png');
export const FAVICON_ASSET = require('./favicon.png');

export const SIDEBAR_ICON_ASSETS = Object.freeze({
  home: require('./home.png'),
  planner: require('./planner.png'),
  messages: require('./messages.png'),
  create: require('./create.png'),
  family: require('./family.png'),
  library: require('./library.png'),
  subjects: require('./subject.png'),
  more: require('./more.png'),
});

export const LANDING_IMAGE_ASSETS = Object.freeze({
  landing: require('./landing.png'),
  schedule: require('./schedule.png'),
  curriculum: require('./curriculum.png'),
  progress: require('./progress.png'),
  support: require('./support.png'),
  teach: require('./teach.png'),
  privacy: require('./privacy.png'),
  superdoodlesection: require('./superdoodlesection.png'),
});
