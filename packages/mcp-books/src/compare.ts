/**
 * Veredicto pelicula contra libro.
 *
 * Es logica determinista y no una opinion del modelo a proposito: la misma
 * pareja de calificaciones produce siempre el mismo veredicto, se puede probar
 * con casos de borde y cualquier otro agente que use este servidor obtiene la
 * misma respuesta. El modelo se limita a explicarlo con sus palabras.
 */

export interface ComparisonInput {
  readonly movieTitle: string
  /** Calificacion de TMDB, de 0 a 10. */
  readonly movieRating: number
  readonly movieVoteCount: number
  readonly bookTitle: string
  /** Calificacion de Google Books, de 0 a 5. Ausente si nadie lo ha calificado. */
  readonly bookRating?: number
  readonly bookRatingsCount?: number
}

export type Verdict =
  | 'pelicula_supera_al_libro'
  | 'ambos_valen_la_pena'
  | 'vale_la_pena_pero_el_libro_es_mejor'
  | 'mejor_lee_el_libro'
  | 'ninguno_destaca'
  | 'sin_calificacion_del_libro'

export type Confidence = 'alta' | 'media' | 'baja'

export interface Comparison {
  /** Ambas en escala de 0 a 10 para poder compararlas. */
  readonly movieScore: number
  readonly bookScore: number | null
  readonly difference: number | null
  readonly verdict: Verdict
  readonly worthWatching: boolean
  readonly confidence: Confidence
  readonly summary: string
}

const GOOD = 7
const ACCEPTABLE = 6
const CLEAR_GAP = 1
const WIDE_GAP = 1.5

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function confidenceOf(movieVotes: number, bookVotes: number | null): Confidence {
  if (bookVotes === null) return movieVotes >= 500 ? 'media' : 'baja'
  if (movieVotes >= 500 && bookVotes >= 50) return 'alta'
  if (movieVotes >= 100 && bookVotes >= 10) return 'media'
  return 'baja'
}

function decide(movie: number, book: number): { verdict: Verdict; worthWatching: boolean } {
  const gap = book - movie

  if (movie >= GOOD) {
    if (gap >= CLEAR_GAP)
      return { verdict: 'vale_la_pena_pero_el_libro_es_mejor', worthWatching: true }
    if (gap <= -CLEAR_GAP) return { verdict: 'pelicula_supera_al_libro', worthWatching: true }
    return { verdict: 'ambos_valen_la_pena', worthWatching: true }
  }
  if (movie >= ACCEPTABLE) {
    if (gap >= WIDE_GAP) return { verdict: 'mejor_lee_el_libro', worthWatching: false }
    if (gap <= -CLEAR_GAP) return { verdict: 'pelicula_supera_al_libro', worthWatching: true }
    return { verdict: 'ambos_valen_la_pena', worthWatching: true }
  }
  if (book >= GOOD) return { verdict: 'mejor_lee_el_libro', worthWatching: false }
  return { verdict: 'ninguno_destaca', worthWatching: false }
}

const SUMMARIES: Record<Verdict, (input: ComparisonInput) => string> = {
  pelicula_supera_al_libro: (i) =>
    `"${i.movieTitle}" esta mejor calificada que el libro "${i.bookTitle}". Vale la pena verla.`,
  ambos_valen_la_pena: (i) =>
    `"${i.movieTitle}" y el libro "${i.bookTitle}" tienen calificaciones parecidas. Vale la pena verla.`,
  vale_la_pena_pero_el_libro_es_mejor: (i) =>
    `"${i.movieTitle}" vale la pena, aunque el libro "${i.bookTitle}" esta mejor calificado.`,
  mejor_lee_el_libro: (i) =>
    `El libro "${i.bookTitle}" esta claramente mejor calificado que "${i.movieTitle}". Conviene mas leer el libro.`,
  ninguno_destaca: (i) =>
    `Ni "${i.movieTitle}" ni el libro "${i.bookTitle}" tienen buenas calificaciones. No es una prioridad.`,
  sin_calificacion_del_libro: (i) =>
    `Google Books no tiene calificaciones del libro "${i.bookTitle}", asi que el veredicto se basa solo en la pelicula.`,
}

export function compareMovieWithBook(input: ComparisonInput): Comparison {
  const movieScore = round(input.movieRating)
  const hasBookRating = input.bookRating !== undefined && input.bookRating > 0

  if (!hasBookRating) {
    return {
      movieScore,
      bookScore: null,
      difference: null,
      verdict: 'sin_calificacion_del_libro',
      worthWatching: movieScore >= 6.5,
      confidence: confidenceOf(input.movieVoteCount, null),
      summary: SUMMARIES.sin_calificacion_del_libro(input),
    }
  }

  const bookScore = round((input.bookRating as number) * 2)
  const { verdict, worthWatching } = decide(movieScore, bookScore)

  return {
    movieScore,
    bookScore,
    difference: round(movieScore - bookScore),
    verdict,
    worthWatching,
    confidence: confidenceOf(input.movieVoteCount, input.bookRatingsCount ?? 0),
    summary: SUMMARIES[verdict](input),
  }
}
