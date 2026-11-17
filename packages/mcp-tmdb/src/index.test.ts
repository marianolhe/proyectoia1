import { describe, expect, it } from 'vitest'
import * as api from './index.js'

describe('API publica de @agichat/mcp-tmdb', () => {
  it('expone el servidor, el cliente, las herramientas y los parsers', () => {
    expect(Object.keys(api).sort()).toEqual([
      'GENRE_IDS',
      'GENRE_NAMES',
      'TmdbClient',
      'createTmdbServerFactory',
      'createTmdbTools',
      'imdbUrlFor',
      'loadTmdbConfig',
      'parseMovieDetails',
      'parseMovieList',
      'parseMovieSummary',
      'posterUrlFor',
    ])
  })

  it('cada genero tiene un identificador numerico de TMDB', () => {
    expect(api.GENRE_NAMES).toHaveLength(Object.keys(api.GENRE_IDS).length)
    for (const id of Object.values(api.GENRE_IDS)) expect(Number.isInteger(id)).toBe(true)
  })
})
