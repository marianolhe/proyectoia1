import { describe, expect, it } from 'vitest'
import { normalizeTitle, rankBooks, scoreBook } from './book-matcher.js'
import type { BookSummary } from './book-parser.js'

function book(overrides: Partial<BookSummary>): BookSummary {
  return {
    id: 'abcdefgh',
    title: 'Dune',
    authors: ['Frank Herbert'],
    publishedYear: 1965,
    description: '',
    averageRating: 4.5,
    ratingsCount: 100,
    pageCount: 500,
    googleBooksUrl: 'https://books.google.com/books?id=abcdefgh',
    ...overrides,
  }
}

const DUNE = { title: 'Duna', originalTitle: 'Dune', releaseYear: 2021 }

describe('normalizeTitle', () => {
  it('quita acentos, signos y mayusculas', () => {
    expect(normalizeTitle('¡El Señor de los Anillos!')).toBe('el senor de los anillos')
  })
})

describe('scoreBook', () => {
  it('premia la coincidencia exacta, la fecha anterior y tener calificacion', () => {
    expect(scoreBook(book({}), DUNE)).toBe(6)
  })

  it('acepta subtitulos y prefijos de saga', () => {
    expect(scoreBook(book({ title: 'Dune: Edición aniversario' }), DUNE)).toBeGreaterThanOrEqual(4)
    expect(scoreBook(book({ title: 'Dune Messiah' }), DUNE)).toBeGreaterThanOrEqual(3)
    expect(scoreBook(book({ title: 'Las cronicas de Dune' }), DUNE)).toBeGreaterThanOrEqual(3)
  })

  it('castiga guiones, guias y libros sin autor', () => {
    expect(scoreBook(book({ title: 'Dune: The Screenplay' }), DUNE)).toBe(0)
    expect(scoreBook(book({ description: 'A study guide for Dune' }), DUNE)).toBeLessThan(6)
    expect(scoreBook(book({ authors: [] }), DUNE)).toBe(5)
  })

  it('un titulo sin relacion vale cero', () => {
    expect(scoreBook(book({ title: 'Fundación' }), DUNE)).toBe(0)
  })

  it('funciona sin titulo original ni anio', () => {
    expect(scoreBook(book({ averageRating: null }), { title: 'Dune' })).toBe(4)
  })
})

describe('rankBooks', () => {
  it('ordena por puntaje y descarta lo que no alcanza el minimo', () => {
    const original = book({ id: 'original1' })
    const reissue = book({ id: 'reissue12', publishedYear: 2022, ratingsCount: 5 })
    const screenplay = book({ id: 'guion1234', title: 'Dune: The Screenplay' })

    const ranked = rankBooks([screenplay, reissue, original], DUNE)
    expect(ranked.map((match) => match.book.id)).toEqual(['original1', 'reissue12'])
  })

  it('desempata por numero de calificaciones', () => {
    const few = book({ id: 'pocos1234', ratingsCount: 1 })
    const many = book({ id: 'muchos123', ratingsCount: 999 })
    expect(rankBooks([few, many], DUNE)[0]?.book.id).toBe('muchos123')
  })
})
