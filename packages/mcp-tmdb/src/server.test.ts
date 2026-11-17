import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { createTmdbServerFactory, loadTmdbConfig } from './server.js'
import { DUNE, defaultRoute, fakeTmdb } from './testing/fake-tmdb.js'

describe('loadTmdbConfig', () => {
  it('prefiere el token de lectura v4', () => {
    expect(loadTmdbConfig({ TMDB_ACCESS_TOKEN: ' t ', TMDB_API_KEY: 'k' })).toEqual({
      ok: true,
      config: { accessToken: 't' },
    })
  })

  it('acepta la clave v3 y el idioma', () => {
    expect(loadTmdbConfig({ TMDB_API_KEY: 'k', TMDB_LANGUAGE: 'en-US' })).toEqual({
      ok: true,
      config: { apiKey: 'k', language: 'en-US' },
    })
  })

  it('sin credencial explica que falta', () => {
    const result = loadTmdbConfig({ TMDB_API_KEY: '   ' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/TMDB_ACCESS_TOKEN/)
  })
})

describe('createTmdbServerFactory', () => {
  async function connect(config: Parameters<typeof createTmdbServerFactory>[0]) {
    const fake = fakeTmdb(defaultRoute)
    const factory = createTmdbServerFactory(config, fake.fetch)
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await factory().connect(serverSide)
    const client = new Client({ name: 'c', version: '0' })
    await client.connect(clientSide)
    return { client, fake, factory }
  }

  it('expone las herramientas por MCP y manda el token en la cabecera', async () => {
    const { client, fake } = await connect({ accessToken: 'token-v4', language: 'es-ES' })

    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toContain('tmdb_show_poster')

    const result = await client.callTool({
      name: 'tmdb_show_poster',
      arguments: { movie_id: DUNE.id },
    })
    expect(result.structuredContent).toMatchObject({ ok: true, ui: [{ type: 'image' }] })

    const init = fake.fetch.mock.calls[0]?.[1]
    expect(init?.headers.authorization).toBe('Bearer token-v4')
    expect(fake.urls[0]?.searchParams.get('language')).toBe('es-ES')
    expect(fake.urls[0]?.searchParams.has('api_key')).toBe(false)
  })

  it('los servidores de una misma fabrica comparten el cache', async () => {
    const { client, fake, factory } = await connect({ apiKey: 'k' })
    await client.callTool({ name: 'tmdb_search_movies', arguments: { query: 'Dune' } })

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await factory().connect(serverSide)
    const second = new Client({ name: 'c2', version: '0' })
    await second.connect(clientSide)
    await second.callTool({ name: 'tmdb_search_movies', arguments: { query: 'Dune' } })

    expect(fake.fetch).toHaveBeenCalledTimes(1)
  })

  it('el SDK rechaza un genero que no existe', async () => {
    const { client } = await connect({ apiKey: 'k' })
    const result = await client.callTool({
      name: 'tmdb_discover_movies',
      arguments: { genre: 'telenovela' },
    })
    expect(result.isError).toBe(true)
  })
})
