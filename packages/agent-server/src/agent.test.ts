import { describe, expect, it, vi } from 'vitest'
import { REFUSALS, chunkText, runAgentTurn, toLlmHistory, type AgentDeps } from './agent.js'
import { LlmError, type LlmClient, type LlmResponse } from './ports/llm.js'
import type { ToolGateway } from './ports/tool-gateway.js'
import { BOOK_COMPARISON_ANNOUNCEMENT, buildSystemPrompt } from './system-prompt.js'
import { TOOL_NUDGE } from './turn-checks.js'
import { collect, fakeGateway, scriptedLlm, text, toolUse } from './testing/doubles.js'

const SYSTEM = buildSystemPrompt()
const POSTER = 'https://image.tmdb.org/t/p/w342/a.jpg'
const IMDB = 'https://www.imdb.com/title/tt1160419/'

function deps(llm: LlmClient, tools: ToolGateway, overrides: Partial<AgentDeps> = {}) {
  const output = collect()
  const wait = vi.fn(() => Promise.resolve())
  const full: AgentDeps = {
    llm,
    tools,
    systemPrompt: SYSTEM,
    emit: output.emit,
    wait,
    timing: { deltaDelayMs: 0 },
    ...overrides,
  }
  return { deps: full, output, wait }
}

const message = (value: string, history?: { role: 'user' | 'assistant'; content: string }[]) => ({
  conversationId: 'c',
  messageId: 'm1',
  text: value,
  ...(history === undefined ? {} : { history }),
})

const FIRST = [{ role: 'user' as const, content: 'Hola' }]

const FIRST_TURN = [{ role: 'user' as const, content: 'Hola' }]

describe('runAgentTurn', () => {
  it('ejecuta herramientas, devuelve sus datos al modelo y transmite la respuesta', async () => {
    const { llm, requests } = scriptedLlm([
      toolUse('tmdb_search_movies', { query: 'Dune' }),
      text('Te recomiendo **Duna**.'),
    ])
    const { gateway, calls } = fakeGateway({
      tmdb_search_movies: { ok: true, payload: { movies: [{ title: 'Duna' }] }, ui: [] },
    })
    const { deps: d, output } = deps(llm, gateway)

    await runAgentTurn(message('Busca Dune', FIRST), d)

    expect(calls).toEqual([{ name: 'tmdb_search_movies', args: { query: 'Dune' } }])
    expect(requests[0]?.system).toBe(SYSTEM)
    expect(requests[0]?.messages).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'user', content: 'Busca Dune' },
    ])
    const toolTurn = requests[1]?.messages.at(-1)
    expect(toolTurn?.role === 'tool' && toolTurn.results[0]).toEqual({
      toolCallId: 'c1',
      name: 'tmdb_search_movies',
      content: '{"movies":[{"title":"Duna"}]}',
      isError: false,
    })
    expect(output.events[0]).toEqual({ type: 'message.start', messageId: 'm1-reply' })
    expect(output.events.at(-1)).toEqual({ type: 'message.end', messageId: 'm1-reply' })
    expect(output.text()).toBe('Te recomiendo **Duna**.')
  })

  it('guarda el estado del proveedor para el siguiente paso', async () => {
    const withState: LlmResponse = { ...toolUse('tmdb_search_movies'), providerState: ['x'] }
    const { llm, requests } = scriptedLlm([withState, text('ok')])
    await runAgentTurn(message('hola', FIRST), deps(llm, fakeGateway().gateway).deps)

    expect(requests[1]?.messages.at(-2)).toMatchObject({ role: 'assistant', providerState: ['x'] })
  })

  it('envia el poster y abre la pestania despues del texto', async () => {
    const { llm } = scriptedLlm([
      {
        text: '',
        toolCalls: [
          { id: 'a', name: 'tmdb_show_poster', input: {} },
          { id: 'b', name: 'tmdb_open_imdb', input: {} },
        ],
        stop: 'tool_use',
      },
      text('Listo.'),
    ])
    const { gateway } = fakeGateway({
      tmdb_show_poster: { ok: true, payload: {}, ui: [{ type: 'image', url: POSTER, alt: 'P' }] },
      tmdb_open_imdb: {
        ok: true,
        payload: {},
        ui: [{ type: 'open_url', url: IMDB, title: 'IMDb' }],
      },
    })
    const { deps: d, output } = deps(llm, gateway)

    await runAgentTurn(message('x', FIRST), d)

    expect(output.events.slice(-3)).toEqual([
      { type: 'message.image', messageId: 'm1-reply', url: POSTER, alt: 'P' },
      { type: 'message.end', messageId: 'm1-reply' },
      { type: 'action.open_url', actionId: 'm1-reply-open-0', url: IMDB, title: 'IMDb' },
    ])
  })

  it('limita y deduplica las imagenes', async () => {
    const image = (n: number) => ({ type: 'image' as const, url: `${POSTER}?${n}`, alt: '' })
    const { llm } = scriptedLlm([toolUse('tmdb_show_poster'), text('ok')])
    const { gateway } = fakeGateway({
      tmdb_show_poster: { ok: true, payload: {}, ui: [image(1), image(1), image(2), image(3)] },
    })
    const { deps: d, output } = deps(llm, gateway, { limits: { maxImages: 2 } })

    await runAgentTurn(message('x'), d)
    expect(output.events.filter((event) => event.type === 'message.image')).toHaveLength(2)
  })

  it('responde con error a una herramienta que no existe', async () => {
    const { llm, requests } = scriptedLlm([toolUse('no_existe'), text('ok')])
    const { gateway, calls } = fakeGateway()

    await runAgentTurn(message('x'), deps(llm, gateway).deps)

    expect(calls).toEqual([])
    const toolTurn = requests[1]?.messages.at(-1)
    expect(toolTurn?.role === 'tool' && toolTurn.results[0]?.isError).toBe(true)
  })

  it('anuncia la comparacion con el libro solo en el primer turno', async () => {
    const first = deps(scriptedLlm([text('¡Hola! Soy Sofía.')]).llm, fakeGateway().gateway)
    await runAgentTurn(message('Hola'), first.deps)
    expect(first.output.text()).toContain(BOOK_COMPARISON_ANNOUNCEMENT)

    const mentioned = deps(
      scriptedLlm([text('Puedo compararla con su libro.')]).llm,
      fakeGateway().gateway,
    )
    await runAgentTurn(message('Hola'), mentioned.deps)
    expect(mentioned.output.text()).not.toContain(BOOK_COMPARISON_ANNOUNCEMENT)

    const later = deps(scriptedLlm([text('Claro.')]).llm, fakeGateway().gateway)
    await runAgentTurn(message('y', FIRST), later.deps)
    expect(later.output.text()).not.toContain(BOOK_COMPARISON_ANNOUNCEMENT)
  })

  it('trocea la respuesta y espera entre fragmentos', async () => {
    const { llm } = scriptedLlm([text('uno dos tres cuatro cinco seis siete')])
    const {
      deps: d,
      output,
      wait,
    } = deps(llm, fakeGateway().gateway, {
      timing: { deltaDelayMs: 5, chunkSize: 10 },
    })

    await runAgentTurn(message('x', FIRST), d)
    expect(output.events.filter((event) => event.type === 'message.delta').length).toBeGreaterThan(
      2,
    )
    expect(wait).toHaveBeenCalledWith(5)
  })

  it('reemplaza una respuesta vacia o rechazada por un mensaje util', async () => {
    const empty = deps(scriptedLlm([text('   ')]).llm, fakeGateway().gateway)
    await runAgentTurn(message('x', FIRST), empty.deps)
    expect(empty.output.text()).toBe(REFUSALS.model_refusal)

    const refused = deps(
      scriptedLlm([{ text: '', toolCalls: [], stop: 'refusal' }]).llm,
      fakeGateway().gateway,
    )
    await runAgentTurn(message('x', FIRST), refused.deps)
    expect(refused.output.text()).toBe(REFUSALS.model_refusal)
  })

  it('corta un bucle de herramientas por pasos y por llamadas', async () => {
    const llm = { complete: vi.fn(() => Promise.resolve(toolUse('tmdb_search_movies'))) }
    const steps = deps(llm, fakeGateway().gateway, { limits: { maxSteps: 3 } })
    await runAgentTurn(message('x', FIRST), steps.deps)
    expect(llm.complete).toHaveBeenCalledTimes(3)
    expect(steps.output.text()).toMatch(/demasiados pasos/)

    const many: LlmResponse = {
      text: '',
      toolCalls: Array.from({ length: 4 }, (_, i) => ({
        id: `c${i}`,
        name: 'tmdb_search_movies',
        input: {},
      })),
      stop: 'tool_use',
    }
    const { gateway, calls } = fakeGateway()
    const total = deps(scriptedLlm([many]).llm, gateway, { limits: { maxToolCalls: 6 } })
    await runAgentTurn(message('x', FIRST), total.deps)
    expect(calls).toHaveLength(4)
  })

  it.each([
    ['auth', false],
    ['rate_limit', true],
    ['bad_request', true],
    ['unavailable', true],
  ] as const)('traduce un fallo %s del modelo a un evento de error', async (kind, recoverable) => {
    const llm = { complete: () => Promise.reject(new LlmError(kind, 'detalle interno')) }
    const { deps: d, output } = deps(llm, fakeGateway().gateway)

    await runAgentTurn(message('x'), d)

    expect(output.events).toEqual([
      expect.objectContaining({ type: 'error', code: `llm_${kind}`, recoverable }),
    ])
    expect(JSON.stringify(output.events)).not.toContain('detalle interno')
  })

  it('un fallo desconocido se trata como servicio no disponible', async () => {
    const failing: ToolGateway = {
      ...fakeGateway().gateway,
      listTools: () => Promise.reject(new Error('x')),
    }
    const { deps: d, output } = deps(scriptedLlm([text('x')]).llm, failing)

    await runAgentTurn(message('x'), d)
    expect(output.events[0]).toMatchObject({ code: 'llm_unavailable' })
  })
})

describe('garantias del turno', () => {
  const MOVIE = {
    title: 'Diario de una pasión',
    posterUrl: 'https://image.tmdb.org/t/p/w342/b.jpg',
  }

  it('si recomienda de memoria, le pide una vez que verifique con las herramientas', async () => {
    const { llm, requests } = scriptedLlm([
      text('Te recomiendo **Diario de una pasión** (2004).'),
      toolUse('tmdb_show_poster', { movie_id: 11036 }),
      text('Te recomiendo **Diario de una pasión** (2004).'),
    ])
    const { gateway, calls } = fakeGateway({
      tmdb_show_poster: {
        ok: true,
        payload: {},
        ui: [{ type: 'image', url: MOVIE.posterUrl, alt: 'P' }],
      },
    })
    const { deps: d, output } = deps(llm, gateway)

    await runAgentTurn(message('Recomiéndame una de amor', FIRST_TURN), d)

    expect(requests[1]?.messages.at(-1)).toEqual({ role: 'user', content: TOOL_NUDGE })
    expect(calls.map((call) => call.name)).toEqual(['tmdb_show_poster'])
    expect(output.events.some((event) => event.type === 'message.image')).toBe(true)
  })

  it('pide la verificacion una sola vez', async () => {
    const llm = { complete: vi.fn(() => Promise.resolve(text('**Duna** (2021)'))) }
    const { deps: d, output } = deps(llm, fakeGateway().gateway)

    await runAgentTurn(message('x', FIRST_TURN), d)

    expect(llm.complete).toHaveBeenCalledTimes(2)
    expect(output.text()).toContain('**Duna** (2021)')
  })

  it('adjunta el poster si consulto TMDB pero olvido pedirlo', async () => {
    const { llm } = scriptedLlm([
      toolUse('tmdb_search_movies', { query: 'amor' }),
      text('Te recomiendo **Diario de una pasión** (2004).'),
    ])
    const { gateway } = fakeGateway({
      tmdb_search_movies: { ok: true, payload: { movies: [MOVIE] }, ui: [] },
    })
    const { deps: d, output } = deps(llm, gateway)

    await runAgentTurn(message('x', FIRST_TURN), d)

    expect(output.events).toContainEqual({
      type: 'message.image',
      messageId: 'm1-reply',
      url: MOVIE.posterUrl,
      alt: 'Póster de Diario de una pasión',
    })
  })

  it('no inventa un poster si la respuesta no menciona la pelicula', async () => {
    const { llm } = scriptedLlm([toolUse('tmdb_search_movies'), text('¿Qué género prefieres?')])
    const { gateway } = fakeGateway({
      tmdb_search_movies: { ok: true, payload: { movies: [MOVIE] }, ui: [] },
    })
    const { deps: d, output } = deps(llm, gateway)

    await runAgentTurn(message('x', FIRST_TURN), d)
    expect(output.events.some((event) => event.type === 'message.image')).toBe(false)
  })
})

describe('toLlmHistory', () => {
  it('la conversacion siempre empieza por el usuario', () => {
    expect(
      toLlmHistory([
        { role: 'assistant', content: 'saludo' },
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: '¡Hola!' },
      ]),
    ).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¡Hola!' },
    ])
  })
})

describe('chunkText', () => {
  it('conserva el texto completo', () => {
    const value = 'Te recomiendo Duna, una pelicula de ciencia ficcion.'
    expect(chunkText(value, 12).join('')).toBe(value)
  })

  it('un texto vacio no produce fragmentos', () => {
    expect(chunkText('', 10)).toEqual([])
  })
})
