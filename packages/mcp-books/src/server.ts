import { ApiClient, createMcpServer, type FetchLike } from '@agichat/mcp-kit'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BooksClient } from './books-client.js'
import { createBooksTools } from './tools.js'

export interface BooksConfig {
  /** Opcional: Google Books responde sin clave, con menos cupo. */
  readonly apiKey?: string
}

export function loadBooksConfig(env: Record<string, string | undefined>): BooksConfig {
  const apiKey = env.GOOGLE_BOOKS_API_KEY?.trim()
  return apiKey ? { apiKey } : {}
}

/** Fabrica de servidores que comparten cliente, cache y cupo diario. */
export function createBooksServerFactory(
  config: BooksConfig,
  fetchImpl?: FetchLike,
): () => McpServer {
  const api = new ApiClient({
    name: 'Google Books',
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  })
  const client = new BooksClient({
    api,
    ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
  })
  const tools = createBooksTools(client)

  return () => createMcpServer({ name: 'agichat-books', version: '0.1.0', tools })
}
