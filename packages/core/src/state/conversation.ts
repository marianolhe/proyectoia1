import type {
  ConversationError,
  ConversationPhase,
  Message,
  MessageStatus,
} from '../domain/types.js'
import type { TransportStatus } from '../ports/transport.js'

/**
 * Maquina de estados de la conversacion, escrita como reductor puro.
 *
 * Es una funcion sin efectos: recibe un estado y una accion, devuelve un estado
 * nuevo. Esa pureza permite probar cada transicion sin levantar un servidor ni
 * montar un componente, y es lo que mantiene la cobertura alta sin pruebas
 * fragiles.
 */

export interface ConversationState {
  readonly conversationId: string
  readonly messages: readonly Message[]
  readonly phase: ConversationPhase
  readonly connection: TransportStatus
  readonly error: ConversationError | null
}

export type ConversationAction =
  | {
      readonly type: 'user/submit'
      readonly messageId: string
      readonly text: string
      readonly at: number
    }
  | { readonly type: 'agent/start'; readonly messageId: string; readonly at: number }
  | { readonly type: 'agent/delta'; readonly messageId: string; readonly text: string }
  | { readonly type: 'agent/end'; readonly messageId: string }
  | { readonly type: 'transport/status'; readonly status: TransportStatus }
  | { readonly type: 'transport/error'; readonly error: ConversationError }
  | { readonly type: 'conversation/reset'; readonly conversationId: string }

export function createInitialState(conversationId: string): ConversationState {
  return {
    conversationId,
    messages: [],
    phase: 'idle',
    connection: 'idle',
    error: null,
  }
}

/**
 * Reemplaza un mensaje por su version modificada, conservando el orden.
 * Si el identificador no existe devuelve la misma referencia de lista, para
 * que los consumidores puedan comparar por identidad y evitar repintados.
 */
function mapMessage(
  messages: readonly Message[],
  messageId: string,
  update: (message: Message) => Message,
): readonly Message[] {
  let found = false
  const next = messages.map((message) => {
    if (message.id !== messageId) return message
    found = true
    return update(message)
  })
  return found ? next : messages
}

/** Cierra cualquier respuesta a medio escribir, conservando el texto recibido. */
function settleStreamingMessages(
  messages: readonly Message[],
  status: MessageStatus,
): readonly Message[] {
  if (!messages.some((message) => message.status === 'streaming')) return messages
  return messages.map((message) =>
    message.status === 'streaming' ? { ...message, status } : message,
  )
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case 'user/submit': {
      const message: Message = {
        id: action.messageId,
        role: 'user',
        content: action.text,
        status: 'complete',
        createdAt: action.at,
      }
      return {
        ...state,
        messages: [...state.messages, message],
        phase: 'sending',
        error: null,
      }
    }

    case 'agent/start': {
      // El agente puede reenviar un `start` tras una reconexion; no se duplica.
      if (state.messages.some((message) => message.id === action.messageId)) {
        return { ...state, phase: 'streaming' }
      }

      const message: Message = {
        id: action.messageId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: action.at,
      }
      return {
        ...state,
        messages: [...state.messages, message],
        phase: 'streaming',
        error: null,
      }
    }

    case 'agent/delta': {
      const messages = mapMessage(state.messages, action.messageId, (message) => ({
        ...message,
        content: message.content + action.text,
      }))
      // Un delta para un mensaje desconocido se descarta en silencio: es ruido
      // de la red, no una razon para romper la conversacion del usuario.
      if (messages === state.messages) return state
      return { ...state, messages, phase: 'streaming' }
    }

    case 'agent/end': {
      const messages = mapMessage(state.messages, action.messageId, (message) => ({
        ...message,
        status: 'complete',
      }))
      if (messages === state.messages) return state
      return { ...state, messages, phase: 'idle' }
    }

    case 'transport/status': {
      if (state.connection === action.status) return state

      // Si el canal muere con una respuesta a medias, esa respuesta se marca
      // como fallida en lugar de quedarse girando para siempre.
      const channelIsDown = action.status === 'closed' || action.status === 'error'
      if (channelIsDown) {
        const messages = settleStreamingMessages(state.messages, 'error')
        return {
          ...state,
          connection: action.status,
          messages,
          phase: messages === state.messages ? state.phase : 'idle',
        }
      }

      return { ...state, connection: action.status }
    }

    case 'transport/error': {
      const messages = settleStreamingMessages(state.messages, 'error')
      return { ...state, messages, phase: 'idle', error: action.error }
    }

    case 'conversation/reset': {
      // El estado de la conexion sobrevive: limpiar el hilo no cierra el canal.
      return { ...createInitialState(action.conversationId), connection: state.connection }
    }
  }
}

/** Indica si la interfaz debe mostrar el indicador de "escribiendo". */
export function isAgentResponding(state: ConversationState): boolean {
  return state.phase === 'sending' || state.phase === 'streaming'
}

/** Indica si el usuario puede enviar un mensaje nuevo en este momento. */
export function canSubmit(state: ConversationState): boolean {
  return state.phase === 'idle' && state.connection === 'open'
}
