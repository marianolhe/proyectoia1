import { describe, expect, it } from 'vitest'
import { compareMovieWithBook, type ComparisonInput } from './compare.js'

const base: ComparisonInput = {
  movieTitle: 'Película',
  movieRating: 7.5,
  movieVoteCount: 1000,
  bookTitle: 'Libro',
  bookRating: 3.75,
  bookRatingsCount: 100,
}

describe('compareMovieWithBook', () => {
  it('lleva ambas calificaciones a escala de 10', () => {
    expect(compareMovieWithBook(base)).toMatchObject({
      movieScore: 7.5,
      bookScore: 7.5,
      difference: 0,
    })
  })

  it.each([
    // pelicula buena
    [7.5, 4.5, 'vale_la_pena_pero_el_libro_es_mejor', true],
    [8.4, 3.5, 'pelicula_supera_al_libro', true],
    [7.5, 3.9, 'ambos_valen_la_pena', true],
    // pelicula aceptable
    [6.2, 4.0, 'mejor_lee_el_libro', false],
    [6.5, 2.5, 'pelicula_supera_al_libro', true],
    [6.5, 3.5, 'ambos_valen_la_pena', true],
    // pelicula floja
    [5.1, 4.0, 'mejor_lee_el_libro', false],
    [4.5, 2.5, 'ninguno_destaca', false],
  ])('pelicula %d y libro %d: %s', (movieRating, bookRating, verdict, worthWatching) => {
    expect(compareMovieWithBook({ ...base, movieRating, bookRating })).toMatchObject({
      verdict,
      worthWatching,
    })
  })

  it('sin calificacion del libro decide solo con la pelicula', () => {
    const { bookRating: _rating, ...noBook } = base
    expect(compareMovieWithBook(noBook)).toMatchObject({
      bookScore: null,
      difference: null,
      verdict: 'sin_calificacion_del_libro',
      worthWatching: true,
      confidence: 'media',
    })
    expect(
      compareMovieWithBook({ ...noBook, movieRating: 5, movieVoteCount: 10, bookRating: 0 }),
    ).toMatchObject({ worthWatching: false, confidence: 'baja' })
  })

  it.each([
    [1000, 100, 'alta'],
    [200, 20, 'media'],
    [50, 100, 'baja'],
  ])('confianza con %d votos y %d calificaciones: %s', (movieVoteCount, count, confidence) => {
    expect(
      compareMovieWithBook({ ...base, movieVoteCount, bookRatingsCount: count }).confidence,
    ).toBe(confidence)
  })

  it('sin numero de calificaciones del libro la confianza es baja', () => {
    const { bookRatingsCount: _count, ...rest } = base
    expect(compareMovieWithBook(rest).confidence).toBe('baja')
  })

  it('el resumen nombra la pelicula y el libro', () => {
    for (const rating of [8.4, 7.5, 6.2, 4.5]) {
      for (const book of [2.5, 3.75, 4.5]) {
        const { summary } = compareMovieWithBook({ ...base, movieRating: rating, bookRating: book })
        expect(summary).toContain('"Película"')
        expect(summary).toContain('"Libro"')
      }
    }
  })
})
