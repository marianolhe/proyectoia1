import { ApiClient, createMcpServer, type FetchLike } from '@agichat/mcp-kit'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { TmdbClient } from './tmdb-client.js'
import { createTmdbTools } from './tools.js'

export interface TmdbConfig {
  readonly accessToken?: string
  readonly apiKey?: string
  readonly language?: string
}

export type TmdbConfigResult =
  | { readonly ok: true; readonly config: TmdbConfig }
  | { readonly ok: false; readonly reason: string }

/** Lee la credencial del entorno. Nunca tiene valor por defecto. */
export function loadTmdbConfig(env: Record<string, string | undefined>): TmdbConfigResult {
  const accessToken = env.TMDB_ACCESS_TOKEN?.trim()
  const apiKey = env.TMDB_API_KEY?.trim()
  const language = env.TMDB_LANGUAGE?.trim()
  const extras = language ? { language } : {}

  if (accessToken) return { ok: true, config: { accessToken, ...extras } }
  if (apiKey) return { ok: true, config: { apiKey, ...extras } }
  return {
    ok: false,
    reason:
      'Falta la credencial de TMDB. Defina TMDB_ACCESS_TOKEN (token de lectura v4) o TMDB_API_KEY (clave v3).',
  }
}

/**
 * Devuelve una fabrica de servidores que comparten un mismo cliente. En modo
 * HTTP sin estado se crea un servidor MCP por peticion, pero el cache y el
 * cupo diario deben sobrevivir entre peticiones.
 */
export function createTmdbServerFactory(
  config: TmdbConfig,
  fetchImpl?: FetchLike,
): () => McpServer {
  const api = new ApiClient({
    name: 'TMDB',
    ...(config.accessToken === undefined
      ? {}
      : { headers: { authorization: `Bearer ${config.accessToken}` } }),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  })
  const client = new TmdbClient({
    api,
    ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    ...(config.language === undefined ? {} : { language: config.language }),
  })
  const tools = createTmdbTools(client)

  return () => createMcpServer({ name: 'agichat-tmdb', version: '0.1.0', tools })
}
