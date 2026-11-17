import { describe, expect, it } from 'vitest'
import { fallbackPoster, mentionsMovies, posterCandidates } from './turn-checks.js'

const DUNE = { title: 'Duna', posterUrl: 'https://image.tmdb.org/t/p/w342/a.jpg' }
const NOTEBOOK = {
  title: 'Diario de una pasión',
  posterUrl: 'https://image.tmdb.org/t/p/w342/b.jpg',
}

describe('posterCandidates', () => {
  it('lee las listas de busqueda y la ficha individual', () => {
    expect(posterCandidates({ movies: [DUNE, { title: 'Sin poster', posterUrl: null }] })).toEqual([
      DUNE,
    ])
    expect(posterCandidates({ movie: NOTEBOOK })).toEqual([NOTEBOOK])
  })

  it('ignora resultados sin peliculas', () => {
    expect(posterCandidates(null)).toEqual([])
    expect(posterCandidates({ found: false })).toEqual([])
    expect(posterCandidates({ movies: ['x', { title: '' }] })).toEqual([])
  })
})

describe('fallbackPoster', () => {
  it('elige la primera pelicula mencionada, sin importar acentos ni mayusculas', () => {
    const text = 'Te recomiendo **DIARIO DE UNA PASION** (2004) y también **Duna** (2021).'
    expect(fallbackPoster(text, [DUNE, NOTEBOOK])).toEqual(NOTEBOOK)
  })

  it('devuelve null si la respuesta no menciona ninguna', () => {
    expect(fallbackPoster('¿Qué género te gusta?', [DUNE])).toBeNull()
  })
})

describe('mentionsMovies', () => {
  it('detecta un titulo en negritas con su anio', () => {
    expect(mentionsMovies('Te recomiendo **Diario de una pasión** (2004): una historia...')).toBe(
      true,
    )
    expect(mentionsMovies('**El origen** ( 2010 )')).toBe(true)
  })

  it('no confunde saludos ni negritas sin anio', () => {
    expect(mentionsMovies('¡Hola! Soy **Sofía**, tu asistente de cine.')).toBe(false)
    expect(mentionsMovies('Puedo comparar películas con libros.')).toBe(false)
  })
})
