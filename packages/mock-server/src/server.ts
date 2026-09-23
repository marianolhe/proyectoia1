import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import type { AgentEvent } from '@agichat/core'
import { runAgentTurn } from './agent.js'
import { parseInboundJson } from './protocol.js'
import type { TurnTiming } from './streaming.js'

/**
 * Cableado del socket.
 *
 * Esta es la unica capa del paquete que conoce `ws`. Traduce eventos de
 * conexion en llamadas a la logica pura de `agent.ts`, inyectando un `emit`
 * que escribe al socket real y un `wait` respaldado por `setTimeout`.
 */

export interface MockServerOptions {
  readonly port: number
  /** Anula los tiempos de espera por defecto; util para pruebas rapidas. */
  readonly timing?: TurnTiming
}

export interface MockServerHandle {
  readonly port: number
  close(): Promise<void>
}

function sendEvent(socket: WebSocket, event: AgentEvent): void {
  if (socket.readyState !== socket.OPEN) return
  socket.send(JSON.stringify(event))
}

function handleMessage(socket: WebSocket, raw: RawData, timing: TurnTiming | undefined): void {
  const parsed = parseInboundJson(raw.toString())

  if (!parsed.ok) {
    sendEvent(socket, {
      type: 'error',
      code: 'invalid_frame',
      message: parsed.reason,
      recoverable: true,
    })
    return
  }

  void runAgentTurn(
    parsed.message,
    {
      emit: (event) => sendEvent(socket, event),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    timing,
  )
}

export function startMockServer(options: MockServerOptions): Promise<MockServerHandle> {
  const wss = new WebSocketServer({ port: options.port })

  wss.on('connection', (socket) => {
    socket.on('message', (raw) => handleMessage(socket, raw, options.timing))
  })

  return new Promise((resolve, reject) => {
    wss.once('listening', () => {
      const address = wss.address()
      const port = typeof address === 'object' && address !== null ? address.port : options.port

      resolve({
        port,
        close: () =>
          new Promise((res, rej) => {
            // `wss.close()` no fuerza el cierre de los clientes que siguen
            // conectados; sin esto, un socket abierto (por ejemplo, si una
            // prueba termina antes de desconectarse) cuelga el cierre para
            // siempre en lugar de resolver.
            for (const client of wss.clients) client.terminate()
            wss.close((err) => {
              if (err) rej(err)
              else res()
            })
          }),
      })
    })
    wss.once('error', reject)
  })
}
