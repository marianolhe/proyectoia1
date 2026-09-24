import type {
  ChatTransport,
  OutboundMessage,
  TransportEvent,
  TransportListener,
  TransportStatus,
  Unsubscribe,
} from '@agichat/core'
import { parseAgentEvent } from './parse-agent-event.js'

/**
 * Lo minimo que el adaptador necesita de un socket.
 *
 * Coincide con el WebSocket del navegador y con el de la libreria `ws`, de
 * modo que el mismo adaptador corre en el sitio del cliente y en las pruebas
 * de Node 20, que no trae WebSocket global.
 */
export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void
}

export type WebSocketFactory = (url: string) => WebSocketLike

export interface ReconnectOptions {
  /** Espera antes del primer reintento. */
  readonly initialDelayMs?: number
  /** Tope de la espera; el crecimiento exponencial no pasa de aqui. */
  readonly maxDelayMs?: number
  /** Reintentos seguidos antes de rendirse y pasar a `error`. */
  readonly maxAttempts?: number
}

export interface WebSocketTransportOptions {
  readonly url: string
  /** Por defecto usa el WebSocket global del navegador. */
  readonly createSocket?: WebSocketFactory
  readonly reconnect?: ReconnectOptions
}

const OPEN_READY_STATE = 1
const NORMAL_CLOSURE = 1000

const DEFAULT_RECONNECT: Required<ReconnectOptions> = {
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  maxAttempts: 8,
}

function createBrowserSocket(url: string): WebSocketLike {
  return new WebSocket(url)
}

/** Espera del reintento numero `attempt` (desde 0): se duplica hasta el tope. */
export function backoffDelay(attempt: number, options: Required<ReconnectOptions>): number {
  return Math.min(options.initialDelayMs * 2 ** attempt, options.maxDelayMs)
}

/**
 * Adaptador del puerto `ChatTransport` sobre WebSocket.
 *
 * Si el canal se cae sin que nadie lo pida, reintenta con espera exponencial
 * y anuncia `reconnecting`; la interfaz muestra el aviso sin saber nada de
 * sockets. Un `disconnect` explicito nunca reintenta.
 */
export class WebSocketTransport implements ChatTransport {
  readonly #url: string
  readonly #createSocket: WebSocketFactory
  readonly #reconnect: Required<ReconnectOptions>
  readonly #listeners = new Set<TransportListener>()

  #status: TransportStatus = 'idle'
  #socket: WebSocketLike | null = null
  #attempt = 0
  #retryTimer: ReturnType<typeof setTimeout> | null = null
  #pendingConnect: Promise<void> | null = null
  #cancelPendingConnect: ((error: Error) => void) | null = null

  constructor(options: WebSocketTransportOptions) {
    this.#url = options.url
    this.#createSocket = options.createSocket ?? createBrowserSocket
    this.#reconnect = { ...DEFAULT_RECONNECT, ...options.reconnect }
  }

  get status(): TransportStatus {
    return this.#status
  }

  /**
   * Abre el canal y resuelve cuando queda abierto. Si el primer intento falla
   * rechaza, pero los reintentos siguen en segundo plano.
   */
  connect(): Promise<void> {
    if (this.#status === 'open') return Promise.resolve()
    if (this.#pendingConnect !== null) return this.#pendingConnect

    this.#pendingConnect = new Promise<void>((resolve, reject) => {
      this.#cancelPendingConnect = reject
      this.#open('connecting', resolve, reject)
    }).finally(() => {
      this.#pendingConnect = null
      this.#cancelPendingConnect = null
    })
    return this.#pendingConnect
  }

  send(message: OutboundMessage): Promise<void> {
    const socket = this.#socket
    if (this.#status !== 'open' || socket === null || socket.readyState !== OPEN_READY_STATE) {
      return Promise.reject(new Error('El canal con el agente no esta abierto.'))
    }
    socket.send(JSON.stringify(message))
    return Promise.resolve()
  }

  subscribe(listener: TransportListener): Unsubscribe {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  disconnect(): void {
    if (this.#status === 'closed') return
    this.#clearRetry()
    const socket = this.#socket
    this.#socket = null
    socket?.close(NORMAL_CLOSURE, 'cliente desconectado')
    // Se suelta la promesa pendiente en el acto y no en su finally: un
    // connect() inmediato (el doble montaje de React en modo estricto) debe
    // abrir un socket nuevo, no recibir la promesa ya cancelada.
    this.#cancelPendingConnect?.(new Error('La conexion se cancelo con disconnect().'))
    this.#pendingConnect = null
    this.#cancelPendingConnect = null
    this.#setStatus('closed')
  }

  #open(
    status: 'connecting' | 'reconnecting',
    onOpen?: () => void,
    onFirstFailure?: (error: Error) => void,
  ): void {
    this.#setStatus(status)

    let socket: WebSocketLike
    try {
      socket = this.#createSocket(this.#url)
    } catch (cause) {
      onFirstFailure?.(cause instanceof Error ? cause : new Error(String(cause)))
      this.#scheduleRetry()
      return
    }
    this.#socket = socket

    socket.addEventListener('open', () => {
      if (this.#socket !== socket) return
      this.#attempt = 0
      this.#setStatus('open')
      onOpen?.()
    })

    socket.addEventListener('message', (event) => {
      if (this.#socket !== socket) return
      this.#emit(parseAgentEvent(event.data))
    })

    // `error` siempre llega seguido de `close`; reaccionar en ambos
    // programaria dos reintentos por la misma caida.
    socket.addEventListener('error', () => {})

    socket.addEventListener('close', () => {
      // Un socket viejo o un cierre pedido por disconnect() no reintentan.
      if (this.#socket !== socket) return
      this.#socket = null
      onFirstFailure?.(new Error(`No se pudo conectar con ${this.#url}.`))
      this.#scheduleRetry()
    })
  }

  #scheduleRetry(): void {
    if (this.#attempt >= this.#reconnect.maxAttempts) {
      this.#setStatus('error')
      return
    }

    const delay = backoffDelay(this.#attempt, this.#reconnect)
    this.#attempt += 1
    this.#setStatus('reconnecting')
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null
      this.#open('reconnecting')
    }, delay)
  }

  #clearRetry(): void {
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer)
    this.#retryTimer = null
    this.#attempt = 0
  }

  #setStatus(status: TransportStatus): void {
    if (this.#status === status) return
    this.#status = status
    this.#emit({ type: 'status', status })
  }

  #emit(event: TransportEvent): void {
    for (const listener of [...this.#listeners]) listener(event)
  }
}
