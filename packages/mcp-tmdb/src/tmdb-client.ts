import type { ApiClient, ApiResult } from '@agichat/mcp-kit'

/**
 * Acceso a la API v3 de TMDB.
 *
 * Solo arma URLs y delega en `ApiClient`, que pone el cache y el cupo diario.
 * La credencial vive aqui y en ningun otro lado: nunca viaja al agente ni
 * aparece en el resultado de una herramienta.
 */

export interface TmdbClientOptions {
  readonly api: ApiClient
  /** Clave v3. Va como parametro de la URL; con token v4 se omite. */
  readonly apiKey?: string
  readonly language?: string
  readonly baseUrl?: string
}

export type DiscoverSort = 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc'

export interface DiscoverFilters {
  readonly genreId?: number
  readonly year?: number
  readonly minRating?: number
  readonly sortBy: DiscoverSort
}

type Params = Record<string, string | number | undefined>

export class TmdbClient {
  readonly #api: ApiClient
  readonly #apiKey: string | undefined
  readonly #language: string
  readonly #baseUrl: string

  constructor(options: TmdbClientOptions) {
    this.#api = options.api
    this.#apiKey = options.apiKey
    this.#language = options.language ?? 'es-MX'
    this.#baseUrl = options.baseUrl ?? 'https://api.themoviedb.org/3'
  }

  searchMovies(query: string, year?: number): Promise<ApiResult> {
    return this.#get('/search/movie', { query, year, include_adult: 'false' })
  }

  discoverMovies(filters: DiscoverFilters): Promise<ApiResult> {
    return this.#get('/discover/movie', {
      with_genres: filters.genreId,
      primary_release_year: filters.year,
      'vote_average.gte': filters.minRating,
      // Sin un minimo de votos, "mejor calificadas" devuelve peliculas con
      // un 10 puesto por tres personas.
      'vote_count.gte': 200,
      sort_by: filters.sortBy,
      include_adult: 'false',
    })
  }

  similarMovies(movieId: number): Promise<ApiResult> {
    return this.#get(`/movie/${movieId}/recommendations`, {})
  }

  /** Una sola peticion trae la ficha, el ID de IMDb y las palabras clave. */
  movieDetails(movieId: number): Promise<ApiResult> {
    return this.#get(`/movie/${movieId}`, { append_to_response: 'external_ids,keywords' })
  }

  #get(path: string, params: Params): Promise<ApiResult> {
    const search = new URLSearchParams({ language: this.#language })
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value))
    }
    search.sort()
    // La llave del cache se calcula antes de agregar la credencial: un
    // secreto no debe terminar como llave de nada.
    const cacheKey = `${path}?${search.toString()}`

    if (this.#apiKey !== undefined) search.set('api_key', this.#apiKey)
    return this.#api.getJson(cacheKey, `${this.#baseUrl}${path}?${search.toString()}`)
  }
}
