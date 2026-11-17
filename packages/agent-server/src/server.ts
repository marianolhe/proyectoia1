import { createServer, type IncomingMessage } from 'node:http'
import type { AgentEvent } from '@agichat/core'
import { WebSocketServer, type WebSocket } from 'ws'
import { runAgentTurn, type AgentDeps } from './agent.js'
import { parseInboundJson } from './protocol.js'
import { RateLimiter } from './rate-limiter.js'

/**
 * Servidor del agente: WebSocket para el widget y HTTP para el chequeo de salud.
 *
 * Habla exactamente el contrato del proyecto 1, asi que el widget se conecta
 * con el mismo `WebSocketTransport`, cambiando solo la URL. El servidor no
 * guarda la conversacion: lo unico que vive por conexion es el limite de tasa
 * y la marca de "turno en curso".
 */

export type TurnDeps = Omit<AgentDeps, 'emit' | 'wait'>

export interface AgentServerOptions {
  readonly port: number
  readonly deps: TurnDeps
  readonly allowedOrigins?: readonly string[]
  readonly rateLimitPerMinute?: number
}

export interface AgentServerHandle {
  readonly port: number
  close(): Promise<void>
}

/** Una trama de chat no necesita mas; corta de raiz los envios gigantes. */
const MAX_FRAME_BYTES = 64 * 1024

function sendEvent(socket: WebSocket, event: AgentEvent): void {
  if (socket.readyState !== socket.OPEN) return
  socket.send(JSON.stringify(event))
}

function originAllowed(request: IncomingMessage, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true
  const origin = request.headers.origin
  return typeof origin === 'string' && allowed.includes(origin)
}

function handleConnection(socket: WebSocket, options: AgentServerOptions): void {
  const limiter = new RateLimiter(options.rateLimitPerMinute ?? 20)
  let busy = false

  const reject = (code: string, message: string) =>
    sendEvent(socket, { type: 'error', code, message, recoverable: true })

  socket.on('message', (raw) => {
    const parsed = parseInboundJson(raw.toString())
    if (!parsed.ok) return reject('invalid_frame', parsed.reason)
    if (busy) return reject('busy', 'Espere a que termine la respuesta anterior.')
    if (!limiter.tryAcquire()) {
      return reject('rate_limited', 'Demasiados mensajes en poco tiempo. Espere un momento.')
    }

    busy = true
    runAgentTurn(parsed.message, {
      ...options.deps,
      emit: (event) => sendEvent(socket, event),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    })
      .catch(() => reject('internal_error', 'Ocurrió un error inesperado. Intente de nuevo.'))
      .finally(() => {
        busy = false
      })
  })
}

export function startAgentServer(options: AgentServerOptions): Promise<AgentServerHandle> {
  const allowedOrigins = options.allowedOrigins ?? []

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found' }))
  })

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_FRAME_BYTES,
    verifyClient: ({ req }: { req: IncomingMessage }) => originAllowed(req, allowedOrigins),
  })
  wss.on('connection', (socket) => handleConnection(socket, options))

  return new Promise((resolve, reject) => {
    // `ws` reemite los errores del servidor HTTP (por ejemplo, el puerto
    // ocupado); sin este oyente esa reemision tumbaria el proceso.
    wss.once('error', reject)
    http.once('error', reject)
    http.listen(options.port, () => {
      const address = http.address()
      const port = typeof address === 'object' && address !== null ? address.port : options.port
      resolve({
        port,
        close: () =>
          new Promise((res, rej) => {
            for (const client of wss.clients) client.terminate()
            wss.close(() => {
              http.closeAllConnections()
              http.close((err) => (err ? rej(err) : res()))
            })
          }),
      })
    })
  })
}
