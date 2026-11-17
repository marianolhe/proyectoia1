import type { AgentEvent } from '@agichat/core'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import * as api from './index.js'
import { parseInboundJson } from './protocol.js'
import { RateLimiter } from './rate-limiter.js'
import { startAgentServer, type AgentServerHandle, type TurnDeps } from './server.js'
import { buildSystemPrompt } from './system-prompt.js'
import { fakeGateway, scriptedLlm, text } from './testing/doubles.js'

function turnDeps(llm = scriptedLlm([text('Te recomiendo **Duna**.')]).llm): TurnDeps {
  return {
    llm,
    tools: fakeGateway().gateway,
    systemPrompt: buildSystemPrompt(),
    timing: { deltaDelayMs: 0 },
  }
}

let handle: AgentServerHandle | null = null

afterEach(async () => {
  await handle?.close()
  handle = null
})

function open(port: number, origin?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}`, origin === undefined ? {} : { origin })
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

/** Recibe eventos hasta que `done` diga basta. */
function receive(socket: WebSocket, done: (event: AgentEvent) => boolean): Promise<AgentEvent[]> {
  return new Promise((resolve) => {
    const events: AgentEvent[] = []
    socket.on('message', (raw) => {
      const event = JSON.parse(raw.toString()) as AgentEvent
      events.push(event)
      if (done(event)) resolve(events)
    })
  })
}

const frame = (text: string, messageId = 'm1') =>
  JSON.stringify({ conversationId: 'c', messageId, text })

describe('startAgentServer', () => {
  it('responde por WebSocket con el contrato del widget', async () => {
    handle = await startAgentServer({ port: 0, deps: turnDeps() })
    const socket = await open(handle.port)
    const events = receive(socket, (event) => event.type === 'message.end')

    socket.send(frame('Recomiéndame algo'))
    const received = await events

    expect(received[0]).toEqual({ type: 'message.start', messageId: 'm1-reply' })
    expect(received.at(-1)).toEqual({ type: 'message.end', messageId: 'm1-reply' })
    socket.close()
  })

  it('rechaza tramas invalidas sin cerrar la conexion', async () => {
    handle = await startAgentServer({ port: 0, deps: turnDeps() })
    const socket = await open(handle.port)
    const events = receive(socket, () => true)

    socket.send('no es json')
    expect(await events).toEqual([
      expect.objectContaining({ type: 'error', code: 'invalid_frame', recoverable: true }),
    ])
    socket.close()
  })

  it('no acepta un mensaje nuevo mientras responde el anterior', async () => {
    let release: () => void = () => {}
    const slow = {
      complete: () =>
        new Promise<ReturnType<typeof text>>((resolve) => {
          release = () => resolve(text('listo'))
        }),
    }
    handle = await startAgentServer({ port: 0, deps: turnDeps(slow) })
    const socket = await open(handle.port)
    const events = receive(socket, (event) => event.type === 'message.end')

    socket.send(frame('uno'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    socket.send(frame('dos', 'm2'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    release()

    expect(await events).toContainEqual(expect.objectContaining({ type: 'error', code: 'busy' }))
    socket.close()
  })

  it('limita la tasa de mensajes por conexion', async () => {
    handle = await startAgentServer({ port: 0, deps: turnDeps(), rateLimitPerMinute: 1 })
    const socket = await open(handle.port)
    const first = receive(socket, (event) => event.type === 'message.end')
    socket.send(frame('uno'))
    await first

    const second = receive(socket, (event) => event.type === 'error')
    socket.send(frame('dos', 'm2'))
    expect((await second).at(-1)).toMatchObject({ code: 'rate_limited' })
    socket.close()
  })

  it('solo acepta los origenes permitidos', async () => {
    handle = await startAgentServer({
      port: 0,
      deps: turnDeps(),
      allowedOrigins: ['https://cliente.com'],
    })

    await expect(open(handle.port, 'https://cliente.com')).resolves.toBeInstanceOf(WebSocket)
    await expect(open(handle.port, 'https://evil.example')).rejects.toThrow()
    await expect(open(handle.port)).rejects.toThrow()
  })

  it('expone el chequeo de salud y 404 en otras rutas', async () => {
    handle = await startAgentServer({ port: 0, deps: turnDeps() })
    const base = `http://localhost:${handle.port}`

    await expect((await fetch(`${base}/healthz`)).json()).resolves.toEqual({ status: 'ok' })
    expect((await fetch(`${base}/otra`)).status).toBe(404)
  })

  it('rechaza si el puerto esta ocupado', async () => {
    handle = await startAgentServer({ port: 0, deps: turnDeps() })
    await expect(startAgentServer({ port: handle.port, deps: turnDeps() })).rejects.toThrow()
  })
})

describe('parseInboundJson', () => {
  it('acepta un mensaje con historial y descarta entradas invalidas', () => {
    const result = parseInboundJson(
      JSON.stringify({
        conversationId: 'c',
        messageId: 'm',
        text: 'hola',
        history: [
          { role: 'user', content: 'a' },
          { role: 'system', content: 'x' },
          { role: 'assistant', content: '   ' },
          { role: 'assistant', content: 3 },
          null,
          { role: 'assistant', content: 'b'.repeat(5000) },
        ],
      }),
    )
    expect(result.ok && result.message.history).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b'.repeat(4000) },
    ])
  })

  it('omite el historial si queda vacio y lo recorta a 12 entradas', () => {
    const empty = parseInboundJson(
      JSON.stringify({ conversationId: 'c', messageId: 'm', text: 'x', history: 'no' }),
    )
    expect(empty.ok && empty.message).toEqual({ conversationId: 'c', messageId: 'm', text: 'x' })

    const long = parseInboundJson(
      JSON.stringify({
        conversationId: 'c',
        messageId: 'm',
        text: 'x',
        history: Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `t${i}` })),
      }),
    )
    expect(long.ok && long.message.history?.[0]).toEqual({ role: 'user', content: 't8' })
  })

  it.each([
    ['no json', 'no es JSON'],
    ['[]', 'objeto'],
    [JSON.stringify({ messageId: 'm', text: 'x' }), 'conversationId'],
    [
      JSON.stringify({ conversationId: 'c'.repeat(200), messageId: 'm', text: 'x' }),
      'conversationId',
    ],
    [JSON.stringify({ conversationId: 'c', text: 'x' }), 'messageId'],
    [JSON.stringify({ conversationId: 'c', messageId: 'm', text: '  ' }), 'text'],
  ])('rechaza %s', (raw, reason) => {
    const result = parseInboundJson(raw)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain(reason)
  })
})

describe('RateLimiter', () => {
  it('libera cupo cuando sale de la ventana', () => {
    let now = 0
    const limiter = new RateLimiter(2, 1000, () => now)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)
    now = 1000
    expect(limiter.tryAcquire()).toBe(true)
  })

  it('usa el reloj del sistema por defecto', () => {
    expect(new RateLimiter(1).tryAcquire()).toBe(true)
  })
})

describe('buildSystemPrompt', () => {
  it('describe las herramientas y anuncia la comparacion con el libro', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('tmdb_show_poster')
    expect(prompt).toMatch(/compararla con el libro/)
  })

  it('no contiene nada con forma de clave', () => {
    expect(buildSystemPrompt()).not.toMatch(/sk-|AIza|api[_ ]?key\s*[:=]/i)
  })
})

describe('API publica de @agichat/agent-server', () => {
  it('expone el orquestador, los adaptadores y el servidor', () => {
    expect(Object.keys(api).sort()).toEqual([
      'AnthropicLlm',
      'BOOK_COMPARISON_ANNOUNCEMENT',
      'DEFAULT_ANTHROPIC_MODEL',
      'LlmError',
      'McpToolGateway',
      'OpenAiCompatibleLlm',
      'REFUSALS',
      'RateLimiter',
      'buildSystemPrompt',
      'chunkText',
      'createLlm',
      'httpConnector',
      'inMemoryConnector',
      'loadConfig',
      'parseInboundJson',
      'parseMcpServers',
      'parseToolResult',
      'runAgentTurn',
      'startAgentServer',
      'toLlmHistory',
    ])
  })
})
