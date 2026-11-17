import { ApiClient, type ToolDefinition } from '@agichat/mcp-kit'
import { describe, expect, it } from 'vitest'
import { BooksClient } from './books-client.js'
import { DUNE_BOOK, defaultRoute, fakeBooks, type Route } from './testing/fake-books.js'
import { createBooksTools } from './tools.js'

function setup(route: Route = defaultRoute, apiKey?: string) {
  const fake = fakeBooks(route)
  const client = new BooksClient({
    api: new ApiClient({ name: 'Google Books', fetch: fake.fetch }),
    ...(apiKey === undefined ? {} : { apiKey }),
  })
  const tools = new Map(createBooksTools(client).map((tool) => [tool.name, tool]))
  const call = (name: string, args: Record<string, unknown>) =>
    (tools.get(name) as ToolDefinition).handler(args)
  return { call, urls: fake.urls, tools }
}

describe('herramientas de libros', () => {
  it('publica las cuatro herramientas', () => {
    expect([...setup().tools.keys()]).toEqual([
      'books_find_for_movie',
      'books_details',
      'books_compare_with_movie',
      'books_open_google_books',
    ])
  })

  describe('books_find_for_movie', () => {
    it('elige la novela original y no el guion', async () => {
      const { call, urls } = setup()
      const outcome = await call('books_find_for_movie', {
        movie_title: 'Duna',
        original_title: 'Dune',
        release_year: 2021,
      })

      expect(outcome).toMatchObject({
        ok: true,
        data: { found: true, book: { id: DUNE_BOOK.id, authors: ['Frank Herbert'] } },
      })
      expect(urls[0]?.searchParams.get('q')).toBe('intitle:"Dune"')
      expect(urls).toHaveLength(1)
    })

    it('si el titulo original no da resultado intenta el traducido', async () => {
      const { call, urls } = setup()
      const outcome = await call('books_find_for_movie', {
        movie_title: 'Dune',
        original_title: 'Dyuna',
      })
      expect(outcome).toMatchObject({ data: { found: true } })
      expect(urls.map((url) => url.searchParams.get('q'))).toEqual([
        'intitle:"Dyuna"',
        'intitle:"Dune"',
      ])
    })

    it('dice claramente cuando no hay libro', async () => {
      const { call } = setup()
      expect(await call('books_find_for_movie', { movie_title: 'El origen' })).toEqual({
        ok: true,
        data: {
          found: false,
          message: 'No se encontro en Google Books un libro que corresponda a "El origen".',
        },
      })
    })

    it('quita las comillas del titulo para no romper la consulta', async () => {
      const { call, urls } = setup()
      await call('books_find_for_movie', { movie_title: 'Dune" OR "x' })
      expect(urls[0]?.searchParams.get('q')).toBe('intitle:"Dune OR x"')
    })

    it('manda la clave si se configuro', async () => {
      const { call, urls } = setup(defaultRoute, 'clave')
      await call('books_find_for_movie', { movie_title: 'Dune' })
      expect(urls[0]?.searchParams.get('key')).toBe('clave')
    })

    it('propaga el fallo de la API', async () => {
      const { call } = setup(() => ({ status: 429, body: {} }))
      expect(await call('books_find_for_movie', { movie_title: 'Dune' })).toMatchObject({
        ok: false,
        error: { code: 'http' },
      })
    })
  })

  describe('books_details', () => {
    it('devuelve la ficha del libro', async () => {
      const { call } = setup()
      expect(await call('books_details', { volume_id: DUNE_BOOK.id })).toMatchObject({
        ok: true,
        data: { book: { title: 'Dune', averageRating: 4.5 } },
      })
    })

    it('informa un libro inexistente o una ficha incompleta', async () => {
      expect(await setup().call('books_details', { volume_id: 'noexiste1' })).toMatchObject({
        error: { code: 'not_found' },
      })
      const broken = setup(() => ({ status: 200, body: { id: 'abcdefgh' } }))
      expect(await broken.call('books_details', { volume_id: 'abcdefgh' })).toMatchObject({
        error: { code: 'invalid_response' },
      })
    })
  })

  it('books_compare_with_movie devuelve el veredicto', async () => {
    const { call } = setup()
    expect(
      await call('books_compare_with_movie', {
        movie_title: 'Eragon',
        movie_rating: 5.1,
        movie_vote_count: 3500,
        book_title: 'Eragon',
        book_rating: 4,
        book_ratings_count: 5200,
      }),
    ).toMatchObject({
      ok: true,
      data: { comparison: { verdict: 'mejor_lee_el_libro', worthWatching: false } },
    })
  })

  it('books_compare_with_movie acepta un libro sin calificacion', async () => {
    const { call } = setup()
    expect(
      await call('books_compare_with_movie', {
        movie_title: 'X',
        movie_rating: 7,
        movie_vote_count: 10,
        book_title: 'Y',
      }),
    ).toMatchObject({ data: { comparison: { verdict: 'sin_calificacion_del_libro' } } })
  })

  describe('books_open_google_books', () => {
    it('devuelve la directiva con la URL armada por el servidor', async () => {
      const { call } = setup()
      expect(await call('books_open_google_books', { volume_id: DUNE_BOOK.id })).toMatchObject({
        ok: true,
        ui: [
          {
            type: 'open_url',
            url: 'https://books.google.com/books?id=B1hSG45JCX4C',
            title: 'Google Books: Dune',
          },
        ],
      })
    })

    it('rechaza un identificador invalido sin llamar a la API', async () => {
      const { call, urls } = setup()
      expect(await call('books_open_google_books', { volume_id: '../evil' })).toMatchObject({
        error: { code: 'invalid_id' },
      })
      expect(urls).toHaveLength(0)
    })

    it('propaga el error de la ficha', async () => {
      expect(
        await setup().call('books_open_google_books', { volume_id: 'noexiste1' }),
      ).toMatchObject({ ok: false })
    })
  })
})
