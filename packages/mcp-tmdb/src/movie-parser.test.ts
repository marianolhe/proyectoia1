import { describe, expect, it } from 'vitest'
import {
  imdbUrlFor,
  parseMovieDetails,
  parseMovieList,
  parseMovieSummary,
  posterUrlFor,
} from './movie-parser.js'

const DUNE = {
  id: 438631,
  title: 'Duna',
  original_title: 'Dune',
  release_date: '2021-09-15',
  overview: 'Paul Atreides...',
  vote_average: 7.789,
  vote_count: 12000,
  poster_path: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
}

describe('posterUrlFor e imdbUrlFor', () => {
  it('arman la URL a partir de identificadores validos', () => {
    expect(posterUrlFor('/abc_D-1.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc_D-1.jpg')
    expect(imdbUrlFor('tt1160419')).toBe('https://www.imdb.com/title/tt1160419/')
  })

  it.each([null, 42, 'abc.jpg', '/../../evil.jpg', '/a.jpg?x=1', '/a.exe'])(
    'rechazan un poster_path invalido: %j',
    (path) => {
      expect(posterUrlFor(path)).toBeNull()
    },
  )

  it.each([null, '', '1160419', 'tt12', 'tt1160419/../x', 'https://evil.example'])(
    'rechazan un imdb_id invalido: %j',
    (id) => {
      expect(imdbUrlFor(id)).toBeNull()
    },
  )
})

describe('parseMovieSummary', () => {
  it('extrae solo lo necesario y redondea la calificacion', () => {
    expect(parseMovieSummary({ ...DUNE, adult: false, popularity: 99 })).toEqual({
      id: 438631,
      title: 'Duna',
      originalTitle: 'Dune',
      year: 2021,
      overview: 'Paul Atreides...',
      voteAverage: 7.8,
      voteCount: 12000,
      posterUrl: 'https://image.tmdb.org/t/p/w342/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
    })
  })

  it('tolera campos ausentes o con otro tipo', () => {
    expect(parseMovieSummary({ id: 1, title: 'X', vote_average: 'diez' })).toEqual({
      id: 1,
      title: 'X',
      originalTitle: 'X',
      year: null,
      overview: '',
      voteAverage: 0,
      voteCount: 0,
      posterUrl: null,
    })
  })

  it.each([null, [], 'texto', { id: '1', title: 'X' }, { id: 1, title: '' }])(
    'descarta lo que no es una pelicula: %j',
    (raw) => {
      expect(parseMovieSummary(raw)).toBeNull()
    },
  )
})

describe('parseMovieList', () => {
  it('filtra resultados invalidos y respeta el limite', () => {
    const raw = { results: [DUNE, { nada: true }, { ...DUNE, id: 2 }, { ...DUNE, id: 3 }] }
    expect(parseMovieList(raw, 2).map((movie) => movie.id)).toEqual([438631, 2])
  })

  it('devuelve una lista vacia si la forma no es la esperada', () => {
    expect(parseMovieList({ results: 'x' }, 5)).toEqual([])
    expect(parseMovieList(null, 5)).toEqual([])
  })
})

describe('parseMovieDetails', () => {
  const details = {
    ...DUNE,
    runtime: 155,
    tagline: 'Más allá del miedo',
    genres: [{ id: 878, name: 'Ciencia ficción' }, { id: 12 }],
    external_ids: { imdb_id: 'tt1160419' },
    keywords: { keywords: [{ name: 'based on novel or book' }, { name: 'desert' }] },
  }

  it('incluye IMDb, generos y si esta basada en un libro', () => {
    expect(parseMovieDetails(details)).toMatchObject({
      genres: ['Ciencia ficción'],
      runtimeMinutes: 155,
      tagline: 'Más allá del miedo',
      imdbId: 'tt1160419',
      imdbUrl: 'https://www.imdb.com/title/tt1160419/',
      tmdbUrl: 'https://www.themoviedb.org/movie/438631',
      basedOnBook: true,
    })
  })

  it('usa imdb_id de la raiz si no vino external_ids', () => {
    const { external_ids: _ids, ...rest } = details
    expect(parseMovieDetails({ ...rest, imdb_id: 'tt1160419' })?.imdbId).toBe('tt1160419')
  })

  it('sin palabras clave ni IMDb valido', () => {
    expect(
      parseMovieDetails({ ...DUNE, runtime: 0, external_ids: { imdb_id: 'mal' }, keywords: [] }),
    ).toMatchObject({
      runtimeMinutes: null,
      imdbId: null,
      imdbUrl: null,
      basedOnBook: false,
      genres: [],
    })
  })

  it('descarta lo que no es una ficha', () => {
    expect(parseMovieDetails({ title: 'sin id' })).toBeNull()
  })
})
