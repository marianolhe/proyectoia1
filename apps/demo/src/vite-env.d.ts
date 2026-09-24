/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del servidor WebSocket; sin ella la demo usa el agente simulado en el navegador. */
  readonly VITE_AGICHAT_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
