import type { BookSummary } from './book-parser.js'

/**
 * Decide cual de los resultados de Google Books es "el libro de la pelicula".
 *
 * Buscar por titulo devuelve de todo: la novela original, guias de estudio,
 * el guion publicado, libros de arte de la produccion y novelizaciones
 * escritas despues del estreno. Para comparar pelicula contra libro solo
 * sirve la obra original, asi que se puntua cada candidato y se exige una
 * coincidencia real de titulo.
 */

export interface MovieReference {
  readonly title: string
  readonly originalTitle?: string
  readonly releaseYear?: number
}

export interface BookMatch {
  readonly book: BookSummary
  readonly score: number
}

const DERIVATIVE_WORK =
  /\b(screenplay|guion|shooting script|making of|art of|movie tie-in|study guide|guia de estudio|sparknotes|cliffsnotes|summary|resumen|analysis|analisis|companion|coloring|colorear|notebook|trivia|quiz)\b/

const MIN_SCORE = 3

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Quita lo que va entre parentesis o corchetes: suele ser la serie o la
 * edicion ("Dune (Las cronicas de Dune 1)"), no parte del nombre de la obra.
 */
function baseTitle(title: string): string {
  return normalizeTitle(title.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))
}

/**
 * Que tanto se parece el titulo del libro al de la pelicula. Los niveles
 * salieron de resultados reales de Google Books: para "Dune" aparecen la
 * novela original (sin calificaciones), precuelas de otros autores como
 * "Dune: The Butlerian Jihad" (con calificaciones) y secuelas como
 * "Children of Dune". El titulo identico tiene que pesar mas que cualquier
 * otro desempate, o gana el libro equivocado de la saga.
 */
function titleScore(bookTitle: string, movieTitle: string): number {
  if (movieTitle === '') return 0
  const full = baseTitle(bookTitle)
  if (full === movieTitle) return 5
  // Mismo nombre con subtitulo: puede ser una edicion de la obra o otro libro
  // de la saga ("Eragon: Book I" frente a "Dune: House Corrino").
  const mainTitle = baseTitle(bookTitle.split(':')[0] ?? bookTitle)
  if (mainTitle === movieTitle) return 3
  // Solo contiene el nombre: casi siempre es otra obra de la saga.
  if (full.startsWith(`${movieTitle} `) || full.endsWith(` ${movieTitle}`)) return 2
  return 0
}

export function scoreBook(book: BookSummary, movie: MovieReference): number {
  const titles = [movie.title, movie.originalTitle ?? ''].map(normalizeTitle)
  let score = Math.max(...titles.map((title) => titleScore(book.title, title)))
  if (score === 0) return 0

  // Un guion o una guia en el titulo nunca es "el libro de la pelicula",
  // por mas que coincida el nombre. En la descripcion solo resta: una novela
  // puede mencionar de pasada su "companion" o su "summary".
  if (DERIVATIVE_WORK.test(normalizeTitle(book.title))) return 0
  if (DERIVATIVE_WORK.test(normalizeTitle(book.description.slice(0, 300)))) score -= 3

  if (movie.releaseYear !== undefined && book.publishedYear !== null) {
    // La obra original es anterior a la pelicula. Las reediciones tambien
    // pueden ser posteriores, asi que solo se premia, no se descarta.
    if (book.publishedYear <= movie.releaseYear) score += 1
  }
  if (book.averageRating !== null) score += 1
  if (book.authors.length === 0) score -= 1

  return score
}

/** Devuelve los candidatos validos, del mejor al peor. */
export function rankBooks(books: readonly BookSummary[], movie: MovieReference): BookMatch[] {
  return books
    .map((book) => ({ book, score: scoreBook(book, movie) }))
    .filter((match) => match.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.book.ratingsCount - a.book.ratingsCount)
}
