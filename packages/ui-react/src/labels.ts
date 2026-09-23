/**
 * Textos visibles del widget.
 *
 * Viven en un solo objeto, y no dispersos en cada componente, para que un
 * integrador pueda traducir o cambiar el tono del asistente pasando `labels`
 * sin tener que envolver ni reescribir componentes.
 */
export interface ChatLabels {
  readonly assistantName: string
  readonly title: string
  readonly subtitle: string
  readonly placeholder: string
  readonly send: string
  readonly typing: string
  readonly interrupted: string
  readonly openChat: string
  readonly closeChat: string
  readonly connecting: string
  readonly reconnecting: string
  readonly disconnected: string
  readonly messagesRegion: string
}

export const DEFAULT_LABELS: ChatLabels = {
  assistantName: 'Sofía',
  title: '¡Hola soy tu asistente virtual Sofía!',
  subtitle: 'Escribe una duda y yo te ayudaré en lo que pueda',
  placeholder: 'Escribe tu mensaje',
  send: 'Enviar mensaje',
  typing: 'Sofía está escribiendo',
  interrupted: 'La respuesta se interrumpió antes de terminar.',
  openChat: 'Abrir el chat con Sofía',
  closeChat: 'Cerrar el chat',
  connecting: 'Conectando con el asistente…',
  reconnecting: 'Se perdió la conexión. Reintentando…',
  disconnected: 'Sin conexión con el asistente.',
  messagesRegion: 'Conversación',
}

export function resolveLabels(overrides: Partial<ChatLabels> | undefined): ChatLabels {
  return overrides === undefined ? DEFAULT_LABELS : { ...DEFAULT_LABELS, ...overrides }
}
