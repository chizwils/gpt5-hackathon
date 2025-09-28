/* eslint-disable @typescript-eslint/no-unused-vars */
/// <reference types="vite/client" />
/// <reference types="chrome" />

interface ImportMetaEnv {
  readonly VITE_APP_BUILD_TARGET: 'chrome' | 'firefox';
  readonly VITE_GPT5_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
