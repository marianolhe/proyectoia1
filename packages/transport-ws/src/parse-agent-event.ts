import type { TransportEvent } from '@agichat/core'

/**
 * Validacion de lo que llega por el socket.
 *
 * El backend es otro proceso, y en Fase 2 otro equipo: una trama con otra
 * forma no debe romper el estado de la conversacion. Cada campo se revisa en
 * lugar de castear el JSON; lo que no encaja se convierte en un evento de
 * error recuperable que la interfaz sabe mostrar.
 */

const INVALID_EVENT_CODE = 'invalid_event'

function invalid(reason: string): TransportEvent {
  return {
    type: 'error',
    code: INVALID_EVENT_CODE,
    message: `El agente envio una respuesta con formato invalido: ${reason}.`,
    recoverable: true,
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function parseAgentEvent(data: unknown): TransportEvent {
  if (!isString(data)) return invalid('la trama no es texto')

  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return invalid('la trama no es JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return invalid('la trama no es un objeto')
  }

  const frame = parsed as Record<string, unknown>

  switch (frame.type) {
    case 'message.start':
    case 'message.end':
      if (!isString(frame.messageId)) return invalid('falta messageId')
      return { type: frame.type, messageId: frame.messageId }
    case 'message.delta':
      if (!isString(frame.messageId)) return invalid('falta messageId')
      if (!isString(frame.text)) return invalid('falta text')
      return { type: 'message.delta', messageId: frame.messageId, text: frame.text }
    case 'error':
      if (!isString(frame.code) || !isString(frame.message)) return invalid('error incompleto')
      return {
        type: 'error',
        code: frame.code,
        message: frame.message,
        recoverable: frame.recoverable === true,
      }
    default:
      return invalid('tipo de evento desconocido')
  }
}
