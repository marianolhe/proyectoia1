import { describe, expect, it } from 'vitest'
import { ChatClient } from './chat-client.js'
import { InMemoryTransport } from './testing/in-memory-transport.js'

async function connected() {
  const transport = new InMemoryTransport()
  let counter = 0
  const client = new ChatClient({
    transport,
    conversationId: 'conv',
    createMessageId: () => `m${++counter}`,
    now: () => 1,
  })
  await client.connect()
  return { client, transport }
}

describe('ChatClient con el agente real', () => {
  it('el primer mensaje viaja sin historial', async () => {
    const { client, transport } = await connected()
    await client.sendMessage('Hola')

    expect(transport.sent[0]).toEqual({ conversationId: 'conv', messageId: 'm1', text: 'Hola' })
  })

  it('los siguientes llevan los turnos completos anteriores', async () => {
    const { client, transport } = await connected()
    await client.sendMessage('Hola')
    transport.respondWith('¡Hola! ¿Qué película buscas?', 'r1')
    await client.sendMessage('Una de terror')

    expect(transport.sent[1]?.history).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¡Hola! ¿Qué película buscas?' },
    ])
  })

  it('no envia respuestas interrumpidas como historial', async () => {
    const { client, transport } = await connected()
    await client.sendMessage('Hola')
    transport.emit({ type: 'message.start', messageId: 'r1' })
    transport.emit({ type: 'message.delta', messageId: 'r1', text: 'a medias' })
    transport.failWith('x', 'fallo')
    await client.sendMessage('otra vez')

    expect(transport.sent[1]?.history).toEqual([{ role: 'user', content: 'Hola' }])
  })

  it('limita el historial a los ultimos 12 turnos', async () => {
    const { client, transport } = await connected()
    for (let turn = 0; turn < 8; turn += 1) {
      await client.sendMessage(`pregunta ${turn}`)
      transport.respondWith(`respuesta ${turn}`, `r${turn}`)
    }
    await client.sendMessage('ultima')

    const history = transport.sent.at(-1)?.history ?? []
    expect(history).toHaveLength(12)
    expect(history[0]).toEqual({ role: 'user', content: 'pregunta 2' })
  })

  it('traduce imagenes y acciones del agente', async () => {
    const { client, transport } = await connected()
    await client.sendMessage('Recomiéndame algo')
    transport.emit({ type: 'message.start', messageId: 'r1' })
    transport.emit({
      type: 'message.image',
      messageId: 'r1',
      url: 'https://image.tmdb.org/t/p/w342/a.jpg',
      alt: 'Póster',
    })
    transport.emit({ type: 'message.end', messageId: 'r1' })
    transport.emit({
      type: 'action.open_url',
      actionId: 'a1',
      url: 'https://www.imdb.com/title/tt1/',
      title: 'IMDb',
    })

    const state = client.getState()
    expect(state.messages[1]?.images).toEqual([
      { url: 'https://image.tmdb.org/t/p/w342/a.jpg', alt: 'Póster' },
    ])
    expect(state.actions[0]).toMatchObject({ id: 'a1', status: 'pending' })

    client.resolveAction('a1', 'blocked')
    expect(client.getState().actions[0]?.status).toBe('blocked')
  })
})
