module.exports = {
  // Indicates this is a root-level ESLint configuration
  root: true,

  // Use TypeScript ESLint parser for TS/TSX files
  // @typescript-eslint/parser v5.59.0
  parser: '@typescript-eslint/parser',

  // Parser configuration options
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: './tsconfig.json',
    tsconfigRootDir: '.',
  },

  // Extended configurations
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:security/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:prettier/recommended',
  ],

  // ESLint plugins
  plugins: [
    // @typescript-eslint/eslint-plugin v5.59.0
    '@typescript-eslint',
    // eslint-plugin-react v7.32.0
    'react',
    // eslint-plugin-react-hooks v4.6.0
    'react-hooks',
    // eslint-plugin-security v1.7.1
    'security',
    // eslint-plugin-jsx-a11y v6.7.1
    'jsx-a11y',
    // eslint-plugin-prettier v4.2.1
    'prettier',
  ],

  // Custom rule configurations
  rules: {
    // TypeScript-specific rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-floating-promises': 'error',

    // React-specific rules
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Security rules
    'security/detect-object-injection': 'error',
    'security/detect-non-literal-fs-filename': 'error',

    // Accessibility rules
    'jsx-a11y/anchor-is-valid': 'error',

    // General rules
    'no-console': [
      'warn',
      {
        allow: ['warn', 'error'],
      },
    ],

    // Prettier integration
    'prettier/prettier': [
      'error',
      {
        singleQuote: true,
        trailingComma: 'es5',
        tabWidth: 2,
        printWidth: 100,
        endOfLine: 'auto',
      },
    ],
  },

  // React-specific settings
  settings: {
    react: {
      version: 'detect',
    },
  },

  // Environment configuration
  env: {
    browser: true,
    es2020: true,
    node: true,
    jest: true,
  },

  // Files to ignore
  ignorePatterns: [
    'build',
    'coverage',
    'node_modules',
    '*.js',
    '*.d.ts',
  ],
};