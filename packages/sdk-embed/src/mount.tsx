import type { ChatTransport } from '@agichat/core'
import { WebSocketTransport } from '@agichat/transport-ws'
import { ChatWidget, type ChatLabels } from '@agichat/ui-react'
import widgetCss from '@agichat/ui-react/styles.css?inline'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

export interface MountOptions {
  /** Elemento o selector donde se inserta el widget. Por defecto, el body. */
  readonly target?: string | Element
  /** URL del agente. Se ignora si se pasa `transport`. */
  readonly wsUrl?: string
  /** Adaptador propio que cumpla ChatTransport, en lugar del WebSocket. */
  readonly transport?: ChatTransport
  readonly labels?: Partial<ChatLabels>
  readonly avatarSrc?: string
  /** `false` pinta el panel en linea dentro de `target`, sin burbuja. */
  readonly launcher?: boolean
  readonly defaultOpen?: boolean
}

export interface AGIChatInstance {
  /** Desmonta el widget, cierra el canal y retira el nodo del DOM. */
  unmount(): void
}

function resolveTarget(target: MountOptions['target']): Element {
  if (target === undefined) return document.body
  if (typeof target !== 'string') return target
  const found = document.querySelector(target)
  if (found === null) throw new Error(`AGIChat: no existe ningun elemento para "${target}".`)
  return found
}

function resolveTransport(options: MountOptions): ChatTransport {
  if (options.transport !== undefined) return options.transport
  if (options.wsUrl !== undefined) return new WebSocketTransport({ url: options.wsUrl })
  throw new Error('AGIChat: indique wsUrl o transport.')
}

/**
 * Monta el widget en cualquier pagina, use o no React.
 *
 * El widget vive dentro de un Shadow DOM: los estilos del sitio anfitrion no
 * lo alcanzan y los del widget no se escapan, sin depender de que el cliente
 * cargue una hoja de estilos aparte.
 */
export function mount(options: MountOptions): AGIChatInstance {
  const transport = resolveTransport(options)
  const host = document.createElement('div')
  host.setAttribute('data-agichat', '')
  resolveTarget(options.target).appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = widgetCss
  const container = document.createElement('div')
  shadow.append(style, container)

  const root = createRoot(container)
  root.render(
    <StrictMode>
      <ChatWidget
        transport={transport}
        launcher={options.launcher ?? true}
        defaultOpen={options.defaultOpen ?? false}
        {...(options.labels === undefined ? {} : { labels: options.labels })}
        {...(options.avatarSrc === undefined ? {} : { avatarSrc: options.avatarSrc })}
      />
    </StrictMode>,
  )

  let mounted = true
  return {
    unmount() {
      if (!mounted) return
      mounted = false
      root.unmount()
      host.remove()
    },
  }
}
