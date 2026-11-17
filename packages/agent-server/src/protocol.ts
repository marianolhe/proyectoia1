import type { HistoryEntry, OutboundMessage } from '@agichat/core'

/**
 * Validacion de las tramas que llegan del widget.
 *
 * Es el mismo contrato que usaba el agente simulado del proyecto 1, mas el
 * historial. Cualquiera que conozca la URL puede conectarse y mandar JSON
 * arbitrario, asi que se valida campo por campo y se acota todo lo que crece.
 */

export type ParseResult =
  | { readonly ok: true; readonly message: OutboundMessage }
  | { readonly ok: false; readonly reason: string }

const MAX_ID_LENGTH = 128
const MAX_HISTORY_ENTRIES = 12
const MAX_HISTORY_CONTENT = 4000

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

/**
 * El historial lo manda el cliente, asi que no es de fiar: se ignoran las
 * entradas mal formadas y se recorta en vez de rechazar el mensaje entero.
 */
function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: HistoryEntry[] = []
  for (const item of raw.slice(-MAX_HISTORY_ENTRIES)) {
    if (typeof item !== 'object' || item === null) continue
    const { role, content } = item as Record<string, unknown>
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue
    if (content.trim().length === 0) continue
    entries.push({ role, content: content.slice(0, MAX_HISTORY_CONTENT) })
  }
  return entries
}

export function parseInboundJson(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'la trama no es JSON valido' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'la trama debe ser un objeto JSON' }
  }

  const frame = parsed as Record<string, unknown>
  if (!isId(frame.conversationId)) return { ok: false, reason: 'conversationId invalido' }
  if (!isId(frame.messageId)) return { ok: false, reason: 'messageId invalido' }
  if (typeof frame.text !== 'string' || frame.text.trim().length === 0) {
    return { ok: false, reason: 'text no puede estar vacio' }
  }

  const history = parseHistory(frame.history)
  return {
    ok: true,
    message: {
      conversationId: frame.conversationId,
      messageId: frame.messageId,
      text: frame.text,
      ...(history.length === 0 ? {} : { history }),
    },
  }
}
