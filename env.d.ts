/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BUILD_TARGET: 'chrome' | 'firefox';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
