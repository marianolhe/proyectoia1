import {
  canSubmit,
  createInitialState,
  isAgentResponding,
  type AgentAction,
  type AgentActionStatus,
  type ChatClient,
  type ConversationState,
  type Message,
  type SendResult,
} from '@agichat/core'
import { useCallback, useSyncExternalStore } from 'react'

export interface UseChatResult {
  readonly state: ConversationState
  readonly messages: readonly Message[]
  readonly actions: readonly AgentAction[]
  readonly canSubmit: boolean
  readonly isResponding: boolean
  sendMessage(text: string): Promise<SendResult>
  reset(): void
  resolveAction(actionId: string, status: AgentActionStatus): void
}

// Instantanea fija mientras no hay cliente: useSyncExternalStore exige que
// getSnapshot devuelva la misma referencia entre llamadas o entra en bucle.
const PENDING_STATE = createInitialState('pending')
const NOT_CONNECTED: SendResult = { ok: false, reason: 'disconnected' }
const noopUnsubscribe = () => {}

/**
 * Puente entre el nucleo y React.
 *
 * Acepta `null` porque el cliente propio del widget se crea dentro de un
 * efecto (ver use-owned-client): durante el primer render todavia no existe y
 * la interfaz debe poder pintarse igual, deshabilitada.
 */
export function useChat(client: ChatClient | null): UseChatResult {
  const subscribe = useCallback(
    (listener: () => void) => (client === null ? noopUnsubscribe : client.subscribe(listener)),
    [client],
  )
  const getSnapshot = useCallback(
    () => (client === null ? PENDING_STATE : client.getState()),
    [client],
  )

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const sendMessage = useCallback(
    (text: string) => (client === null ? Promise.resolve(NOT_CONNECTED) : client.sendMessage(text)),
    [client],
  )
  const reset = useCallback(() => client?.resetConversation(), [client])
  const resolveAction = useCallback(
    (actionId: string, status: AgentActionStatus) => client?.resolveAction(actionId, status),
    [client],
  )

  return {
    state,
    messages: state.messages,
    actions: state.actions,
    canSubmit: canSubmit(state),
    isResponding: isAgentResponding(state),
    sendMessage,
    reset,
    resolveAction,
  }
}
