/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL del backend, DEBE incluir el prefijo global `/api` (ver src/pages/HealthPage.tsx). */
  readonly VITE_API_BASE_URL?: string;
  /**
   * `client_id` de Google Identity Services (design.md D10). DEBE coincidir
   * con el `GOOGLE_CLIENT_ID` del backend (el backend lo verifica como
   * `audience`). Sin esta variable el botón "Continuar con Google" no se
   * renderiza (fail-closed) — ver `BotonGoogle.tsx`.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
