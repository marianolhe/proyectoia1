import type { AgentAction, AgentActionStatus } from '@agichat/core'
import { useEffect, useRef } from 'react'
import { isAllowedUrl, usePolicy } from '../policy.js'

/** Abre una URL en una pestania nueva y dice si el navegador lo permitio. */
export type UrlOpener = (url: string) => boolean

/**
 * `window.open` devuelve `null` cuando el bloqueador de ventanas emergentes
 * actua. No se pasa `noopener` como opcion porque entonces devuelve `null`
 * siempre y no habria forma de distinguir el bloqueo; se corta la referencia
 * a mano en su lugar.
 */
export const openInNewTab: UrlOpener = (url) => {
  const opened = window.open(url, '_blank')
  if (opened === null) return false
  opened.opener = null
  return true
}

/**
 * Ejecuta las acciones "abrir pestania" que pide el agente.
 *
 * Vive en la interfaz y no en el nucleo porque es lo unico que toca `window`.
 * Cada accion se intenta una sola vez: el registro por identificador evita que
 * el doble montaje de React en modo estricto abra dos pestanias.
 */
export function useOpenUrlActions(
  actions: readonly AgentAction[],
  resolveAction: (actionId: string, status: AgentActionStatus) => void,
  open: UrlOpener = openInNewTab,
): void {
  const policy = usePolicy()
  const handled = useRef(new Set<string>())

  useEffect(() => {
    for (const action of actions) {
      if (action.status !== 'pending' || handled.current.has(action.id)) continue
      handled.current.add(action.id)

      const allowed = isAllowedUrl(action.url, policy.openUrlHosts)
      resolveAction(action.id, allowed && open(action.url) ? 'opened' : 'blocked')
    }
  }, [actions, resolveAction, open, policy])
}
