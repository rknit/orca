module.exports = ({ config }) => ({
  ...config,
  // `expo run` installs a dev-client build cached for the current native fingerprint instead of
  // rebuilding; scripts/native-client.mjs populates the cache.
  buildCacheProvider: { plugin: './scripts/native-build-cache.cjs' },
  ios: {
    ...config.ios,
    // A self-built app signs under the builder's own Apple team, which can't use the published id.
    ...(process.env.ORCA_IOS_BUNDLE_ID ? { bundleIdentifier: process.env.ORCA_IOS_BUNDLE_ID } : {}),
    entitlements: { ...config.ios?.entitlements }
  },
  // Listed first so its entitlement edit runs after expo-notifications adds aps-environment.
  plugins: [
    './plugins/ios-no-push-entitlement.js',
    ...(config.plugins ?? []).map((plugin) =>
      plugin === 'expo-notifications'
        ? ['expo-notifications', { icon: './assets/notification-icon.png' }]
        : plugin
    )
  ]
})
