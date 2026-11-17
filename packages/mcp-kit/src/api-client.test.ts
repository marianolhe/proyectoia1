import { describe, expect, it, vi } from 'vitest'
import { ApiClient, type FetchLike } from './api-client.js'
import { DailyBudget } from './daily-budget.js'

function respond(status: number, body: unknown = {}): FetchLike {
  return vi.fn(() =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) }),
  )
}

describe('ApiClient', () => {
  it('devuelve los datos y manda las cabeceras configuradas', async () => {
    const fetch = respond(200, { results: [] })
    const api = new ApiClient({ name: 'TMDB', fetch, headers: { authorization: 'Bearer t' } })

    await expect(api.getJson('k', 'https://api.test/a')).resolves.toEqual({
      ok: true,
      data: { results: [] },
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/a',
      expect.objectContaining({
        headers: { accept: 'application/json', authorization: 'Bearer t' },
      }),
    )
  })

  it('cachea por llave y no por URL', async () => {
    const fetch = respond(200, { a: 1 })
    const api = new ApiClient({ name: 'X', fetch })

    await api.getJson('misma', 'https://api.test/a?key=1')
    await api.getJson('misma', 'https://api.test/a?key=2')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('cachea un 404 pero no un 500', async () => {
    const notFound = respond(404)
    const api404 = new ApiClient({ name: 'X', fetch: notFound })
    await api404.getJson('k', 'u')
    await api404.getJson('k', 'u')
    expect(notFound).toHaveBeenCalledTimes(1)

    const failing = respond(500)
    const api500 = new ApiClient({ name: 'X', fetch: failing })
    await expect(api500.getJson('k', 'u')).resolves.toMatchObject({
      ok: false,
      code: 'http',
      status: 500,
    })
    await api500.getJson('k', 'u')
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it('no llama a la API cuando se agoto el cupo', async () => {
    const fetch = respond(200)
    const api = new ApiClient({ name: 'TMDB', fetch, budget: new DailyBudget({ limit: 1 }) })

    await api.getJson('a', 'u')
    const result = await api.getJson('b', 'u')
    expect(result).toMatchObject({ ok: false, code: 'budget_exhausted' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(api.remainingBudget).toBe(0)
  })

  it('informa una respuesta que no es JSON', async () => {
    const fetch: FetchLike = () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('x')) })
    await expect(new ApiClient({ name: 'X', fetch }).getJson('k', 'u')).resolves.toMatchObject({
      code: 'invalid_json',
    })
  })

  it('informa un fallo de red', async () => {
    const fetch: FetchLike = () => Promise.reject(new Error('ECONNREFUSED'))
    await expect(new ApiClient({ name: 'X', fetch }).getJson('k', 'u')).resolves.toMatchObject({
      code: 'network',
    })
  })

  it('corta la peticion que tarda demasiado', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('abortada')))
      })
    const api = new ApiClient({ name: 'X', fetch, timeoutMs: 5 })
    await expect(api.getJson('k', 'u')).resolves.toMatchObject({ code: 'timeout' })
  })

  it('usa fetch global por defecto', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    await expect(new ApiClient({ name: 'X' }).getJson('k', 'https://a.test/')).resolves.toEqual({
      ok: true,
      data: { ok: 1 },
    })
    spy.mockRestore()
  })
})
