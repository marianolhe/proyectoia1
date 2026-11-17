import type { AgentAction } from '@agichat/core'
import { isAllowedUrl, usePolicy } from '../policy.js'

export interface ActionNoticesProps {
  readonly actions: readonly AgentAction[]
  readonly openedLabel: string
  readonly blockedLabel: string
}

/** Solo las ultimas: son avisos del momento, no un historial. */
const VISIBLE_ACTIONS = 2

/**
 * Resultado de las pestanias que el agente intento abrir.
 *
 * Si el navegador bloqueo la ventana emergente, el usuario no debe quedarse
 * sin la pagina: se le ofrece el enlace para abrirla el mismo. Un destino
 * fuera de la lista permitida no se ofrece nunca.
 */
export function ActionNotices({ actions, openedLabel, blockedLabel }: ActionNoticesProps) {
  const policy = usePolicy()
  const visible = actions
    .filter((action) => action.status !== 'pending')
    .filter((action) => isAllowedUrl(action.url, policy.openUrlHosts))
    .slice(-VISIBLE_ACTIONS)

  if (visible.length === 0) return null

  return (
    <div className="agc-notices">
      {visible.map((action) => (
        <p key={action.id} className="agc-notice agc-notice--status" role="status">
          {action.status === 'opened' ? openedLabel : blockedLabel}{' '}
          <a href={action.url} target="_blank" rel="noopener noreferrer">
            {action.title}
          </a>
        </p>
      ))}
    </div>
  )
}
