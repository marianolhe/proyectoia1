import { describe, expect, it } from 'vitest'
import { googleBooksUrlFor, isVolumeId, parseBook, parseBookList } from './book-parser.js'
import { DUNE_BOOK, DUNE_SCREENPLAY } from './testing/fake-books.js'

describe('isVolumeId y googleBooksUrlFor', () => {
  it('acepta identificadores reales y arma la URL', () => {
    expect(isVolumeId('B1hSG45JCX4C')).toBe(true)
    expect(googleBooksUrlFor('B1hSG45JCX4C')).toBe('https://books.google.com/books?id=B1hSG45JCX4C')
  })

  it.each(['', 'abc', 'id con espacios', 'x"><script>', 'a'.repeat(30), 42])(
    'rechaza %j',
    (value) => {
      expect(isVolumeId(value)).toBe(false)
    },
  )
})

describe('parseBook', () => {
  it('extrae los datos y limpia el HTML de la descripcion', () => {
    expect(parseBook(DUNE_BOOK)).toEqual({
      id: 'B1hSG45JCX4C',
      title: 'Dune',
      authors: ['Frank Herbert'],
      publishedYear: 1965,
      description: 'La novela de ciencia ficción más vendida.',
      averageRating: 4.5,
      ratingsCount: 3100,
      pageCount: 688,
      googleBooksUrl: 'https://books.google.com/books?id=B1hSG45JCX4C',
    })
  })

  it('une titulo y subtitulo y tolera campos ausentes', () => {
    expect(parseBook(DUNE_SCREENPLAY)).toMatchObject({
      title: 'Dune: The Screenplay',
      publishedYear: 2021,
      description: '',
      averageRating: null,
      ratingsCount: 0,
      pageCount: null,
    })
  })

  it('ignora autores que no son texto y entidades HTML', () => {
    const book = parseBook({
      id: 'abcdefgh',
      volumeInfo: { title: 'X', authors: ['A', 3], description: 'uno &amp; dos&#39;s' },
    })
    expect(book?.authors).toEqual(['A'])
    expect(book?.description).toBe('uno dos s')
  })

  it.each([
    null,
    { id: 'abcdefgh' },
    { id: 'mal', volumeInfo: { title: 'X' } },
    { id: 'abcdefgh', volumeInfo: { title: '' } },
  ])('descarta %j', (raw) => {
    expect(parseBook(raw)).toBeNull()
  })
})

describe('parseBookList', () => {
  it('filtra volumenes invalidos', () => {
    expect(parseBookList({ items: [DUNE_BOOK, { basura: 1 }] })).toHaveLength(1)
  })

  it('sin items devuelve una lista vacia', () => {
    expect(parseBookList({ totalItems: 0 })).toEqual([])
    expect(parseBookList(null)).toEqual([])
  })
})
