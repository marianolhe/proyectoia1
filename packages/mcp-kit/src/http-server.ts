import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

/**
 * Expone un MCP Server por Streamable HTTP en modo sin estado.
 *
 * Sin estado significa que cada peticion crea su propio servidor MCP y su
 * transporte, y no hay sesion que recordar entre peticiones. Es lo que permite
 * poner varias replicas detras de un balanceador sin afinidad de sesion: lo
 * unico compartido es el cache, que es una optimizacion y no un requisito.
 */

export interface McpHttpOptions {
  readonly port: number
  /** Fabrica: se invoca una vez por peticion. */
  readonly createServer: () => McpServer
  readonly path?: string
}

export interface McpHttpHandle {
  readonly port: number
  readonly url: string
  close(): Promise<void>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  createMcp: () => McpServer,
): Promise<void> {
  const server = createMcp()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } catch {
    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Error interno del servidor MCP' },
        id: null,
      })
    }
  }
}

export function startMcpHttpServer(options: McpHttpOptions): Promise<McpHttpHandle> {
  const path = options.path ?? '/mcp'

  const http: Server = createServer((req, res) => {
    const route = (req.url ?? '').split('?')[0]

    if (route === '/healthz') {
      sendJson(res, 200, { status: 'ok' })
      return
    }
    if (route !== path) {
      sendJson(res, 404, { error: 'not_found' })
      return
    }
    // En modo sin estado no hay flujo SSE que abrir (GET) ni sesion que cerrar (DELETE).
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      sendJson(res, 405, {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Metodo no permitido' },
        id: null,
      })
      return
    }
    void handleMcp(req, res, options.createServer)
  })

  return new Promise((resolve, reject) => {
    http.once('error', reject)
    http.listen(options.port, () => {
      const address = http.address()
      const port = typeof address === 'object' && address !== null ? address.port : options.port
      resolve({
        port,
        url: `http://localhost:${port}${path}`,
        close: () =>
          new Promise((res, rej) => {
            http.closeAllConnections()
            http.close((err) => (err ? rej(err) : res()))
          }),
      })
    })
  })
}
