import type { ConversationError, TransportStatus } from '@agichat/core'
import type { ChatLabels } from '../labels.js'

export interface ConnectionNoticeProps {
  readonly connection: TransportStatus
  readonly error: ConversationError | null
  readonly labels: ChatLabels
}

function connectionMessage(connection: TransportStatus, labels: ChatLabels): string | null {
  switch (connection) {
    case 'connecting':
      return labels.connecting
    case 'reconnecting':
      return labels.reconnecting
    case 'closed':
    case 'error':
      return labels.disconnected
    // 'idle' es el instante previo a conectar: avisar ahi solo produciria un
    // parpadeo en cada apertura del panel.
    case 'idle':
    case 'open':
      return null
  }
}

/**
 * Avisos de canal y de agente.
 *
 * Son dos avisos separados porque vienen de dos maquinas de estado separadas:
 * el canal puede estar abierto y el agente haber fallado, o al reves.
 */
export function ConnectionNotice({ connection, error, labels }: ConnectionNoticeProps) {
  const status = connectionMessage(connection, labels)
  if (status === null && error === null) return null

  return (
    <div className="agc-notices">
      {status !== null && (
        <p className="agc-notice agc-notice--status" role="status">
          {status}
        </p>
      )}
      {error !== null && (
        <p className="agc-notice agc-notice--error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  )
}
