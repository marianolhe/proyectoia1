import { InMemoryTransport } from '@agichat/core'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type AGIChatInstance } from './mount.js'

// Le dice a React que este entorno de pruebas envuelve los cambios en act().
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let instance: AGIChatInstance | null = null

afterEach(() => {
  act(() => instance?.unmount())
  instance = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function host(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-agichat]')
  if (element === null) throw new Error('no se monto el host')
  return element
}

describe('mount', () => {
  it('monta el widget dentro de un Shadow DOM con sus estilos', async () => {
    const transport = new InMemoryTransport()
    await act(async () => {
      instance = mount({ transport })
    })

    const shadow = host().shadowRoot
    expect(host().parentElement).toBe(document.body)
    expect(shadow?.querySelector('style')).not.toBeNull()
    expect(shadow?.querySelector('.agc-widget--floating')).not.toBeNull()
    // El widget se conecta solo al montarse.
    expect(transport.status).toBe('open')
  })

  it('aisla el widget: el documento anfitrion no ve sus nodos', async () => {
    await act(async () => {
      instance = mount({ transport: new InMemoryTransport() })
    })

    expect(document.querySelector('.agc-widget')).toBeNull()
  })

  it('acepta un selector, modo en linea y textos propios', async () => {
    document.body.innerHTML = '<section id="soporte"></section>'
    await act(async () => {
      instance = mount({
        target: '#soporte',
        transport: new InMemoryTransport(),
        launcher: false,
        labels: { title: 'Soporte AGIChat' },
        avatarSrc: '/avatar.png',
      })
    })

    const shadow = host().shadowRoot
    expect(host().parentElement?.id).toBe('soporte')
    expect(shadow?.querySelector('.agc-widget--inline')).not.toBeNull()
    expect(shadow?.querySelector('.agc-header__title')?.textContent).toBe('Soporte AGIChat')
    expect(shadow?.querySelector('img')?.getAttribute('src')).toBe('/avatar.png')
  })

  it('acepta un elemento como destino', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    await act(async () => {
      instance = mount({ target, transport: new InMemoryTransport(), defaultOpen: true })
    })

    expect(host().parentElement).toBe(target)
  })

  it('unmount retira el nodo y cierra el canal; repetirlo no falla', async () => {
    const transport = new InMemoryTransport()
    await act(async () => {
      instance = mount({ transport })
    })

    act(() => instance?.unmount())
    act(() => instance?.unmount())

    expect(document.querySelector('[data-agichat]')).toBeNull()
    expect(transport.status).toBe('closed')
  })

  it('con wsUrl construye el adaptador WebSocket', async () => {
    const urls: string[] = []
    class FakeWebSocket {
      readonly readyState = 0
      constructor(url: string) {
        urls.push(url)
      }
      addEventListener() {}
      send() {}
      close() {}
    }
    vi.stubGlobal('WebSocket', FakeWebSocket)

    await act(async () => {
      instance = mount({ wsUrl: 'wss://agente.ejemplo/chat' })
    })

    expect(urls[0]).toBe('wss://agente.ejemplo/chat')
  })

  it('falla con un mensaje claro si falta el destino o el canal', () => {
    expect(() => mount({ target: '#no-existe', transport: new InMemoryTransport() })).toThrow(
      'no existe ningun elemento',
    )
    expect(() => mount({})).toThrow('indique wsUrl o transport')
  })
})
