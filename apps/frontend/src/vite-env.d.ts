/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL del backend, DEBE incluir el prefijo global `/api` (ver src/pages/HealthPage.tsx). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
