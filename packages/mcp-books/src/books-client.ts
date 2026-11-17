import type { ApiClient, ApiResult } from '@agichat/mcp-kit'

/**
 * Acceso a la API de Google Books. La clave es opcional: sin ella la API
 * responde igual, con un cupo mas bajo compartido por IP.
 */

export interface BooksClientOptions {
  readonly api: ApiClient
  readonly apiKey?: string
  readonly baseUrl?: string
}

export class BooksClient {
  readonly #api: ApiClient
  readonly #apiKey: string | undefined
  readonly #baseUrl: string

  constructor(options: BooksClientOptions) {
    this.#api = options.api
    this.#apiKey = options.apiKey
    this.#baseUrl = options.baseUrl ?? 'https://www.googleapis.com/books/v1'
  }

  searchByTitle(title: string): Promise<ApiResult> {
    const search = new URLSearchParams({
      q: `intitle:"${title.replace(/"/g, '')}"`,
      printType: 'books',
      maxResults: '15',
      orderBy: 'relevance',
    })
    return this.#get('/volumes', search)
  }

  volume(volumeId: string): Promise<ApiResult> {
    return this.#get(`/volumes/${encodeURIComponent(volumeId)}`, new URLSearchParams())
  }

  #get(path: string, search: URLSearchParams): Promise<ApiResult> {
    const cacheKey = `${path}?${search.toString()}`
    if (this.#apiKey !== undefined) search.set('key', this.#apiKey)
    const query = search.toString()
    return this.#api.getJson(cacheKey, `${this.#baseUrl}${path}${query === '' ? '' : `?${query}`}`)
  }
}
