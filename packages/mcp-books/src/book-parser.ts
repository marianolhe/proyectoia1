/**
 * Traduccion de los volumenes de Google Books a los datos que ve el agente.
 * Igual que en TMDB: se valida campo por campo y se manda solo lo necesario.
 */

export interface BookSummary {
  readonly id: string
  readonly title: string
  readonly authors: readonly string[]
  readonly publishedYear: number | null
  readonly description: string
  /** Promedio de Google Books, de 0 a 5. `null` si nadie lo ha calificado. */
  readonly averageRating: number | null
  readonly ratingsCount: number
  readonly pageCount: number | null
  readonly googleBooksUrl: string
}

const VOLUME_ID = /^[A-Za-z0-9_-]{6,24}$/

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function isVolumeId(value: unknown): value is string {
  return typeof value === 'string' && VOLUME_ID.test(value)
}

/**
 * La URL se arma con el identificador validado. `infoLink` viene en la
 * respuesta, pero no se usa: una pestania que se abre sola no puede depender
 * de una URL que escribio otro.
 */
export function googleBooksUrlFor(volumeId: string): string {
  return `https://books.google.com/books?id=${volumeId}`
}

/** Las descripciones de la ficha individual traen etiquetas HTML. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function parseBook(raw: unknown): BookSummary | null {
  if (!isObject(raw) || !isVolumeId(raw.id) || !isObject(raw.volumeInfo)) return null
  const info = raw.volumeInfo
  const title = text(info.title)
  if (title === '') return null

  const subtitle = text(info.subtitle)
  const yearMatch = /^(\d{4})/.exec(text(info.publishedDate))
  const authors = Array.isArray(info.authors)
    ? info.authors.filter((author): author is string => typeof author === 'string')
    : []

  return {
    id: raw.id,
    title: subtitle === '' ? title : `${title}: ${subtitle}`,
    authors,
    publishedYear: yearMatch?.[1] === undefined ? null : Number(yearMatch[1]),
    description: stripHtml(text(info.description)),
    averageRating: positiveNumber(info.averageRating),
    ratingsCount: positiveNumber(info.ratingsCount) ?? 0,
    pageCount: positiveNumber(info.pageCount),
    googleBooksUrl: googleBooksUrlFor(raw.id),
  }
}

export function parseBookList(raw: unknown): BookSummary[] {
  if (!isObject(raw) || !Array.isArray(raw.items)) return []
  return raw.items.map(parseBook).filter((book): book is BookSummary => book !== null)
}
