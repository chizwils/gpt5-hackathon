import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';

import manifest from './extension/manifest.json';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = mode === 'firefox' ? 'firefox' : 'chrome';

  return {
    plugins: [react(), crx({ manifest })],
    envDir: '.',
    define: {
      'import.meta.env.VITE_APP_BUILD_TARGET': JSON.stringify(target)
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@ui': resolve(__dirname, 'src/ui'),
        '@data': resolve(__dirname, 'src/data')
      }
    },
    build: {
      outDir: `dist/${target}`
    }
  };
});
