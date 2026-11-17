import { describe, expect, it, vi } from 'vitest'
import { LlmError, type LlmRequest } from '../ports/llm.js'
import { OpenAiCompatibleLlm, toProviderSchema, type HttpPost } from './openai-compatible-llm.js'

function postReturning(status: number, body: unknown) {
  return vi.fn<HttpPost>(() =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) }),
  )
}

const REQUEST: LlmRequest = {
  system: 'sistema',
  messages: [
    { role: 'user', content: 'hola' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 't1', name: 'tmdb_search_movies', input: { query: 'x' } }],
    },
    {
      role: 'tool',
      results: [{ toolCallId: 't1', name: 'tmdb_search_movies', content: 'datos', isError: false }],
    },
    { role: 'assistant', content: 'previo' },
  ],
  tools: [{ name: 'tmdb_search_movies', description: 'buscar', inputSchema: { type: 'object' } }],
}

function llm(post: HttpPost) {
  return new OpenAiCompatibleLlm({
    baseUrl: 'https://api.test/v1/',
    apiKey: 'clave',
    model: 'modelo-gratis',
    post,
  })
}

describe('OpenAiCompatibleLlm', () => {
  it('traduce la conversacion al formato chat completions', async () => {
    const post = postReturning(200, {
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    })
    await llm(post).complete(REQUEST)

    const [url, init] = post.mock.calls[0]!
    expect(url).toBe('https://api.test/v1/chat/completions')
    expect(init.headers.authorization).toBe('Bearer clave')
    expect(JSON.parse(init.body)).toEqual({
      model: 'modelo-gratis',
      messages: [
        { role: 'system', content: 'sistema' },
        { role: 'user', content: 'hola' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 't1',
              type: 'function',
              function: { name: 'tmdb_search_movies', arguments: '{"query":"x"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 't1', content: 'datos' },
        { role: 'assistant', content: 'previo' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'tmdb_search_movies',
            description: 'buscar',
            parameters: { type: 'object' },
          },
        },
      ],
    })
  })

  it('quita $schema de los esquemas de herramientas', () => {
    expect(
      toProviderSchema({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object' }),
    ).toEqual({ type: 'object' })
  })

  it('no manda tools si no hay herramientas', async () => {
    const post = postReturning(200, { choices: [{ message: { content: 'ok' } }] })
    await llm(post).complete({ ...REQUEST, tools: [] })
    expect(JSON.parse(post.mock.calls[0]![1].body)).not.toHaveProperty('tools')
  })

  it('lee las llamadas a herramientas, con argumentos en texto u objeto', async () => {
    const post = postReturning(200, {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'a', function: { name: 'uno', arguments: '{"x":1}' } },
              { function: { name: 'dos', arguments: { y: 2 } } },
              { function: { name: 'tres', arguments: 'no es json' } },
              { function: { name: 'cuatro', arguments: '[1]' } },
              { function: { name: 5 } },
              { nada: true },
            ],
          },
        },
      ],
    })

    expect(await llm(post).complete(REQUEST)).toEqual({
      text: '',
      stop: 'tool_use',
      toolCalls: [
        { id: 'a', name: 'uno', input: { x: 1 } },
        { id: 'call_1', name: 'dos', input: { y: 2 } },
        { id: 'call_2', name: 'tres', input: {} },
        { id: 'call_3', name: 'cuatro', input: {} },
      ],
    })
  })

  it('reconoce una respuesta cortada por longitud', async () => {
    const post = postReturning(200, {
      choices: [{ message: { content: 'a medias' }, finish_reason: 'length' }],
    })
    expect(await llm(post).complete(REQUEST)).toMatchObject({
      text: 'a medias',
      stop: 'max_tokens',
    })
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limit'],
    [422, 'bad_request'],
    [503, 'unavailable'],
  ])('clasifica el estado %d como %s', async (status, kind) => {
    await expect(llm(postReturning(status, {})).complete(REQUEST)).rejects.toMatchObject({ kind })
  })

  it('informa un fallo de red', async () => {
    const post = vi.fn<HttpPost>(() => Promise.reject(new Error('red')))
    await expect(llm(post).complete(REQUEST)).rejects.toBeInstanceOf(LlmError)
  })

  it('informa una respuesta que no es JSON o no trae contenido', async () => {
    const notJson = vi.fn<HttpPost>(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('x')) }),
    )
    await expect(llm(notJson).complete(REQUEST)).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(llm(postReturning(200, { choices: [] })).complete(REQUEST)).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })

  it('usa fetch global por defecto', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'hola' } }] })),
      )
    const client = new OpenAiCompatibleLlm({
      baseUrl: 'https://api.test/v1',
      apiKey: 'k',
      model: 'm',
    })
    await expect(client.complete(REQUEST)).resolves.toMatchObject({ text: 'hola' })
    spy.mockRestore()
  })
})
