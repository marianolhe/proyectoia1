import { createId, type IdFactory } from './domain/ids.js'
import type { ChatTransport, TransportEvent } from './ports/transport.js'
import {
  canSubmit,
  conversationReducer,
  createInitialState,
  type ConversationAction,
  type ConversationState,
} from './state/conversation.js'
import { createStore, type Store } from './state/store.js'

/**
 * Orquestador del SDK: une el transporte con la maquina de estados.
 *
 * Es la unica pieza del nucleo que conoce ambos lados, y aun asi solo depende
 * de la interfaz `ChatTransport`, nunca de una implementacion concreta. La
 * interfaz de usuario consume este objeto y no sabe si detras hay un mock, un
 * WebSocket o el agente definitivo.
 */

export interface ChatClientOptions {
  /** Implementacion del puerto. Se inyecta; el cliente jamas la construye. */
  readonly transport: ChatTransport
  readonly conversationId?: string
  /** Inyectables para que las pruebas sean deterministas. */
  readonly createMessageId?: IdFactory
  readonly now?: () => number
}

/**
 * Resultado de intentar enviar un mensaje.
 *
 * Se devuelve un resultado en lugar de lanzar una excepcion porque quien llama
 * es un manejador de evento de la interfaz: alli una excepcion se convierte en
 * un error no capturado, mientras que un motivo explicito se puede mostrar al
 * usuario.
 */
export type SendResult =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly reason: 'empty' | 'busy' | 'disconnected' | 'failed' }

export class ChatClient {
  readonly #transport: ChatTransport
  readonly #store: Store<ConversationState, ConversationAction>
  readonly #createMessageId: IdFactory
  readonly #now: () => number
  #unsubscribe: (() => void) | null = null
  #destroyed = false

  constructor(options: ChatClientOptions) {
    this.#transport = options.transport
    this.#createMessageId = options.createMessageId ?? createId
    this.#now = options.now ?? (() => Date.now())

    const conversationId = options.conversationId ?? createId()
    this.#store = createStore(conversationReducer, createInitialState(conversationId))

    this.#unsubscribe = this.#transport.subscribe((event) => {
      this.#handleTransportEvent(event)
    })
  }

  getState(): ConversationState {
    return this.#store.getSnapshot()
  }

  subscribe(listener: () => void): () => void {
    return this.#store.subscribe(listener)
  }

  /** Abre el canal. Los cambios de estado llegan por el flujo de eventos. */
  async connect(): Promise<void> {
    if (this.#destroyed) return
    await this.#transport.connect()
  }

  async sendMessage(text: string): Promise<SendResult> {
    const trimmed = text.trim()
    if (trimmed.length === 0) return { ok: false, reason: 'empty' }

    const state = this.#store.getSnapshot()
    if (state.phase !== 'idle') return { ok: false, reason: 'busy' }
    if (!canSubmit(state)) return { ok: false, reason: 'disconnected' }

    const messageId = this.#createMessageId()

    // El mensaje se pinta antes de que la red confirme nada: el usuario debe
    // ver su texto de inmediato. Si el envio falla, la accion de error lo
    // seniala sin borrarlo del hilo.
    this.#store.dispatch({ type: 'user/submit', messageId, text: trimmed, at: this.#now() })

    try {
      await this.#transport.send({
        conversationId: state.conversationId,
        messageId,
        text: trimmed,
      })
      return { ok: true, messageId }
    } catch (cause) {
      this.#store.dispatch({
        type: 'transport/error',
        error: {
          code: 'send_failed',
          message: cause instanceof Error ? cause.message : 'No se pudo enviar el mensaje.',
          recoverable: true,
        },
      })
      return { ok: false, reason: 'failed' }
    }
  }

  /** Limpia el hilo sin cerrar el canal. */
  resetConversation(conversationId?: string): void {
    this.#store.dispatch({
      type: 'conversation/reset',
      conversationId: conversationId ?? createId(),
    })
  }

  /** Da de baja la suscripcion y cierra el canal. Es idempotente. */
  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#unsubscribe?.()
    this.#unsubscribe = null
    this.#transport.disconnect()
  }

  #handleTransportEvent(event: TransportEvent): void {
    switch (event.type) {
      case 'status':
        this.#store.dispatch({ type: 'transport/status', status: event.status })
        return
      case 'message.start':
        this.#store.dispatch({ type: 'agent/start', messageId: event.messageId, at: this.#now() })
        return
      case 'message.delta':
        this.#store.dispatch({
          type: 'agent/delta',
          messageId: event.messageId,
          text: event.text,
        })
        return
      case 'message.end':
        this.#store.dispatch({ type: 'agent/end', messageId: event.messageId })
        return
      case 'error':
        this.#store.dispatch({
          type: 'transport/error',
          error: {
            code: event.code,
            message: event.message,
            recoverable: event.recoverable,
          },
        })
        return
    }
  }
}
