/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** Base URL of the ZoomPane website API (license activation). */
  readonly MAIN_VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
