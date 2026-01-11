// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Optimize bundling to reduce duplicate builds
config.transformer = {
  ...config.transformer,
  // Reduce re-bundling by optimizing Fast Refresh
  unstable_allowRequireContext: true,
};

config.resolver = {
  ...config.resolver,
  // Reduce duplicate module resolution
  sourceExts: [...(config.resolver?.sourceExts || []), 'jsx', 'js', 'ts', 'tsx'],
};

module.exports = config;
