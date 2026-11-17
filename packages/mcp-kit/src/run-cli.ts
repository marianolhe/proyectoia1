import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { startMcpHttpServer, type McpHttpHandle } from './http-server.js'

/**
 * Arranque comun de un MCP Server.
 *
 * - HTTP (por defecto): es como lo consume el backend del agente y como corre
 *   en contenedores.
 * - stdio (`MCP_TRANSPORT=stdio`): es como lo lanza un cliente de escritorio
 *   (Claude Desktop, un IDE) que quiera reutilizar las mismas herramientas.
 */

export interface RunOptions {
  readonly label: string
  readonly createServer: () => McpServer
  readonly env: Record<string, string | undefined>
  readonly defaultPort: number
  /** En stdio, stdout es el canal del protocolo: los avisos van a stderr. */
  readonly log?: (message: string) => void
}

export type RunResult =
  { readonly transport: 'stdio' } | { readonly transport: 'http'; readonly handle: McpHttpHandle }

export async function runMcpServer(options: RunOptions): Promise<RunResult> {
  const log = options.log ?? ((message: string) => console.error(message))

  if (options.env.MCP_TRANSPORT === 'stdio') {
    await options.createServer().connect(new StdioServerTransport())
    log(`[${options.label}] escuchando por stdio`)
    return { transport: 'stdio' }
  }

  const port = Number(options.env.PORT ?? options.defaultPort)
  const handle = await startMcpHttpServer({ port, createServer: options.createServer })
  log(`[${options.label}] escuchando en ${handle.url}`)
  return { transport: 'http', handle }
}
