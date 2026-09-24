import type { TransportEvent, TransportStatus } from '@agichat/core'
import { startMockServer, type MockServerHandle } from '@agichat/mock-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { backoffDelay, WebSocketTransport, type WebSocketLike } from './websocket-transport.js'

const FAST_TIMING = { startDelayMs: 0, deltaDelayMs: 0, chunkSize: 40 }
const FAST_RECONNECT = { initialDelayMs: 10, maxDelayMs: 40, maxAttempts: 20 }

const createWsSocket = (url: string): WebSocketLike => new WebSocket(url)

let server: MockServerHandle | null = null
let transport: WebSocketTransport | null = null

afterEach(async () => {
  transport?.disconnect()
  transport = null
  await server?.close()
  server = null
  vi.unstubAllGlobals()
})

function collect(target: WebSocketTransport) {
  const events: TransportEvent[] = []
  target.subscribe((event) => events.push(event))
  const statuses = () =>
    events
      .filter((event) => event.type === 'status')
      .map((event) => (event as { status: TransportStatus }).status)
  return { events, statuses }
}

function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  return vi.waitFor(
    () => {
      if (!condition()) throw new Error('condicion no cumplida')
    },
    { timeout: timeoutMs, interval: 5 },
  )
}

async function startServer(port = 0) {
  server = await startMockServer({ port, timing: FAST_TIMING })
  return server
}

function newTransport(url: string) {
  transport = new WebSocketTransport({
    url,
    createSocket: createWsSocket,
    reconnect: FAST_RECONNECT,
  })
  return transport
}

describe('WebSocketTransport contra el servidor mock', () => {
  it('abre el canal, envia un mensaje y recibe la respuesta en streaming', async () => {
    const { port } = await startServer()
    const ws = newTransport(`ws://127.0.0.1:${port}`)
    const { events, statuses } = collect(ws)

    await ws.connect()
    expect(ws.status).toBe('open')
    expect(statuses()).toEqual(['connecting', 'open'])

    await ws.send({ conversationId: 'c1', messageId: 'm1', text: 'hola' })
    await waitFor(() => events.some((event) => event.type === 'message.end'))

    const text = events.map((event) => (event.type === 'message.delta' ? event.text : '')).join('')
    expect(events.find((event) => event.type === 'message.start')).toEqual({
      type: 'message.start',
      messageId: 'm1-reply',
    })
    expect(text).toContain('| Ruta | Distancia | ETA |')
    expect(text).toContain('```ts')
  })

  it('traslada el fallo del agente como evento de error', async () => {
    const { port } = await startServer()
    const ws = newTransport(`ws://127.0.0.1:${port}`)
    const { events } = collect(ws)

    await ws.connect()
    await ws.send({ conversationId: 'c1', messageId: 'm1', text: 'provoca un error' })
    await waitFor(() => events.some((event) => event.type === 'error'))

    expect(events.find((event) => event.type === 'error')).toMatchObject({
      code: 'agent_unavailable',
      recoverable: true,
    })
  })

  it('connect es idempotente: no abre un segundo socket', async () => {
    const { port } = await startServer()
    const factory = vi.fn(createWsSocket)
    transport = new WebSocketTransport({ url: `ws://127.0.0.1:${port}`, createSocket: factory })

    await Promise.all([transport.connect(), transport.connect()])
    await transport.connect()

    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('reintenta con espera exponencial y vuelve a abrir cuando el servidor regresa', async () => {
    const first = await startServer()
    const ws = newTransport(`ws://127.0.0.1:${first.port}`)
    const { statuses } = collect(ws)
    await ws.connect()

    await first.close()
    server = null
    await waitFor(() => statuses().includes('reconnecting'))
    expect(ws.status).toBe('reconnecting')
    await expect(ws.send({ conversationId: 'c', messageId: 'm', text: 'x' })).rejects.toThrow(
      'no esta abierto',
    )

    await startServer(first.port)
    await waitFor(() => ws.status === 'open')
    expect(statuses().slice(-2)).toEqual(['reconnecting', 'open'])
  })

  it('al cerrar con disconnect no reintenta y queda en closed', async () => {
    const { port } = await startServer()
    const factory = vi.fn(createWsSocket)
    transport = new WebSocketTransport({
      url: `ws://127.0.0.1:${port}`,
      createSocket: factory,
      reconnect: FAST_RECONNECT,
    })
    const { statuses } = collect(transport)
    await transport.connect()

    transport.disconnect()
    transport.disconnect()
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(transport.status).toBe('closed')
    expect(statuses().at(-1)).toBe('closed')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('puede volver a conectarse despues de un disconnect', async () => {
    const { port } = await startServer()
    const ws = newTransport(`ws://127.0.0.1:${port}`)
    await ws.connect()
    ws.disconnect()

    await ws.connect()
    expect(ws.status).toBe('open')
  })

  it('rechaza el primer connect si no hay servidor, pero sigue reintentando', async () => {
    const ws = newTransport('ws://127.0.0.1:9')
    const { statuses } = collect(ws)

    await expect(ws.connect()).rejects.toThrow('No se pudo conectar')
    await waitFor(() => statuses().filter((status) => status === 'reconnecting').length >= 1)
  })

  it('se rinde y pasa a error al agotar los reintentos', async () => {
    transport = new WebSocketTransport({
      url: 'ws://127.0.0.1:9',
      createSocket: createWsSocket,
      reconnect: { initialDelayMs: 1, maxDelayMs: 2, maxAttempts: 2 },
    })
    await transport.connect().catch(() => {})

    await waitFor(() => transport?.status === 'error')
  })

  it('cancela un connect pendiente si se llama a disconnect', async () => {
    const { port } = await startServer()
    const ws = newTransport(`ws://127.0.0.1:${port}`)

    const pending = ws.connect()
    ws.disconnect()

    await expect(pending).rejects.toThrow('se cancelo')
    expect(ws.status).toBe('closed')
  })

  it('connect justo despues de disconnect abre un canal nuevo (modo estricto de React)', async () => {
    const { port } = await startServer()
    const ws = newTransport(`ws://127.0.0.1:${port}`)

    const cancelled = ws.connect()
    ws.disconnect()
    const reopened = ws.connect()

    await expect(cancelled).rejects.toThrow('se cancelo')
    await reopened
    expect(ws.status).toBe('open')
  })

  it('deja de notificar a un oyente dado de baja', async () => {
    const { port } = await startServer()
    const ws = newTransport(`ws://127.0.0.1:${port}`)
    const listener = vi.fn()
    const unsubscribe = ws.subscribe(listener)
    unsubscribe()

    await ws.connect()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('WebSocketTransport sin red', () => {
  it('rechaza send antes de conectar', async () => {
    const ws = newTransport('ws://127.0.0.1:9')
    await expect(ws.send({ conversationId: 'c', messageId: 'm', text: 'x' })).rejects.toThrow(
      'no esta abierto',
    )
    expect(ws.status).toBe('idle')
  })

  it('si la fabrica lanza, rechaza y programa el reintento', async () => {
    transport = new WebSocketTransport({
      url: 'ws://invalida',
      createSocket: () => {
        throw new Error('URL invalida')
      },
      reconnect: FAST_RECONNECT,
    })
    const { statuses } = collect(transport)

    await expect(transport.connect()).rejects.toThrow('URL invalida')
    expect(statuses()).toEqual(['connecting', 'reconnecting'])
  })

  it('convierte un valor no Error de la fabrica en Error', async () => {
    transport = new WebSocketTransport({
      url: 'ws://invalida',
      createSocket: () => {
        throw 'texto'
      },
      reconnect: FAST_RECONNECT,
    })

    await expect(transport.connect()).rejects.toThrow('texto')
  })

  it('usa el WebSocket global cuando no se inyecta fabrica', () => {
    const created: string[] = []
    class FakeWebSocket {
      readonly readyState = 0
      constructor(url: string) {
        created.push(url)
      }
      addEventListener() {}
      send() {}
      close() {}
    }
    vi.stubGlobal('WebSocket', FakeWebSocket)

    transport = new WebSocketTransport({ url: 'ws://ejemplo:1' })
    // Queda pendiente: el socket falso nunca abre, y afterEach lo cancela.
    transport.connect().catch(() => {})

    expect(created).toEqual(['ws://ejemplo:1'])
  })
})

describe('backoffDelay', () => {
  it('duplica la espera en cada intento hasta el tope', () => {
    const options = { initialDelayMs: 100, maxDelayMs: 1000, maxAttempts: 10 }

    expect([0, 1, 2, 3, 4, 5].map((attempt) => backoffDelay(attempt, options))).toEqual([
      100, 200, 400, 800, 1000, 1000,
    ])
  })
})
