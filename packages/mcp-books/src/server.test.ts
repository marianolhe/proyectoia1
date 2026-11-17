import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import * as api from './index.js'
import { createBooksServerFactory, loadBooksConfig } from './server.js'
import { defaultRoute, fakeBooks } from './testing/fake-books.js'

describe('loadBooksConfig', () => {
  it('la clave es opcional', () => {
    expect(loadBooksConfig({})).toEqual({})
    expect(loadBooksConfig({ GOOGLE_BOOKS_API_KEY: ' k ' })).toEqual({ apiKey: 'k' })
  })
})

describe('createBooksServerFactory', () => {
  it('expone las herramientas por MCP', async () => {
    const fake = fakeBooks(defaultRoute)
    const factory = createBooksServerFactory({ apiKey: 'k' }, fake.fetch)
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await factory().connect(serverSide)
    const client = new Client({ name: 'c', version: '0' })
    await client.connect(clientSide)

    const result = await client.callTool({
      name: 'books_find_for_movie',
      arguments: { movie_title: 'Dune' },
    })
    expect(result.structuredContent).toMatchObject({ ok: true, data: { found: true } })
    expect(fake.urls[0]?.searchParams.get('key')).toBe('k')
  })

  it('funciona sin clave ni fetch inyectado', () => {
    expect(createBooksServerFactory({})()).toBeDefined()
  })
})

describe('API publica de @agichat/mcp-books', () => {
  it('expone servidor, cliente, herramientas, comparacion y parsers', () => {
    expect(Object.keys(api).sort()).toEqual([
      'BooksClient',
      'compareMovieWithBook',
      'createBooksServerFactory',
      'createBooksTools',
      'googleBooksUrlFor',
      'isVolumeId',
      'loadBooksConfig',
      'normalizeTitle',
      'parseBook',
      'parseBookList',
      'rankBooks',
      'scoreBook',
    ])
  })
})
