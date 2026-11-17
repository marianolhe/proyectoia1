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
    expect(scoreBook(book({}), DUNE)).toBe(7)
  })

  it('ignora la serie entre parentesis y prefiere el titulo identico', () => {
    expect(scoreBook(book({ title: 'Dune (Las crónicas de Dune 1)' }), DUNE)).toBe(7)
    expect(scoreBook(book({ title: 'Dune: Edición aniversario' }), DUNE)).toBe(5)
    expect(scoreBook(book({ title: 'Dune Messiah' }), DUNE)).toBe(4)
    expect(scoreBook(book({ title: 'Las cronicas de Dune' }), DUNE)).toBe(4)
  })

  it('castiga guiones, guias y libros sin autor', () => {
    expect(scoreBook(book({ title: 'Dune: The Screenplay' }), DUNE)).toBe(0)
    expect(scoreBook(book({ description: 'A study guide for Dune' }), DUNE)).toBeLessThan(6)
    expect(scoreBook(book({ authors: [] }), DUNE)).toBe(6)
  })

  it('un titulo sin relacion vale cero', () => {
    expect(scoreBook(book({ title: 'Fundación' }), DUNE)).toBe(0)
  })

  it('funciona sin titulo original ni anio', () => {
    expect(scoreBook(book({ averageRating: null }), { title: 'Dune' })).toBe(5)
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

  it('con datos reales de Google Books elige la novela original y no una precuela', () => {
    // Resultados reales para intitle:"Dune": la novela de Frank Herbert no trae
    // calificaciones; las precuelas de otros autores si.
    const candidates = [
      book({
        id: 'aJHCDgAAQBAJ',
        title: 'Dune (Las crónicas de Dune 1)',
        publishedYear: 2017,
        averageRating: null,
        ratingsCount: 0,
      }),
      book({
        id: '--8cBYaNlA4C',
        title: 'Dune: House Corrino',
        authors: ['Brian Herbert', 'Kevin J. Anderson'],
        publishedYear: 2002,
        averageRating: 3,
        ratingsCount: 1,
      }),
      book({
        id: 'AmYjHd_o5_4C',
        title: 'Dune: The Butlerian Jihad',
        authors: ['Brian Herbert', 'Kevin J. Anderson'],
        publishedYear: 2002,
        averageRating: 4,
        ratingsCount: 2,
      }),
      book({
        id: 'RxxwnkPHlfEC',
        title: 'Children of Dune',
        publishedYear: 2008,
        averageRating: 4.5,
        ratingsCount: 8,
      }),
    ]
    expect(rankBooks(candidates, DUNE)[0]?.book.id).toBe('aJHCDgAAQBAJ')
  })

  it('desempata por numero de calificaciones', () => {
    const few = book({ id: 'pocos1234', ratingsCount: 1 })
    const many = book({ id: 'muchos123', ratingsCount: 999 })
    expect(rankBooks([few, many], DUNE)[0]?.book.id).toBe('muchos123')
  })
})
