/**
 * Cache en memoria con vencimiento.
 *
 * TMDB y Google Books dan 1,000 requests diarias en el plan gratuito. La
 * ficha de una pelicula no cambia de un minuto a otro, asi que repetir la
 * misma consulta es gasto puro. La interfaz es deliberadamente pequenia para
 * que el dia que haya varias replicas se sustituya por Redis sin tocar las
 * herramientas.
 */

export interface CacheOptions {
  readonly ttlMs: number
  /** Tope de entradas; al llenarse se descarta la mas antigua. */
  readonly maxEntries?: number
  readonly now?: () => number
}

interface Entry<V> {
  readonly value: V
  readonly expiresAt: number
}

export class TtlCache<V> {
  readonly #entries = new Map<string, Entry<V>>()
  readonly #inFlight = new Map<string, Promise<V>>()
  readonly #ttlMs: number
  readonly #maxEntries: number
  readonly #now: () => number

  constructor(options: CacheOptions) {
    this.#ttlMs = options.ttlMs
    this.#maxEntries = options.maxEntries ?? 500
    this.#now = options.now ?? (() => Date.now())
  }

  get size(): number {
    return this.#entries.size
  }

  get(key: string): V | undefined {
    const entry = this.#entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V): void {
    // Reinsertar mueve la clave al final: Map conserva el orden de insercion,
    // asi que la primera clave siempre es la mas antigua.
    this.#entries.delete(key)
    this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs })
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value
      if (oldest === undefined) break
      this.#entries.delete(oldest)
    }
  }

  /**
   * Devuelve el valor en cache o lo carga una sola vez. Dos peticiones
   * simultaneas por la misma clave comparten la misma llamada a la API.
   * `shouldCache` permite no guardar respuestas de error.
   */
  async getOrLoad(
    key: string,
    load: () => Promise<V>,
    shouldCache: (value: V) => boolean = () => true,
  ): Promise<V> {
    const cached = this.get(key)
    if (cached !== undefined) return cached

    const pending = this.#inFlight.get(key)
    if (pending !== undefined) return pending

    const promise = load()
      .then((value) => {
        if (shouldCache(value)) this.set(key, value)
        return value
      })
      .finally(() => {
        this.#inFlight.delete(key)
      })
    this.#inFlight.set(key, promise)
    return promise
  }
}
