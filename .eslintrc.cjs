module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true
  },
  globals: {
    chrome: 'readonly'
  },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react/jsx-runtime', 'prettier'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['react', '@typescript-eslint'],
  rules: {
    'react/prop-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }]
  },
  overrides: [
    {
      files: ['vite.config.*', 'src/backend/**/*.{ts,tsx,js,jsx}', 'scripts/**/*.{ts,tsx,js,jsx}'],
      env: {
        node: true
      }
    },
    {
      files: ['src/background/**/*.{ts,tsx}', 'src/content/**/*.{ts,tsx}', 'src/ui/state/**/*.{ts,tsx}'],
      globals: {
        chrome: 'readonly'
      }
    }
  ],
  settings: {
    react: {
      version: 'detect'
    }
  }
};
