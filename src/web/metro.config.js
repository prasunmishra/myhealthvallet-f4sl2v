/**
 * Metro configuration for PHRSAT web application
 * @version metro-config: 0.76.0
 * 
 * This configuration enables:
 * - Optimized bundling for web and native platforms
 * - TypeScript support through source extensions
 * - Comprehensive asset handling
 * - Performance-optimized transformation settings
 */

const { getDefaultConfig } = require('metro-config');

module.exports = (async () => {
  const defaultConfig = await getDefaultConfig();

  return {
    transformer: {
      // Use React Native Babel transformer for consistent transformation
      babelTransformerPath: require.resolve('metro-react-native-babel-transformer'),
      
      // Configure asset plugins for enhanced asset handling
      assetPlugins: ['metro-asset-plugin'],
      
      // Optimize transformation options for better performance
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          // Enable inline requires for optimized module loading
          inlineRequires: true,
          // Exclude specific modules from inlining for compatibility
          nonInlinedRequires: [
            '@react-native-community/async-storage',
            'react-native-safe-area-context',
            'react-native-reanimated'
          ]
        },
      }),
    },

    resolver: {
      // Comprehensive list of supported asset extensions
      assetExts: [
        'png',
        'jpg',
        'jpeg',
        'gif',
        'svg',
        'ttf',
        'otf',
        'woff',
        'woff2',
        'webp'
      ],

      // Source extensions supporting TypeScript and JavaScript
      sourceExts: [
        'js',
        'jsx',
        'ts',
        'tsx',
        'json',
        'mjs'
      ],

      // Platform-specific module resolution
      platforms: [
        'web',
        'ios',
        'android'
      ],

      // Configure module resolution for web platform compatibility
      extraNodeModules: {
        'react-native': 'react-native-web',
        'react-native-web': 'react-native-web'
      }
    },

    // Watch folders for development
    watchFolders: [
      'node_modules'
    ],

    // Optimize worker configuration for build performance
    maxWorkers: 4
  };
})();