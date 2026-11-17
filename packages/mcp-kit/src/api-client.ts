import { DailyBudget } from './daily-budget.js'
import { TtlCache } from './ttl-cache.js'

/**
 * Cliente HTTP comun para las APIs externas: cache, presupuesto diario,
 * tiempo limite y errores como valores.
 *
 * Los fallos se devuelven como resultado y no como excepcion porque quien
 * llama es una herramienta MCP: un error esperable (sin cupo, API caida) debe
 * llegar al agente como dato que pueda explicar al usuario.
 */

export type ApiErrorCode = 'budget_exhausted' | 'timeout' | 'network' | 'http' | 'invalid_json'

export type ApiResult =
  | { readonly ok: true; readonly data: unknown }
  | {
      readonly ok: false
      readonly code: ApiErrorCode
      readonly status?: number
      readonly message: string
    }

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface ApiClientOptions {
  /** Nombre de la API para los mensajes de error. */
  readonly name: string
  readonly headers?: Record<string, string>
  readonly fetch?: FetchLike
  readonly cache?: TtlCache<ApiResult>
  readonly budget?: DailyBudget
  readonly timeoutMs?: number
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000
const DEFAULT_DAILY_LIMIT = 1000
const DEFAULT_TIMEOUT_MS = 8000

export class ApiClient {
  readonly #name: string
  readonly #headers: Record<string, string>
  readonly #fetch: FetchLike
  readonly #cache: TtlCache<ApiResult>
  readonly #budget: DailyBudget
  readonly #timeoutMs: number

  constructor(options: ApiClientOptions) {
    this.#name = options.name
    this.#headers = { accept: 'application/json', ...options.headers }
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init))
    this.#cache = options.cache ?? new TtlCache<ApiResult>({ ttlMs: DEFAULT_TTL_MS })
    this.#budget = options.budget ?? new DailyBudget({ limit: DEFAULT_DAILY_LIMIT })
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  get remainingBudget(): number {
    return this.#budget.remaining
  }

  /**
   * `cacheKey` se pasa aparte de la URL porque la URL puede llevar la clave de
   * la API como parametro, y un secreto no debe usarse como llave de nada.
   */
  getJson(cacheKey: string, url: string): Promise<ApiResult> {
    return this.#cache.getOrLoad(
      cacheKey,
      () => this.#request(url),
      // Un 404 es una respuesta estable; un fallo de red o de cupo no.
      (result) => result.ok || (result.code === 'http' && result.status === 404),
    )
  }

  async #request(url: string): Promise<ApiResult> {
    if (!this.#budget.tryConsume()) {
      return {
        ok: false,
        code: 'budget_exhausted',
        message: `Se agoto el cupo diario de consultas a ${this.#name}. Intente de nuevo maniana.`,
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs)
    try {
      const response = await this.#fetch(url, {
        headers: this.#headers,
        signal: controller.signal,
      })
      if (!response.ok) {
        return {
          ok: false,
          code: 'http',
          status: response.status,
          message: `${this.#name} respondio con el estado ${response.status}.`,
        }
      }
      try {
        return { ok: true, data: await response.json() }
      } catch {
        return {
          ok: false,
          code: 'invalid_json',
          message: `${this.#name} devolvio algo que no es JSON.`,
        }
      }
    } catch {
      return controller.signal.aborted
        ? { ok: false, code: 'timeout', message: `${this.#name} tardo demasiado en responder.` }
        : { ok: false, code: 'network', message: `No se pudo contactar a ${this.#name}.` }
    } finally {
      clearTimeout(timer)
    }
  }
}
