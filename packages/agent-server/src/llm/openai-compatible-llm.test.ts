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
    sleep: () => Promise.resolve(),
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

    expect(await llm(post).complete(REQUEST)).toMatchObject({
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

  it('reenvia las llamadas originales con la firma de Gemini', async () => {
    const original = {
      id: 'g1',
      type: 'function',
      function: { name: 'tmdb_search_movies', arguments: '{"query":"Dune"}' },
      extra_content: { google: { thought_signature: 'firma-opaca' } },
    }
    const first = await llm(
      postReturning(200, { choices: [{ message: { content: null, tool_calls: [original] } }] }),
    ).complete(REQUEST)
    expect(first.providerState).toEqual({ toolCalls: [original] })

    const post = postReturning(200, { choices: [{ message: { content: 'ok' } }] })
    await llm(post).complete({
      ...REQUEST,
      messages: [
        { role: 'user', content: 'Busca Dune' },
        {
          role: 'assistant',
          content: '',
          toolCalls: first.toolCalls,
          providerState: first.providerState,
        },
        {
          role: 'tool',
          results: [
            { toolCallId: 'g1', name: 'tmdb_search_movies', content: '{}', isError: false },
          ],
        },
      ],
    })

    const sent = JSON.parse(post.mock.calls[0]![1].body) as { messages: { tool_calls?: unknown }[] }
    expect(sent.messages[2]?.tool_calls).toEqual([original])
  })

  it('sin llamadas a herramientas no guarda estado del proveedor', async () => {
    const post = postReturning(200, { choices: [{ message: { content: 'hola' } }] })
    expect(await llm(post).complete(REQUEST)).not.toHaveProperty('providerState')
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

  it('reintenta con espera cuando el proveedor limita la tasa', async () => {
    const responses = [429, 503, 200]
    const post = vi.fn<HttpPost>(() => {
      const status = responses.shift() ?? 200
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
      })
    })
    const sleep = vi.fn(() => Promise.resolve())
    const client = new OpenAiCompatibleLlm({
      baseUrl: 'https://api.test/v1',
      apiKey: 'k',
      model: 'm',
      post,
      sleep,
      retryDelaysMs: [10, 20],
    })

    await expect(client.complete(REQUEST)).resolves.toMatchObject({ text: 'ok' })
    expect(post).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[10], [20]])
  })

  it('no reintenta errores que no son de saturacion', async () => {
    const post = postReturning(400, {})
    await expect(llm(post).complete(REQUEST)).rejects.toMatchObject({ kind: 'bad_request' })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('por defecto espera de verdad entre reintentos', async () => {
    vi.useFakeTimers()
    const responses = [429, 200]
    const post = vi.fn<HttpPost>(() => {
      const status = responses.shift() ?? 200
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
      })
    })
    const pending = new OpenAiCompatibleLlm({
      baseUrl: 'https://a/v1',
      apiKey: 'k',
      model: 'm',
      post,
    }).complete(REQUEST)
    await vi.advanceTimersByTimeAsync(3000)
    await expect(pending).resolves.toMatchObject({ text: 'ok' })
    vi.useRealTimers()
  })

  it('reconoce una clave invalida aunque el proveedor responda 400 (Gemini)', async () => {
    const post = postReturning(400, [
      { error: { code: 400, message: 'Please pass a valid API key', status: 'INVALID_ARGUMENT' } },
    ])
    await expect(llm(post).complete(REQUEST)).rejects.toMatchObject({
      kind: 'auth',
      message: 'La credencial del modelo no es valida (400): Please pass a valid API key',
    })
  })

  it('incluye el mensaje del proveedor en errores con forma de objeto', async () => {
    const post = postReturning(503, { error: { message: 'The model is overloaded' } })
    await expect(llm(post).complete(REQUEST)).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'El proveedor respondio con un error (503): The model is overloaded',
    })
  })

  it('tolera errores sin cuerpo o con otra forma', async () => {
    const noBody = vi.fn<HttpPost>(() =>
      Promise.resolve({ ok: false, status: 422, json: () => Promise.reject(new Error('x')) }),
    )
    await expect(llm(noBody).complete(REQUEST)).rejects.toMatchObject({
      kind: 'bad_request',
      message: 'El proveedor rechazo la peticion (422)',
    })
    await expect(
      llm(postReturning(429, { error: { message: 7 } })).complete(REQUEST),
    ).rejects.toMatchObject({ message: 'El proveedor limito la tasa de peticiones' })
    await expect(llm(postReturning(500, 'texto')).complete(REQUEST)).rejects.toMatchObject({
      kind: 'unavailable',
    })
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
