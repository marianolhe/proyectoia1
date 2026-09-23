import { describe, expect, it, vi } from 'vitest'
import type { TransportEvent } from '../ports/transport.js'
import { InMemoryTransport } from './in-memory-transport.js'

/** Recoge todos los eventos emitidos por un transporte. */
function record(transport: InMemoryTransport): TransportEvent[] {
  const events: TransportEvent[] = []
  transport.subscribe((event) => events.push(event))
  return events
}

describe('InMemoryTransport', () => {
  it('anuncia connecting y luego open al conectar', async () => {
    const transport = new InMemoryTransport()
    const events = record(transport)

    await transport.connect()

    expect(events).toEqual([
      { type: 'status', status: 'connecting' },
      { type: 'status', status: 'open' },
    ])
    expect(transport.status).toBe('open')
  })

  it('conectar dos veces es idempotente', async () => {
    const transport = new InMemoryTransport()
    await transport.connect()
    const events = record(transport)

    await transport.connect()

    expect(events).toEqual([])
  })

  it('registra los mensajes enviados', async () => {
    const transport = new InMemoryTransport()
    await transport.connect()

    await transport.send({ conversationId: 'c1', messageId: 'm1', text: 'Hola' })

    expect(transport.sent).toEqual([{ conversationId: 'c1', messageId: 'm1', text: 'Hola' }])
  })

  it('rechaza el envio si el canal no esta abierto', async () => {
    const transport = new InMemoryTransport()

    await expect(
      transport.send({ conversationId: 'c1', messageId: 'm1', text: 'Hola' }),
    ).rejects.toThrow('El transporte no esta abierto')
  })

  it('rechaza el envio cuando se fuerza el fallo', async () => {
    const transport = new InMemoryTransport({ failOnSend: true })
    await transport.connect()

    await expect(
      transport.send({ conversationId: 'c1', messageId: 'm1', text: 'Hola' }),
    ).rejects.toThrow('Fallo simulado de envio')
  })

  it('responde automaticamente cuando se configura autoRespond', async () => {
    const transport = new InMemoryTransport({
      autoRespond: (message) => `Recibi: ${message.text}`,
      chunkSize: 100,
    })
    await transport.connect()
    const events = record(transport)

    await transport.send({ conversationId: 'c1', messageId: 'm1', text: 'Hola' })

    expect(events).toEqual([
      { type: 'message.start', messageId: 'm1-reply' },
      { type: 'message.delta', messageId: 'm1-reply', text: 'Recibi: Hola' },
      { type: 'message.end', messageId: 'm1-reply' },
    ])
  })

  it('no responde cuando autoRespond devuelve undefined', async () => {
    const transport = new InMemoryTransport({ autoRespond: () => undefined })
    await transport.connect()
    const events = record(transport)

    await transport.send({ conversationId: 'c1', messageId: 'm1', text: 'Hola' })

    expect(events).toEqual([])
  })

  it('trocea la respuesta segun chunkSize para imitar el streaming', () => {
    const transport = new InMemoryTransport({ chunkSize: 3 })
    const events = record(transport)

    transport.respondWith('abcdefg', 'a1')

    const deltas = events.filter((event) => event.type === 'message.delta')
    expect(deltas.map((event) => (event.type === 'message.delta' ? event.text : ''))).toEqual([
      'abc',
      'def',
      'g',
    ])
  })

  it('con chunkSize no positivo emite el texto en un solo fragmento', () => {
    const transport = new InMemoryTransport({ chunkSize: 0 })
    const events = record(transport)

    transport.respondWith('abcdefg', 'a1')

    expect(events.filter((event) => event.type === 'message.delta')).toHaveLength(1)
  })

  it('emite errores del agente', () => {
    const transport = new InMemoryTransport()
    const events = record(transport)

    transport.failWith('agent_down', 'El agente no esta disponible.', false)

    expect(events).toEqual([
      {
        type: 'error',
        code: 'agent_down',
        message: 'El agente no esta disponible.',
        recoverable: false,
      },
    ])
  })

  it('al desconectar anuncia closed y descarta los suscriptores', async () => {
    const transport = new InMemoryTransport()
    await transport.connect()
    const listener = vi.fn()
    transport.subscribe(listener)

    transport.disconnect()
    transport.emit({ type: 'message.end', messageId: 'a1' })

    expect(listener).toHaveBeenCalledExactlyOnceWith({ type: 'status', status: 'closed' })
    expect(transport.status).toBe('closed')
  })

  it('desconectar dos veces es idempotente', async () => {
    const transport = new InMemoryTransport()
    await transport.connect()
    transport.disconnect()
    const listener = vi.fn()
    transport.subscribe(listener)

    transport.disconnect()

    expect(listener).not.toHaveBeenCalled()
  })

  it('permite darse de baja de forma individual', () => {
    const transport = new InMemoryTransport()
    const listener = vi.fn()
    const unsubscribe = transport.subscribe(listener)

    unsubscribe()
    transport.emit({ type: 'message.end', messageId: 'a1' })

    expect(listener).not.toHaveBeenCalled()
  })
})
