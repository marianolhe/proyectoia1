import type { AgentEvent } from '@agichat/core'
import { WebSocket } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { startMockServer, type MockServerHandle } from './server.js'

/**
 * Pruebas de integracion del servidor real, contra un puerto efimero
 * (`port: 0`) para no chocar con otro proceso ni con un puerto fijo en CI.
 * Los tiempos de streaming se anulan a cero: solo se ejercita el cableado
 * del socket, la logica de timing ya esta cubierta en streaming.test.ts.
 */

let handle: MockServerHandle | undefined

afterEach(async () => {
  await handle?.close()
  handle = undefined
})

function connect(port: number): Promise<WebSocket> {
  const socket = new WebSocket(`ws://localhost:${port}`)
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

/** Acumula eventos hasta que llega uno terminal (`message.end` o `error`). */
function collectUntilSettled(socket: WebSocket): Promise<AgentEvent[]> {
  return new Promise((resolve) => {
    const events: AgentEvent[] = []
    socket.on('message', (raw) => {
      const event = JSON.parse(raw.toString()) as AgentEvent
      events.push(event)
      if (event.type === 'message.end' || event.type === 'error') resolve(events)
    })
  })
}

describe('startMockServer', () => {
  it('responde a un mensaje valido con start, deltas y end', async () => {
    handle = await startMockServer({ port: 0, timing: { startDelayMs: 0, deltaDelayMs: 0 } })
    const socket = await connect(handle.port)

    const received = collectUntilSettled(socket)
    socket.send(JSON.stringify({ conversationId: 'c', messageId: 'm', text: 'hola agente' }))
    const events = await received

    expect(events[0]).toEqual({ type: 'message.start', messageId: 'm-reply' })
    expect(events.at(-1)).toEqual({ type: 'message.end', messageId: 'm-reply' })

    socket.close()
  })

  it('responde con un evento de error ante una trama invalida', async () => {
    handle = await startMockServer({ port: 0 })
    const socket = await connect(handle.port)

    const received = collectUntilSettled(socket)
    socket.send('esto no es json')
    const [event] = await received

    expect(event).toEqual({
      type: 'error',
      code: 'invalid_frame',
      message: expect.any(String),
      recoverable: true,
    })

    socket.close()
  })

  it('responde con un error de agente cuando el texto pide fallar', async () => {
    handle = await startMockServer({ port: 0, timing: { startDelayMs: 0 } })
    const socket = await connect(handle.port)

    const received = collectUntilSettled(socket)
    socket.send(JSON.stringify({ conversationId: 'c', messageId: 'm', text: 'simula un fallo' }))
    const [event] = await received

    expect(event).toMatchObject({ type: 'error', code: 'agent_unavailable' })

    socket.close()
  })

  it('cierra el servidor y libera el puerto', async () => {
    handle = await startMockServer({ port: 0 })
    const port = handle.port

    await handle.close()
    handle = undefined

    // El puerto queda libre: se puede volver a levantar un servidor sobre el.
    const reopened = await startMockServer({ port })
    expect(reopened.port).toBe(port)
    await reopened.close()
  })
})
