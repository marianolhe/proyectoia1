import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { LlmError } from '../ports/llm.js'
import {
  AnthropicLlm,
  DEFAULT_ANTHROPIC_MODEL,
  type AnthropicMessagesApi,
} from './anthropic-llm.js'

type Message = Anthropic.Beta.BetaMessage

function reply(content: unknown[], stop: string): Message {
  return { content, stop_reason: stop } as unknown as Message
}

function apiReturning(message: Message) {
  const create = vi.fn<AnthropicMessagesApi['create']>(() => Promise.resolve(message))
  return { api: { create }, create }
}

const REQUEST = {
  system: 'sistema',
  messages: [
    { role: 'user' as const, content: 'hola' },
    {
      role: 'assistant' as const,
      content: '',
      toolCalls: [{ id: 't1', name: 'tmdb_search_movies', input: { query: 'x' } }],
      providerState: [
        { type: 'tool_use', id: 't1', name: 'tmdb_search_movies', input: { query: 'x' } },
      ],
    },
    {
      role: 'tool' as const,
      results: [
        {
          toolCallId: 't1',
          name: 'tmdb_search_movies',
          content: '<datos_externos/>',
          isError: false,
        },
      ],
    },
    { role: 'assistant' as const, content: 'texto previo' },
  ],
  tools: [{ name: 'tmdb_search_movies', description: 'buscar', inputSchema: { type: 'object' } }],
}

describe('AnthropicLlm', () => {
  it('arma la peticion con el modelo, el esfuerzo y la red de respaldo', async () => {
    const { api, create } = apiReturning(reply([{ type: 'text', text: 'ok' }], 'end_turn'))
    await new AnthropicLlm({ api }).complete(REQUEST)

    const params = create.mock.calls[0]![0]
    expect(params).toMatchObject({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 16000,
      system: 'sistema',
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: [
        { name: 'tmdb_search_movies', description: 'buscar', input_schema: { type: 'object' } },
      ],
    })
    expect(params.messages).toEqual([
      { role: 'user', content: 'hola' },
      {
        role: 'assistant',
        content:
          REQUEST.messages[1] && (REQUEST.messages[1] as { providerState: unknown }).providerState,
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: '<datos_externos/>', is_error: false },
        ],
      },
      { role: 'assistant', content: 'texto previo' },
    ])
  })

  it('no manda la red de respaldo a un modelo que no la admite', async () => {
    const { api, create } = apiReturning(reply([], 'end_turn'))
    await new AnthropicLlm({
      api,
      model: 'claude-haiku-5-5',
      effort: 'low',
      maxTokens: 100,
    }).complete(REQUEST)

    const params = create.mock.calls[0]![0]
    expect(params).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 100,
      output_config: { effort: 'low' },
    })
    expect(params).not.toHaveProperty('fallbacks')
  })

  it('separa texto y llamadas a herramientas y conserva el contenido original', async () => {
    const content = [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: 'Busco ' },
      { type: 'text', text: 'eso.' },
      { type: 'tool_use', id: 'u1', name: 'tmdb_search_movies', input: { query: 'Dune' } },
      { type: 'tool_use', id: 'u2', name: 'tmdb_open_imdb', input: null },
    ]
    const { api } = apiReturning(reply(content, 'tool_use'))

    expect(await new AnthropicLlm({ api }).complete(REQUEST)).toEqual({
      text: 'Busco eso.',
      toolCalls: [
        { id: 'u1', name: 'tmdb_search_movies', input: { query: 'Dune' } },
        { id: 'u2', name: 'tmdb_open_imdb', input: {} },
      ],
      stop: 'tool_use',
      providerState: content,
    })
  })

  it.each([
    ['end_turn', 'end'],
    ['max_tokens', 'max_tokens'],
    ['refusal', 'refusal'],
    ['stop_sequence', 'end'],
  ])('traduce stop_reason %s a %s', async (reason, stop) => {
    const { api } = apiReturning(reply([], reason))
    expect((await new AnthropicLlm({ api }).complete(REQUEST)).stop).toBe(stop)
  })

  const headers = new Headers()
  it.each([
    [new Anthropic.AuthenticationError(401, {}, 'x', headers), 'auth'],
    [new Anthropic.PermissionDeniedError(403, {}, 'x', headers), 'auth'],
    [new Anthropic.RateLimitError(429, {}, 'x', headers), 'rate_limit'],
    [new Anthropic.BadRequestError(400, {}, 'x', headers), 'bad_request'],
    [new Anthropic.InternalServerError(500, {}, 'x', headers), 'unavailable'],
    [new Error('red'), 'unavailable'],
  ])('clasifica el error %#', async (error, kind) => {
    const api = { create: vi.fn(() => Promise.reject(error)) }
    const failure = new AnthropicLlm({ api }).complete(REQUEST)
    await expect(failure).rejects.toBeInstanceOf(LlmError)
    await expect(failure).rejects.toMatchObject({ kind })
  })

  it('sin api inyectada construye el cliente del SDK', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-prueba')
    expect(new AnthropicLlm()).toBeInstanceOf(AnthropicLlm)
    vi.unstubAllEnvs()
  })
})
