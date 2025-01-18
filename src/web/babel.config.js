/**
 * Babel Configuration
 * Version: 1.0.0
 * 
 * This configuration enables:
 * - Modern JavaScript features (ES2015+)
 * - TypeScript transpilation
 * - React JSX/TSX processing
 * - Environment-specific optimizations
 * - Browser compatibility via polyfills
 * 
 * Dependencies:
 * @babel/preset-env@^7.22.0
 * @babel/preset-react@^7.22.0
 * @babel/preset-typescript@^7.22.0
 * core-js@^3.30.0
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          browsers: ['>0.2%', 'not dead', 'not op_mini all']
        },
        modules: 'auto',
        useBuiltIns: 'usage',
        corejs: 3,
        debug: false,
        bugfixes: true,
        shippedProposals: true
      }
    ],
    [
      '@babel/preset-react',
      {
        runtime: 'automatic',
        development: process.env.NODE_ENV === 'development',
        importSource: '@emotion/react',
        throwIfNamespace: true,
        pure: true
      }
    ],
    [
      '@babel/preset-typescript',
      {
        isTSX: true,
        allExtensions: true,
        allowNamespaces: true,
        allowDeclareFields: true,
        optimizeConstEnums: true,
        onlyRemoveTypeImports: true
      }
    ]
  ],
  env: {
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: {
              node: 'current'
            },
            modules: 'commonjs'
          }
        ]
      ]
    },
    production: {
      presets: [
        [
          '@babel/preset-env',
          {
            modules: false,
            targets: {
              browsers: ['>0.2%', 'not dead', 'not op_mini all']
            },
            bugfixes: true,
            useBuiltIns: 'usage',
            corejs: 3,
            exclude: ['transform-typeof-symbol']
          }
        ]
      ],
      comments: false
    }
  }
};