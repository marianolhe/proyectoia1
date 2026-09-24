import type { TransportEvent } from '@agichat/core'
import { describe, expect, it, vi } from 'vitest'
import { InBrowserMockTransport } from './in-browser-transport.js'
import * as browserEntry from './browser.js'

const FAST_TIMING = { startDelayMs: 0, deltaDelayMs: 0, chunkSize: 50 }

function setup() {
  const transport = new InBrowserMockTransport({ timing: FAST_TIMING })
  const events: TransportEvent[] = []
  transport.subscribe((event) => events.push(event))
  return { transport, events }
}

describe('InBrowserMockTransport', () => {
  it('responde con el Markdown de demostracion en streaming', async () => {
    const { transport, events } = setup()
    await transport.connect()
    await transport.send({ conversationId: 'c', messageId: 'm1', text: 'hola' })

    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('message.end'))
    const text = events.map((event) => (event.type === 'message.delta' ? event.text : '')).join('')
    expect(events[0]).toEqual({ type: 'status', status: 'open' })
    expect(text).toContain('| Ruta | Distancia | ETA |')
  })

  it('reproduce el escenario de fallo del agente', async () => {
    const { transport, events } = setup()
    await transport.connect()
    await transport.send({ conversationId: 'c', messageId: 'm1', text: 'simula un error' })

    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ code: 'agent_unavailable' }))
  })

  it('rechaza enviar antes de conectar', async () => {
    const { transport } = setup()
    await expect(
      transport.send({ conversationId: 'c', messageId: 'm1', text: 'hola' }),
    ).rejects.toThrow('no esta abierto')
  })

  it('tras disconnect calla el turno en curso y deja de notificar', async () => {
    const { transport, events } = setup()
    await transport.connect()
    await transport.send({ conversationId: 'c', messageId: 'm1', text: 'hola' })
    transport.disconnect()
    transport.disconnect()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(transport.status).toBe('closed')
    expect(events.map((event) => event.type)).toEqual(['status', 'status'])
  })

  it('permite dar de baja un oyente', async () => {
    const transport = new InBrowserMockTransport()
    const listener = vi.fn()
    transport.subscribe(listener)()

    await transport.connect()
    expect(listener).not.toHaveBeenCalled()
  })

  it('la entrada de navegador solo expone el transporte', () => {
    expect(Object.keys(browserEntry)).toEqual(['InBrowserMockTransport'])
  })
})
