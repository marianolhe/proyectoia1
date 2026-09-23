import type { ChatClient, ChatTransport } from '@agichat/core'
import { useId, useState } from 'react'
import { useChat } from '../hooks/use-chat.js'
import { useOwnedClient } from '../hooks/use-owned-client.js'
import { resolveLabels, type ChatLabels } from '../labels.js'
import { ChatPanel } from './chat-panel.js'
import { Launcher } from './launcher.js'

/**
 * El widget recibe el canal ya construido; nunca lo instancia. Por eso el
 * cambio al agente real de Fase 2 consiste en inyectar otro objeto que cumpla
 * `ChatTransport`, sin tocar ningun componente.
 *
 * - `transport`: el widget arma su propio ChatClient, lo conecta al montarse y
 *   lo destruye (cerrando el transporte) al desmontarse.
 * - `client`: el integrador ya tiene un ChatClient y conserva su ciclo de
 *   vida; el widget solo lo observa. Sirve para compartir una conversacion
 *   entre varias vistas.
 */
export type ChatConnectionProps =
  | { readonly transport: ChatTransport; readonly client?: never }
  | { readonly client: ChatClient; readonly transport?: never }

export type ChatWidgetProps = ChatConnectionProps & {
  /**
   * Con `false` el panel se pinta en linea, siempre abierto y sin burbuja
   * flotante, para integrarlo dentro de una pagina existente.
   */
  readonly launcher?: boolean
  /** Solo aplica con burbuja: si el panel arranca abierto. */
  readonly defaultOpen?: boolean
  readonly labels?: Partial<ChatLabels>
  readonly avatarSrc?: string
  readonly className?: string
}

export function ChatWidget(props: ChatWidgetProps) {
  const { launcher = true, defaultOpen = false, avatarSrc, className } = props

  const ownedClient = useOwnedClient(props.transport ?? null)
  const chat = useChat(props.client ?? ownedClient)
  const labels = resolveLabels(props.labels)

  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  const mode = launcher ? 'agc-widget--floating' : 'agc-widget--inline'
  const classes = ['agc-widget', mode, className].filter(Boolean).join(' ')
  const panelVisible = !launcher || open

  return (
    <div className={classes}>
      {/* Se oculta en vez de desmontarse: asi el hilo, el borrador y la
          posicion de scroll sobreviven a cerrar y abrir la burbuja. */}
      <div className="agc-widget__panel" hidden={!panelVisible}>
        <ChatPanel
          chat={chat}
          labels={labels}
          id={panelId}
          {...(avatarSrc === undefined ? {} : { avatarSrc })}
        />
      </div>
      {launcher && (
        <Launcher
          open={open}
          controls={panelId}
          openLabel={labels.openChat}
          closeLabel={labels.closeChat}
          onToggle={() => setOpen((current) => !current)}
        />
      )}
    </div>
  )
}
