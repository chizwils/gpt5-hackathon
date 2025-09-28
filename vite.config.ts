/* eslint-env node */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import manifest from './extension/manifest.json';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const target = mode === 'firefox' ? 'firefox' : 'chrome';

  return {
    plugins: [react(), crx({ manifest })],
    envDir: '.',
    define: {
      'import.meta.env.VITE_APP_BUILD_TARGET': JSON.stringify(target)
    },
    resolve: {
      alias: {
        '@': resolve(rootDir, 'src'),
        '@ui': resolve(rootDir, 'src/ui'),
        '@data': resolve(rootDir, 'src/data')
      },
      dedupe: ['react', 'react-dom']
    },
    build: {
      outDir: `dist/${target}`
    }
  };
});
