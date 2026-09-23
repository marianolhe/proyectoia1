/**
 * Validacion del protocolo de entrada.
 *
 * El servidor recibe trafico de sitios de terceros: cualquier cliente que
 * conozca la URL puede conectarse y mandar JSON arbitrario. Por eso cada
 * campo se valida por separado en lugar de castear el JSON parseado al tipo
 * esperado; un cast asumiria una forma que nadie garantiza.
 */

export interface InboundEnvelope {
  readonly conversationId: string
  readonly messageId: string
  readonly text: string
}

export type ParseResult =
  | { readonly ok: true; readonly message: InboundEnvelope }
  | { readonly ok: false; readonly reason: string }

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function parseInboundFrame(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'la trama debe ser un objeto JSON' }
  }

  const frame = raw as Record<string, unknown>

  if (!isNonEmptyString(frame.conversationId)) {
    return { ok: false, reason: 'conversationId debe ser una cadena no vacia' }
  }
  if (!isNonEmptyString(frame.messageId)) {
    return { ok: false, reason: 'messageId debe ser una cadena no vacia' }
  }
  if (typeof frame.text !== 'string') {
    return { ok: false, reason: 'text debe ser una cadena' }
  }
  if (frame.text.trim().length === 0) {
    return { ok: false, reason: 'text no puede estar vacio' }
  }

  return {
    ok: true,
    message: {
      conversationId: frame.conversationId,
      messageId: frame.messageId,
      text: frame.text,
    },
  }
}

export function parseInboundJson(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'la trama no es JSON valido' }
  }
  return parseInboundFrame(parsed)
}
