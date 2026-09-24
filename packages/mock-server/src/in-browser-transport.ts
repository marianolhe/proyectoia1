import type {
  ChatTransport,
  OutboundMessage,
  TransportEvent,
  TransportListener,
  TransportStatus,
  Unsubscribe,
} from '@agichat/core'
import { runAgentTurn } from './agent.js'
import type { TurnTiming } from './streaming.js'

export interface InBrowserMockTransportOptions {
  /** Anula los tiempos de espera del streaming; util en pruebas. */
  readonly timing?: TurnTiming
}

/**
 * El mismo agente simulado del servidor, pero sin red.
 *
 * Ejecuta `runAgentTurn` dentro de la pagina, de modo que la demo publicada
 * en GitHub Pages (donde no hay servidor WebSocket) responde con los mismos
 * escenarios, el mismo Markdown y el mismo streaming que `pnpm mock`.
 */
export class InBrowserMockTransport implements ChatTransport {
  readonly #listeners = new Set<TransportListener>()
  readonly #timing: TurnTiming | undefined
  #status: TransportStatus = 'idle'

  constructor(options: InBrowserMockTransportOptions = {}) {
    this.#timing = options.timing
  }

  get status(): TransportStatus {
    return this.#status
  }

  connect(): Promise<void> {
    this.#setStatus('open')
    return Promise.resolve()
  }

  send(message: OutboundMessage): Promise<void> {
    if (this.#status !== 'open') {
      return Promise.reject(new Error('El canal con el agente no esta abierto.'))
    }
    void runAgentTurn(
      message,
      {
        // Un turno que sigue emitiendo tras disconnect() no debe llegar a nadie.
        emit: (event) => {
          if (this.#status === 'open') this.#emit(event)
        },
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
      this.#timing,
    )
    return Promise.resolve()
  }

  subscribe(listener: TransportListener): Unsubscribe {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  disconnect(): void {
    this.#setStatus('closed')
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
