/**
 * Traduccion de las respuestas de TMDB a los datos que ve el agente.
 *
 * Se valida campo por campo en lugar de castear: lo que llega es de un tercero
 * y, ademas, el agente solo necesita una fraccion de cada ficha. Mandar menos
 * texto al modelo gasta menos tokens y deja menos superficie para una
 * inyeccion escondida en un campo que nadie usa.
 */

export interface MovieSummary {
  readonly id: number
  readonly title: string
  readonly originalTitle: string
  readonly year: number | null
  readonly overview: string
  /** Promedio de votos de TMDB, de 0 a 10. */
  readonly voteAverage: number
  readonly voteCount: number
  readonly posterUrl: string | null
}

export interface MovieDetails extends MovieSummary {
  readonly genres: readonly string[]
  readonly runtimeMinutes: number | null
  readonly tagline: string
  readonly imdbId: string | null
  readonly imdbUrl: string | null
  readonly tmdbUrl: string
  /** TMDB etiqueta las adaptaciones con palabras clave como "based on novel or book". */
  readonly basedOnBook: boolean
}

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342'
const POSTER_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/
const IMDB_ID = /^tt\d{6,10}$/
const BOOK_KEYWORD = /based on .*(novel|book|short story|novella|memoir|autobiography)/i

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function posterUrlFor(posterPath: unknown): string | null {
  return typeof posterPath === 'string' && POSTER_PATH.test(posterPath)
    ? `${POSTER_BASE}${posterPath}`
    : null
}

export function imdbUrlFor(imdbId: unknown): string | null {
  return typeof imdbId === 'string' && IMDB_ID.test(imdbId)
    ? `https://www.imdb.com/title/${imdbId}/`
    : null
}

function yearOf(releaseDate: unknown): number | null {
  const match = /^(\d{4})-/.exec(text(releaseDate))
  return match?.[1] === undefined ? null : Number(match[1])
}

export function parseMovieSummary(raw: unknown): MovieSummary | null {
  if (!isObject(raw) || typeof raw.id !== 'number' || text(raw.title) === '') return null
  return {
    id: raw.id,
    title: text(raw.title),
    originalTitle: text(raw.original_title) || text(raw.title),
    year: yearOf(raw.release_date),
    overview: text(raw.overview),
    voteAverage: Math.round(number(raw.vote_average) * 10) / 10,
    voteCount: number(raw.vote_count),
    posterUrl: posterUrlFor(raw.poster_path),
  }
}

export function parseMovieList(raw: unknown, limit: number): MovieSummary[] {
  if (!isObject(raw) || !Array.isArray(raw.results)) return []
  return raw.results
    .map(parseMovieSummary)
    .filter((movie): movie is MovieSummary => movie !== null)
    .slice(0, limit)
}

function namesOf(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return list.map((item) => (isObject(item) ? text(item.name) : '')).filter((name) => name !== '')
}

export function parseMovieDetails(raw: unknown): MovieDetails | null {
  const summary = parseMovieSummary(raw)
  if (summary === null || !isObject(raw)) return null

  const externalIds = isObject(raw.external_ids) ? raw.external_ids : {}
  const imdbCandidate = externalIds.imdb_id ?? raw.imdb_id
  const imdbUrl = imdbUrlFor(imdbCandidate)
  const keywords = isObject(raw.keywords) ? namesOf(raw.keywords.keywords) : []

  return {
    ...summary,
    genres: namesOf(raw.genres),
    runtimeMinutes: typeof raw.runtime === 'number' && raw.runtime > 0 ? raw.runtime : null,
    tagline: text(raw.tagline),
    imdbId: imdbUrl === null ? null : text(imdbCandidate),
    imdbUrl,
    tmdbUrl: `https://www.themoviedb.org/movie/${summary.id}`,
    basedOnBook: keywords.some((keyword) => BOOK_KEYWORD.test(keyword)),
  }
}
