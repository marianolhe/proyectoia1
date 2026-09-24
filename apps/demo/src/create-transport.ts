import type { ChatTransport } from '@agichat/core'
import { InBrowserMockTransport } from '@agichat/mock-server/browser'
import { WebSocketTransport } from '@agichat/transport-ws'

export type TransportKind = 'websocket' | 'in-browser'

/**
 * Unico punto de la demo que decide que adaptador usar.
 *
 * Es lo que hara cualquier integrador: la interfaz recibe un ChatTransport y
 * no sabe cual es. En Fase 2 basta con pasar la URL del agente real.
 */
export function createTransport(kind: TransportKind, wsUrl: string | undefined): ChatTransport {
  if (kind === 'websocket' && wsUrl !== undefined) return new WebSocketTransport({ url: wsUrl })
  return new InBrowserMockTransport()
}

export function defaultKind(wsUrl: string | undefined): TransportKind {
  return wsUrl === undefined || wsUrl === '' ? 'in-browser' : 'websocket'
}
