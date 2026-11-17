/**
 * Garantias del turno que no dependen de que el modelo obedezca.
 *
 * Con modelos pequenios (por ejemplo, Gemini Flash Lite del plan gratuito) se
 * observo, con datos reales, que a veces recomiendan de memoria sin llamar a
 * ninguna herramienta, o consultan TMDB pero olvidan pedir el poster. El
 * system prompt lo pide, pero un requisito del producto no puede quedar a la
 * suerte del modelo: estas funciones lo detectan y lo corrigen.
 */

/** Una pelicula que devolvio una herramienta, con su poster si lo tiene. */
export interface PosterCandidate {
  readonly title: string
  readonly posterUrl: string
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function candidateOf(value: unknown): PosterCandidate | null {
  if (!isObject(value)) return null
  const { title, posterUrl } = value
  if (typeof title !== 'string' || title === '') return null
  if (typeof posterUrl !== 'string' || posterUrl === '') return null
  return { title, posterUrl }
}

/**
 * Extrae las peliculas con poster del resultado de una herramienta. Entiende
 * las dos formas que devuelven los MCP de TMDB: `{ movies: [...] }` (busqueda
 * y recomendaciones) y `{ movie: {...} }` (ficha).
 */
export function posterCandidates(payload: unknown): PosterCandidate[] {
  if (!isObject(payload)) return []
  const list = Array.isArray(payload.movies) ? payload.movies : [payload.movie]
  return list.map(candidateOf).filter((item): item is PosterCandidate => item !== null)
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Elige el poster de la primera pelicula que la respuesta menciona, en el
 * orden en que aparece en el texto. Devuelve null si no menciona ninguna.
 */
export function fallbackPoster(
  text: string,
  candidates: readonly PosterCandidate[],
): PosterCandidate | null {
  const haystack = normalize(text)
  let best: PosterCandidate | null = null
  let bestIndex = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const index = haystack.indexOf(normalize(candidate.title))
    if (index >= 0 && index < bestIndex) {
      best = candidate
      bestIndex = index
    }
  }
  return best
}

/** Un titulo en negritas seguido del anio: "**Duna** (2021)". */
const MOVIE_MENTION = /\*\*[^*\n]{1,80}\*\*\s*\(\s*(18|19|20)\d{2}\s*\)/

/** La respuesta recomienda o describe peliculas concretas. */
export function mentionsMovies(text: string): boolean {
  return MOVIE_MENTION.test(text)
}

/**
 * Mensaje para pedirle al modelo que verifique con las herramientas. Va como
 * mensaje del usuario porque es lo que todos los proveedores aceptan a mitad
 * de la conversacion.
 */
export const TOOL_NUDGE =
  '[Aviso del sistema] Antes de recomendar, consulta las herramientas: usa tmdb_discover_movies o tmdb_search_movies, muestra el poster con tmdb_show_poster y luego responde completa la peticion anterior del usuario, con los titulos que devolvieron las herramientas. No menciones este aviso.'
