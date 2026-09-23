import type {
  ChatTransport,
  OutboundMessage,
  TransportEvent,
  TransportListener,
  TransportStatus,
  Unsubscribe,
} from '../ports/transport.js'

/**
 * Implementacion del puerto que no toca la red.
 *
 * Se publica junto al nucleo, y no solo en las pruebas, por dos razones: deja
 * probar la interfaz sin levantar un servidor, y le da a un integrador una
 * forma de ver el widget funcionando antes de tener credenciales. Al cumplir
 * el mismo contrato que el adaptador real, tambien demuestra que el contrato
 * es realmente sustituible.
 */

export interface InMemoryTransportOptions {
  /**
   * Respuesta automatica ante cada mensaje del usuario. Si devuelve undefined,
   * el transporte no responde y quien prueba controla los eventos a mano.
   */
  readonly autoRespond?: (message: OutboundMessage) => string | undefined
  /** Tamanio de cada fragmento al simular streaming. */
  readonly chunkSize?: number
  /** Fuerza el fallo de `send` para ejercitar el camino de error. */
  readonly failOnSend?: boolean
}

export class InMemoryTransport implements ChatTransport {
  #status: TransportStatus = 'idle'
  readonly #listeners = new Set<TransportListener>()
  readonly #options: InMemoryTransportOptions

  /** Todo lo que el cliente intento enviar, en orden. */
  readonly sent: OutboundMessage[] = []

  constructor(options: InMemoryTransportOptions = {}) {
    this.#options = options
  }

  get status(): TransportStatus {
    return this.#status
  }

  connect(): Promise<void> {
    if (this.#status === 'open') return Promise.resolve()
    this.setStatus('connecting')
    this.setStatus('open')
    return Promise.resolve()
  }

  send(message: OutboundMessage): Promise<void> {
    if (this.#options.failOnSend === true) {
      return Promise.reject(new Error('Fallo simulado de envio'))
    }
    if (this.#status !== 'open') {
      return Promise.reject(new Error('El transporte no esta abierto'))
    }

    this.sent.push(message)

    const reply = this.#options.autoRespond?.(message)
    if (reply !== undefined) this.respondWith(reply, `${message.messageId}-reply`)

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
    this.setStatus('closed')
    this.#listeners.clear()
  }

  // --- Controles para pruebas y demostraciones -------------------------------

  /** Emite un evento arbitrario hacia los suscriptores. */
  emit(event: TransportEvent): void {
    for (const listener of [...this.#listeners]) listener(event)
  }

  /** Cambia el estado del canal y lo anuncia, como haria un adaptador real. */
  setStatus(status: TransportStatus): void {
    this.#status = status
    this.emit({ type: 'status', status })
  }

  /** Emite una respuesta completa troceada, imitando el streaming del agente. */
  respondWith(text: string, messageId = 'assistant-message'): void {
    this.emit({ type: 'message.start', messageId })
    for (const chunk of chunkText(text, this.#options.chunkSize ?? 8)) {
      this.emit({ type: 'message.delta', messageId, text: chunk })
    }
    this.emit({ type: 'message.end', messageId })
  }

  /** Emite un fallo del agente. */
  failWith(code: string, message: string, recoverable = true): void {
    this.emit({ type: 'error', code, message, recoverable })
  }
}

function chunkText(text: string, size: number): string[] {
  if (size <= 0) return [text]
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size))
  }
  return chunks
}
