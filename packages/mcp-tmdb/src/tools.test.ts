import { ApiClient, type ToolDefinition } from '@agichat/mcp-kit'
import { describe, expect, it } from 'vitest'
import { DUNE, DUNE_DETAILS, defaultRoute, fakeTmdb, type Route } from './testing/fake-tmdb.js'
import { TmdbClient } from './tmdb-client.js'
import { createTmdbTools } from './tools.js'

function setup(route: Route = defaultRoute, apiKey?: string) {
  const fake = fakeTmdb(route)
  const client = new TmdbClient({
    api: new ApiClient({ name: 'TMDB', fetch: fake.fetch }),
    ...(apiKey === undefined ? {} : { apiKey }),
  })
  const tools = new Map(createTmdbTools(client).map((tool) => [tool.name, tool]))
  const call = (name: string, args: Record<string, unknown>) =>
    (tools.get(name) as ToolDefinition).handler(args)
  return { call, urls: fake.urls, tools, fetch: fake.fetch }
}

describe('herramientas de TMDB', () => {
  it('publica las seis herramientas con descripcion', () => {
    const { tools } = setup()
    expect([...tools.keys()]).toEqual([
      'tmdb_search_movies',
      'tmdb_discover_movies',
      'tmdb_similar_movies',
      'tmdb_movie_details',
      'tmdb_show_poster',
      'tmdb_open_imdb',
    ])
    for (const tool of tools.values()) expect(tool.description.length).toBeGreaterThan(40)
  })

  describe('tmdb_search_movies', () => {
    it('busca por titulo y anio en espaniol, con atribucion', async () => {
      const { call, urls } = setup()
      const outcome = await call('tmdb_search_movies', { query: 'Dune', year: 2021 })

      expect(outcome).toMatchObject({
        ok: true,
        data: { count: 1, movies: [{ id: DUNE.id, title: 'Duna' }] },
      })
      expect(outcome.ok && outcome.data.attribution).toMatch(/TMDB/)
      expect(urls[0]?.searchParams.get('query')).toBe('Dune')
      expect(urls[0]?.searchParams.get('year')).toBe('2021')
      expect(urls[0]?.searchParams.get('language')).toBe('es-MX')
      expect(urls[0]?.searchParams.get('include_adult')).toBe('false')
    })

    it('lleva la clave v3 en la URL cuando se configura', async () => {
      const { call, urls } = setup(defaultRoute, 'clave-v3')
      await call('tmdb_search_movies', { query: 'Dune' })
      expect(urls[0]?.searchParams.get('api_key')).toBe('clave-v3')
    })

    it('la misma busqueda no vuelve a gastar una peticion', async () => {
      const { call, fetch } = setup()
      await call('tmdb_search_movies', { query: 'Dune' })
      await call('tmdb_search_movies', { query: 'Dune' })
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('convierte un fallo de la API en error de la herramienta', async () => {
      const { call } = setup(() => ({ status: 503, body: {} }))
      expect(await call('tmdb_search_movies', { query: 'Dune' })).toEqual({
        ok: false,
        error: { code: 'http', message: 'TMDB respondio con el estado 503.' },
      })
    })
  })

  describe('tmdb_discover_movies', () => {
    it('traduce genero, calificacion y orden a los parametros de TMDB', async () => {
      const { call, urls } = setup()
      await call('tmdb_discover_movies', {
        genre: 'ciencia_ficcion',
        year: 2021,
        min_rating: 7,
        sort_by: 'calificacion',
      })

      const params = urls[0]?.searchParams
      expect(params?.get('with_genres')).toBe('878')
      expect(params?.get('primary_release_year')).toBe('2021')
      expect(params?.get('vote_average.gte')).toBe('7')
      expect(params?.get('sort_by')).toBe('vote_average.desc')
      expect(params?.get('vote_count.gte')).toBe('200')
    })

    it('sin filtros ordena por popularidad', async () => {
      const { call, urls } = setup()
      await call('tmdb_discover_movies', {})
      expect(urls[0]?.searchParams.get('sort_by')).toBe('popularity.desc')
      expect(urls[0]?.searchParams.has('with_genres')).toBe(false)
    })
  })

  it('tmdb_similar_movies pide las recomendaciones de esa pelicula', async () => {
    const { call, urls } = setup()
    await call('tmdb_similar_movies', { movie_id: DUNE.id })
    expect(urls[0]?.pathname).toBe(`/3/movie/${DUNE.id}/recommendations`)
  })

  describe('tmdb_movie_details', () => {
    it('trae ficha, IMDb y palabras clave en una sola peticion', async () => {
      const { call, urls } = setup()
      const outcome = await call('tmdb_movie_details', { movie_id: DUNE.id })

      expect(outcome).toMatchObject({
        ok: true,
        data: { movie: { imdbId: 'tt1160419', basedOnBook: true } },
      })
      expect(urls[0]?.searchParams.get('append_to_response')).toBe('external_ids,keywords')
    })

    it('informa cuando la pelicula no existe', async () => {
      const { call } = setup()
      expect(await call('tmdb_movie_details', { movie_id: 1 })).toMatchObject({
        ok: false,
        error: { code: 'not_found' },
      })
    })

    it('informa una ficha incompleta', async () => {
      const { call } = setup(() => ({ status: 200, body: { id: 1 } }))
      expect(await call('tmdb_movie_details', { movie_id: 1 })).toMatchObject({
        error: { code: 'invalid_response' },
      })
    })
  })

  describe('tmdb_show_poster', () => {
    it('devuelve la directiva de imagen con la URL armada por el servidor', async () => {
      const { call } = setup()
      expect(await call('tmdb_show_poster', { movie_id: DUNE.id })).toEqual({
        ok: true,
        data: { shown: true, title: 'Duna' },
        ui: [
          {
            type: 'image',
            url: 'https://image.tmdb.org/t/p/w342/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
            alt: 'Póster de Duna',
          },
        ],
      })
    })

    it('informa si la pelicula no tiene poster', async () => {
      const { call } = setup(() => ({ status: 200, body: { ...DUNE_DETAILS, poster_path: null } }))
      expect(await call('tmdb_show_poster', { movie_id: DUNE.id })).toMatchObject({
        error: { code: 'no_poster' },
      })
    })

    it('propaga el error de la ficha', async () => {
      const { call } = setup()
      expect(await call('tmdb_show_poster', { movie_id: 1 })).toMatchObject({ ok: false })
    })
  })

  describe('tmdb_open_imdb', () => {
    it('devuelve la directiva de abrir IMDb', async () => {
      const { call } = setup()
      expect(await call('tmdb_open_imdb', { movie_id: DUNE.id })).toMatchObject({
        ok: true,
        ui: [
          { type: 'open_url', url: 'https://www.imdb.com/title/tt1160419/', title: 'IMDb: Duna' },
        ],
      })
    })

    it('informa si no hay ID de IMDb', async () => {
      const { call } = setup(() => ({
        status: 200,
        body: { ...DUNE_DETAILS, external_ids: { imdb_id: null } },
      }))
      expect(await call('tmdb_open_imdb', { movie_id: DUNE.id })).toMatchObject({
        error: { code: 'no_imdb_id' },
      })
    })

    it('propaga el error de la ficha', async () => {
      const { call } = setup()
      expect(await call('tmdb_open_imdb', { movie_id: 1 })).toMatchObject({ ok: false })
    })
  })
})
